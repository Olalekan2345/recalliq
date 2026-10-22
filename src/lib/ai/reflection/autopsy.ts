/**
 * Agent Autopsy — evidence-based failure analysis.
 *
 * Inputs are structured facts (verification diagnoses, tool execution records,
 * payment outcomes, limits). Causes are only "confirmed" when the evidence
 * pins them down (e.g. a claimed amount off by exactly 10^9 from the on-chain
 * atomic amount); otherwise they stay hypotheses. Lessons are generated from
 * fixed templates + concrete evidence — never from an LLM asked to explain
 * itself. Trivial or repeated observations do not produce new memories.
 */
import type { FailureCategory, MemoryDirective } from "@/lib/db/schema";
import type { LessonCandidate } from "@/lib/memory/service";
import type { Assertion } from "@/lib/ai/verification/assertions";
import type { VerificationOutcome } from "@/lib/ai/verification/engine";
import { PAID_FORENSICS_TOOL_ID } from "@/lib/ai/tools/registry";

export interface AutopsyClaim {
  ref: string;
  statement: string;
  kind: string;
  evidenceRefs: string[];
  assertion?: Assertion;
  outcome: VerificationOutcome;
  verificationResultId: string;
}

export interface AutopsyToolExecution {
  id: string;
  toolId: string;
  status: string;
  errorCode: string | null;
  evidenceRefs: string[];
}

export interface AutopsyInput {
  run: { id: string; userId: string; taskCategory: string; isEvaluation: boolean };
  claims: AutopsyClaim[];
  toolExecutions: AutopsyToolExecution[];
  paid: { intentId: string; status: string; toolExecutionId: string | null } | null;
  limitsHit: boolean;
  /** The model stopped without a report even though no limit was reached. */
  noReport?: boolean;
  /** Values in the final answer that no evidence of the run supports (see verification/grounding). */
  ungroundedValues?: Array<{ kind: string; value: string }>;
  finalReportPresent: boolean;
  appliedDirectives: Array<{ directive: MemoryDirective; memoryRef: string; memoryId: string | null }>;
  /** Production timeouts per tool in the last 24h, including this run. */
  recentToolTimeouts: Record<string, number>;
}

export interface FailureDraft {
  category: FailureCategory;
  toolId: string | null;
  expectation: string;
  observed: string;
  objectivelyVerified: boolean;
  confirmedCause: string | null;
  hypotheses: string[];
  correctiveStrategy: string | null;
  correctionValidated: boolean;
  evidenceRefs: string[];
  verificationResultId: string | null;
  lesson: Omit<LessonCandidate, "sourceFailureId"> | null;
}

export interface AutopsyResult {
  failures: FailureDraft[];
  /** Positive lessons (validated strategies, useful paid analysis). */
  lessons: Array<Omit<LessonCandidate, "sourceFailureId">>;
  usefulToolExecutionIds: Set<string>;
  contradictedToolExecutionIds: Set<string>;
}

const DIRECTIVE_LESSONS: Record<string, { directive: MemoryDirective; summary: string; lesson: string; strategy: string }> = {
  decimal_scaling_error: {
    directive: "verify_coin_decimals",
    summary: "Token amount reported with the wrong decimal scaling",
    lesson:
      "Before stating any token amount, read the coin's decimals from chain metadata (GetCoinInfo via balance_change_analyzer) and convert atomic units with exact integer arithmetic; never assume a decimals value.",
    strategy: "Call balance_change_analyzer for the transaction and report its displayAmount (exact) alongside atomic units.",
  },
  direction_error: {
    directive: "confirm_balance_change_direction",
    summary: "Balance change direction (sent vs received) reported backwards",
    lesson:
      "Read the sign of each balance change for the specific address: negative means the address paid out, positive means it received. State direction only from the signed on-chain amount.",
    strategy: "Use balance_change_analyzer's `direction` field filtered to the address in question.",
  },
  status_misread: {
    directive: "check_status_before_amounts",
    summary: "Transaction execution status misreported",
    lesson:
      "Confirm execution status with transaction_outcome_verifier before describing effects; failed transactions still charge gas but their other balance changes did not happen as intended.",
    strategy: "Run transaction_outcome_verifier first and quote its verdict.",
  },
  attribution_error: {
    directive: "cross_check_sender",
    summary: "Transaction sender misattributed",
    lesson:
      "Attribute a transaction only to its on-chain sender (transaction.sender); recipients and counterparties appear in balance changes, not as the actor. Cross-check the sender before final reporting.",
    strategy: "Assert tx_sender in evidence_cross_checker before finalising.",
  },
  asset_confusion: {
    directive: "cite_evidence_for_every_fact",
    summary: "Amount attributed to the wrong coin type",
    lesson:
      "Match each amount to its exact coin type from the balance change record; tokens with similar symbols are different assets. Cite the evidence record for every amount.",
    strategy: "Quote coinType next to each amount and cite the evidence ref.",
  },
  unsupported_claim: {
    directive: "cite_evidence_for_every_fact",
    summary: "Factual claim made without checkable evidence",
    lesson:
      "Every claim presented as fact must cite an evidence record and carry a machine-checkable assertion; otherwise label it as interpretation or hypothesis.",
    strategy: "Attach assertions to factual claims or downgrade them to interpretation.",
  },
};

function claimDigest(a?: Assertion): string | null {
  return a && "digest" in a ? a.digest : null;
}

function categoryFor(c: AutopsyClaim): FailureCategory | null {
  const d = c.outcome.diagnosis;
  if (c.outcome.status === "CONTRADICTED") {
    switch (d?.kind) {
      case "power_of_ten":
        return "decimal_scaling_error";
      case "sign_flip":
        return "direction_error";
      case "status_mismatch":
        return "status_misread";
      case "sender_mismatch":
        return "attribution_error";
      case "asset_mismatch":
        return "asset_confusion";
      case "missing_on_chain":
      case "value_mismatch":
      default:
        return "unsupported_claim";
    }
  }
  if (c.outcome.status === "UNVERIFIED" && d?.kind === "no_assertion" && c.kind === "verified_fact") return "unsupported_claim";
  return null;
}

function toolExecutionsCiting(refs: string[], execs: AutopsyToolExecution[]): AutopsyToolExecution[] {
  return execs.filter((e) => e.evidenceRefs.some((r) => refs.includes(r)));
}

export function runAutopsy(input: AutopsyInput): AutopsyResult {
  const { run } = input;
  const failures: FailureDraft[] = [];
  const lessons: Array<Omit<LessonCandidate, "sourceFailureId">> = [];
  const lessonKeys = new Set<string>();
  const useful = new Set<string>();
  const contradicted = new Set<string>();

  for (const c of input.claims) {
    const citing = toolExecutionsCiting(c.evidenceRefs, input.toolExecutions);
    if (c.outcome.status === "VERIFIED" || c.outcome.status === "PARTIALLY_VERIFIED") citing.forEach((e) => useful.add(e.id));
    if (c.outcome.status === "CONTRADICTED") citing.forEach((e) => contradicted.add(e.id));

    const category = categoryFor(c);
    if (!category) continue;
    const tpl = DIRECTIVE_LESSONS[category];
    const digest = claimDigest(c.assertion);
    const obs = c.outcome.observed as Record<string, unknown> | null;
    const diag = c.outcome.diagnosis;

    let confirmedCause: string | null = null;
    const hypotheses: string[] = [];
    if (category === "decimal_scaling_error" && diag?.kind === "power_of_ten") {
      confirmedCause = `Claimed value differs from the on-chain atomic amount by exactly 10^${Math.abs(diag.exponent)}${diag.decimals !== null ? ` (coin decimals = ${diag.decimals})` : ""}.`;
    } else if (category === "direction_error") {
      confirmedCause = "Claimed amount is the exact negation of the on-chain balance change.";
    } else if (category === "status_misread" || category === "attribution_error") {
      confirmedCause = c.outcome.detail;
    } else if (category === "asset_confusion") {
      confirmedCause = "The address has balance changes in this transaction, but not for the claimed coin type.";
    } else {
      hypotheses.push("The claim was not grounded in a checkable on-chain record.");
    }

    const evidenceText = [
      `run ${run.id}`,
      digest ? `tx ${digest}` : null,
      `claim ${c.ref}: "${c.statement.slice(0, 160)}"`,
      `observed ${JSON.stringify(obs ?? {}).slice(0, 200)}`,
    ]
      .filter(Boolean)
      .join("; ");

    const failure: FailureDraft = {
      category,
      toolId: citing[0]?.toolId ?? null,
      expectation: c.statement.slice(0, 400),
      observed: c.outcome.detail.slice(0, 400),
      objectivelyVerified: c.outcome.status === "CONTRADICTED",
      confirmedCause,
      hypotheses,
      correctiveStrategy: tpl?.strategy ?? null,
      // The correct value was established from chain data during verification.
      correctionValidated: c.outcome.status === "CONTRADICTED" && obs !== null,
      evidenceRefs: c.evidenceRefs,
      verificationResultId: c.verificationResultId,
      lesson: null,
    };

    const key = `${tpl?.directive}|${run.taskCategory}`;
    if (tpl && !lessonKeys.has(key) && !run.isEvaluation && (confirmedCause || category === "unsupported_claim")) {
      lessonKeys.add(key);
      failure.lesson = {
        userId: run.userId,
        scope: "user",
        memoryType: "failure",
        taskCategory: run.taskCategory,
        relatedToolId: category === "decimal_scaling_error" || category === "direction_error" ? "balance_change_analyzer" : null,
        directive: tpl.directive,
        summary: tpl.summary,
        lesson: tpl.lesson,
        evidenceText,
        evidenceReferences: [
          { kind: "run", id: run.id },
          ...(digest ? [{ kind: "transaction" as const, id: digest }] : []),
          { kind: "verification", id: c.verificationResultId, label: c.ref },
        ],
        verificationStatus: c.outcome.status === "CONTRADICTED" ? "verified" : "unverified",
        sourceRunId: run.id,
        isEvaluation: run.isEvaluation,
      };
    }
    failures.push(failure);
  }
  const claimFailureCount = failures.length;

  // Answer text stating values that appear in no evidence of the run.
  const ungrounded = input.ungroundedValues ?? [];
  if (ungrounded.length) {
    const listed = ungrounded
      .slice(0, 6)
      .map((v) => `${v.kind} ${v.value}`)
      .join(", ");
    const failure: FailureDraft = {
      category: "unsupported_claim",
      toolId: null,
      expectation: "Every digest, address, date and amount in the answer comes from evidence gathered in the run",
      observed: `The final answer stated ${ungrounded.length} value(s) found in no evidence: ${listed}`.slice(0, 400),
      objectivelyVerified: true,
      confirmedCause: "The values appear in no tool output, request or payment record of this run.",
      hypotheses: [],
      correctiveStrategy: "Copy values exactly from tool output, or fetch evidence for them before stating them.",
      correctionValidated: false,
      evidenceRefs: [],
      verificationResultId: null,
      lesson: null,
    };
    const key = `cite_evidence_for_every_fact|${run.taskCategory}`;
    if (!lessonKeys.has(key) && !run.isEvaluation) {
      lessonKeys.add(key);
      failure.lesson = {
        userId: run.userId,
        scope: "user",
        memoryType: "failure",
        taskCategory: run.taskCategory,
        relatedToolId: null,
        directive: "cite_evidence_for_every_fact",
        summary: "Answer stated values that no gathered evidence supported",
        lesson:
          "Write every digest, address, UTC timestamp and amount into the answer exactly as a tool returned it during the investigation. A value that cannot be found in the run's evidence is rejected or flagged as unverified.",
        evidenceText: `run ${run.id}; values not in evidence: ${listed}`,
        evidenceReferences: [{ kind: "run", id: run.id }],
        verificationStatus: "verified",
        sourceRunId: run.id,
        isEvaluation: false,
      };
    }
    failures.push(failure);
  }

  // Tool failures. Timeouts only become a (platform, user-data-free) lesson once repeated.
  for (const e of input.toolExecutions) {
    if (e.status === "success" || e.status === "rejected") continue;
    const isTimeout = e.status === "timeout" || e.errorCode === "timeout";
    const category: FailureCategory = isTimeout ? "tool_timeout" : e.errorCode === "provider_error" ? "malformed_provider_response" : "tool_error";
    const failure: FailureDraft = {
      category,
      toolId: e.toolId,
      expectation: `${e.toolId} returns data`,
      observed: `${e.status}${e.errorCode ? ` (${e.errorCode})` : ""}`,
      objectivelyVerified: true,
      confirmedCause: e.status === "fault_injected" ? "Controlled fault injection (evaluation)" : null,
      hypotheses: isTimeout ? ["Provider latency or rate limiting"] : ["Provider error or unexpected response"],
      correctiveStrategy: isTimeout ? "Retry once, then fall back to an alternative tool and disclose the gap" : null,
      correctionValidated: false,
      evidenceRefs: [],
      verificationResultId: null,
      lesson: null,
    };
    const repeated = (input.recentToolTimeouts[e.toolId] ?? 0) >= 2;
    if (isTimeout && repeated && !run.isEvaluation && e.status !== "fault_injected" && !lessonKeys.has(`timeout|${e.toolId}`)) {
      lessonKeys.add(`timeout|${e.toolId}`);
      failure.lesson = {
        userId: null,
        scope: "platform",
        memoryType: "tool_reliability",
        taskCategory: run.taskCategory,
        relatedToolId: e.toolId,
        directive: "tool_timeout_risk",
        summary: `Tool ${e.toolId} timed out repeatedly`,
        lesson: `Tool ${e.toolId} timed out at least ${input.recentToolTimeouts[e.toolId]} times within 24 hours. Prefer an alternative tool where one exists, keep requests small, and disclose missing data if it fails again.`,
        evidenceText: `${input.recentToolTimeouts[e.toolId]} timeouts in 24h for ${e.toolId}`,
        evidenceReferences: [{ kind: "run", id: run.id, label: "observed timeout" }],
        verificationStatus: "verified",
        sourceRunId: run.id,
        isEvaluation: false,
      };
    }
    failures.push(failure);
  }

  // Paid analysis: was it worth it?
  if (input.paid?.status === "settled" && input.paid.toolExecutionId) {
    const wasUseful = useful.has(input.paid.toolExecutionId);
    if (!wasUseful) {
      failures.push({
        category: "paid_tool_not_useful",
        toolId: PAID_FORENSICS_TOOL_ID,
        expectation: "Paid analysis contributes to at least one verified claim",
        observed: "No verified claim cited the paid analysis",
        objectivelyVerified: true,
        confirmedCause: "Paid output was not cited by any verified claim in the final report.",
        hypotheses: ["Free tools already covered the question"],
        correctiveStrategy: "Answer this category with free tools unless they demonstrably cannot.",
        correctionValidated: false,
        evidenceRefs: [],
        verificationResultId: null,
        lesson: run.isEvaluation
          ? null
          : {
              userId: run.userId,
              scope: "user",
              memoryType: "cost_efficiency",
              taskCategory: run.taskCategory,
              relatedToolId: PAID_FORENSICS_TOOL_ID,
              directive: "paid_tool_unnecessary_for_category",
              summary: `Paid forensic analysis added no verified value for ${run.taskCategory}`,
              lesson: `For ${run.taskCategory.replace(/_/g, " ")} questions, the paid forensic analysis was purchased but no verified claim relied on it. Prefer free Tatum tools for this category unless they cannot answer.`,
              evidenceText: `run ${run.id}; payment intent ${input.paid.intentId}`,
              evidenceReferences: [
                { kind: "run", id: run.id },
                { kind: "payment", id: input.paid.intentId },
              ],
              verificationStatus: "verified",
              sourceRunId: run.id,
              isEvaluation: false,
            },
      });
    } else if (!run.isEvaluation) {
      lessons.push({
        userId: run.userId,
        scope: "user",
        memoryType: "cost_efficiency",
        taskCategory: run.taskCategory,
        relatedToolId: PAID_FORENSICS_TOOL_ID,
        directive: "paid_tool_useful_for_category",
        summary: `Paid forensic analysis produced verified findings for ${run.taskCategory}`,
        lesson: `For ${run.taskCategory.replace(/_/g, " ")} questions that need aggregation beyond a few transactions, the paid forensic analysis contributed verified claims and was worth its quoted price.`,
        evidenceText: `run ${run.id}; payment intent ${input.paid.intentId}`,
        evidenceReferences: [
          { kind: "run", id: run.id },
          { kind: "payment", id: input.paid.intentId },
        ],
        verificationStatus: "verified",
        sourceRunId: run.id,
        isEvaluation: false,
      });
    }
  } else if (input.paid && (input.paid.status === "failed" || input.paid.status === "unknown")) {
    failures.push({
      category: "payment_failed",
      toolId: PAID_FORENSICS_TOOL_ID,
      expectation: "Approved payment settles and the paid tool returns a result",
      observed: `Payment ${input.paid.status}`,
      objectivelyVerified: true,
      confirmedCause: null,
      hypotheses: ["Insufficient balance, expired authorization, or provider unavailable"],
      correctiveStrategy: "Continue with free tools and disclose the missing analysis",
      correctionValidated: false,
      evidenceRefs: [],
      verificationResultId: null,
      lesson: null,
    });
  }

  if (input.limitsHit) {
    failures.push({
      category: input.finalReportPresent ? "execution_limit_reached" : "incomplete_analysis",
      toolId: null,
      expectation: "Investigation completes within its execution limits",
      observed: input.finalReportPresent ? "Limit reached" : "No final report before the limit",
      objectivelyVerified: true,
      confirmedCause: null,
      hypotheses: ["Task too broad for the configured tool-call/iteration budget"],
      correctiveStrategy: null,
      correctionValidated: false,
      evidenceRefs: [],
      verificationResultId: null,
      lesson: null,
    });
  } else if (input.noReport) {
    failures.push({
      category: "incomplete_analysis",
      toolId: null,
      expectation: "The agent submits a structured, verifiable report",
      observed: "The model ended without submitting a report, even after a reminder and a report-only request",
      objectivelyVerified: true,
      confirmedCause: null,
      hypotheses: ["The model provider returned empty or malformed responses (see the recorded finish reasons)"],
      correctiveStrategy: null,
      correctionValidated: false,
      evidenceRefs: [],
      verificationResultId: null,
      lesson: null,
    });
  }

  // Validated strategy: an applied memory directive followed by a clean, verified outcome.
  const verified = input.claims.filter((c) => c.outcome.status === "VERIFIED").length;
  const contradictedCount = input.claims.filter((c) => c.outcome.status === "CONTRADICTED").length;
  if (!run.isEvaluation && input.finalReportPresent && contradictedCount === 0 && verified >= 2) {
    for (const d of input.appliedDirectives) {
      if (!DIRECTIVE_LESSONS_BY_DIRECTIVE.has(d.directive)) continue;
      const key = `success|${d.directive}|${run.taskCategory}`;
      if (lessonKeys.has(key)) continue;
      lessonKeys.add(key);
      lessons.push({
        userId: run.userId,
        scope: "user",
        memoryType: "success",
        taskCategory: run.taskCategory,
        relatedToolId: null,
        directive: d.directive,
        summary: `Applying "${d.directive.replace(/_/g, " ")}" produced a fully verified result`,
        lesson: `Following the learned rule "${d.directive.replace(/_/g, " ")}" on a ${run.taskCategory.replace(/_/g, " ")} task produced verified claims with zero contradictions. Keep applying it for this category.`,
        evidenceText: `run ${run.id}; ${verified} verified claims, 0 contradicted; applied memory ${d.memoryRef}`,
        evidenceReferences: [{ kind: "run", id: run.id }],
        verificationStatus: "verified",
        sourceRunId: run.id,
        isEvaluation: false,
      });
    }
  }

  // Proven strategy: a clean, verified run records which tools produced the verified evidence.
  // The orchestrator keeps at most one per user and task category.
  const clean =
    !run.isEvaluation &&
    input.finalReportPresent &&
    !input.limitsHit &&
    !input.noReport &&
    contradictedCount === 0 &&
    claimFailureCount === 0 &&
    ungrounded.length === 0 &&
    verified >= 2;
  const sequence: string[] = [];
  for (const e of input.toolExecutions) {
    if (useful.has(e.id) && e.toolId !== PAID_FORENSICS_TOOL_ID && !sequence.includes(e.toolId)) sequence.push(e.toolId);
  }
  if (clean && sequence.length) {
    const category = run.taskCategory.replace(/_/g, " ");
    const crossChecked = input.toolExecutions.some((e) => e.toolId === "evidence_cross_checker" && e.status === "success");
    lessons.push({
      userId: run.userId,
      scope: "user",
      memoryType: "strategy",
      taskCategory: run.taskCategory,
      relatedToolId: sequence[0]!,
      directive: "prefer_tool_for_category",
      summary: `Verified approach for ${category}: ${sequence.join(" → ")}`.slice(0, 200),
      lesson: `For ${category} questions, evidence from ${sequence.join(", then ")}${crossChecked ? ", with claims cross-checked by evidence_cross_checker before submitting," : ""} produced ${verified} verified claims and no contradictions. Start with ${sequence[0]}.`,
      evidenceText: `run ${run.id}; ${verified} verified claims, 0 contradicted; evidence tools in order: ${sequence.join(", ")}`,
      evidenceReferences: [
        { kind: "run", id: run.id },
        ...input.claims
          .filter((c) => c.outcome.status === "VERIFIED")
          .slice(0, 5)
          .map((c) => ({ kind: "verification" as const, id: c.verificationResultId, label: c.ref })),
      ],
      verificationStatus: "verified",
      sourceRunId: run.id,
      isEvaluation: false,
    });
  }

  return { failures, lessons, usefulToolExecutionIds: useful, contradictedToolExecutionIds: contradicted };
}

const DIRECTIVE_LESSONS_BY_DIRECTIVE = new Set(Object.values(DIRECTIVE_LESSONS).map((t) => t.directive));
