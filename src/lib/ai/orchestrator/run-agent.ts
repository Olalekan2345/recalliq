/**
 * Agent orchestrator — drives one investigation through the state machine:
 *
 *   CREATED → PLANNING → RECALLING_MEMORY → SELECTING_TOOLS → EXECUTING
 *     ↘ AWAITING_APPROVAL (paid tool) ↗
 *   → VERIFYING → REFLECTING → SAVING_MEMORY → COMPLETED | PARTIALLY_COMPLETED
 *   (FAILED / CANCELLED from any non-terminal state)
 *
 * The LLM chooses tools and writes the report. Trusted code owns: tool
 * registry & argument validation, budgets/limits, cancellation, payments,
 * learned-policy enforcement, verification, autopsy and memory writes.
 * Progress is checkpointed so a worker restart resumes instead of losing work.
 */
import { generateText, stepCountIs, tool, ToolChoiceViolationError, type ModelMessage, type StopCondition, type ToolSet } from "ai";
import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { chain, ChainDataError } from "@/lib/blockchain/tatum/client";
import { db } from "@/lib/db/client";
import {
  agentFailure,
  agentMessage,
  agentRun,
  investigation,
  paymentIntent,
  paymentSettlement,
  toolExecution,
  toolPerformanceObservation,
  verificationResult,
  type FinalReport,
  type MemoryDirective,
  type RunCheckpoint,
} from "@/lib/db/schema";
import { memwalConfig, x402Config } from "@/lib/env";
import { logger } from "@/lib/logging/logger";
import { newId } from "@/lib/security/ids";
import { safeErrorMessage } from "@/lib/security/redact";
import { hasActiveStrategy, markMemoryApplied, proposeLesson, recallMemories, recordMemoryUsage, type RecalledMemory } from "@/lib/memory/service";
import { buildRecallQuery, type TaskCategory } from "@/lib/ai/planning/task";
import { costMicroUsd, providerOptionsFor, resolveModel } from "@/lib/ai/providers";
import { ALL_TOOLS, getTool, PAID_FORENSICS_TOOL_ID, paidForensicsInputSchema, configuredPrice, describePrice } from "@/lib/ai/tools/registry";
import type { ToolContext, ToolSpec } from "@/lib/ai/tools/types";
import { claimSchema, type ClaimInput } from "@/lib/ai/verification/assertions";
import { VerificationContext, verifyClaim } from "@/lib/ai/verification/engine";
import { describeUngrounded, findUngroundedValues, GroundingCorpus, type UngroundedValue } from "@/lib/ai/verification/grounding";
import { runAutopsy, type AutopsyClaim } from "@/lib/ai/reflection/autopsy";
import { decideTools, type DirectiveSignal, type WorthItDecision } from "@/lib/ai/worthit/engine";
import { loadReliability } from "@/lib/ai/worthit/reliability";
import { addEvidence, evidenceRefsByExecution, evidenceRefsForRun } from "@/server/services/evidence";
import { evaluatePolicyFor, requestPaidAnalysis } from "@/server/services/payments";
import { getSettings, isGuestUser } from "@/server/services/settings";
import { recordStep, TERMINAL_STATES, transition, type RunStatus } from "@/server/services/steps";
import { buildSystemPrompt, buildUserMessage, POLICY_TEXT } from "./prompt";

const log = logger("orchestrator");

type RunRow = typeof agentRun.$inferSelect;

const ENFORCEABLE: MemoryDirective[] = [
  "verify_coin_decimals",
  "confirm_balance_change_direction",
  "check_status_before_amounts",
  "cross_check_sender",
  "cite_evidence_for_every_fact",
];

export const finalReportSchema = z.object({
  answer: z.string().min(20).max(8000).describe("Direct answer for the user in Markdown. Cite evidence refs like [E2]."),
  claims: z.array(claimSchema).max(25).describe("Every factual statement as a structured claim; attach assertions where machine-checkable."),
  limitations: z.array(z.string().max(300)).max(10).default([]),
  toolRationale: z
    .array(z.object({ tool: z.string(), why: z.string().max(300) }))
    .max(12)
    .default([]),
  memoriesApplied: z
    .array(z.object({ ref: z.string().regex(/^M\d{1,3}$/), how: z.string().max(300) }))
    .max(10)
    .default([]),
  paidAnalysisAssessment: z.object({ useful: z.boolean(), why: z.string().max(300) }).optional(),
});

export type FinalReportInput = z.infer<typeof finalReportSchema>;

interface RunState {
  run: RunRow;
  isGuest: boolean;
  memoryAllowed: boolean;
  checkpoint: RunCheckpoint;
}

class RunCancelled extends Error {
  constructor() {
    super("Run cancelled");
  }
}

async function loadRun(runId: string): Promise<RunRow | null> {
  const [run] = await db().select().from(agentRun).where(eq(agentRun.id, runId)).limit(1);
  return run ?? null;
}

async function saveCheckpoint(runId: string, checkpoint: RunCheckpoint, extra: Partial<typeof agentRun.$inferInsert> = {}) {
  await db()
    .update(agentRun)
    .set({ checkpoint, toolCallCount: checkpoint.toolCallCount, modelIterations: checkpoint.iterations, updatedAt: new Date(), ...extra })
    .where(eq(agentRun.id, runId));
}

async function cancelRequested(runId: string): Promise<boolean> {
  const [r] = await db().select({ c: agentRun.cancelRequested }).from(agentRun).where(eq(agentRun.id, runId)).limit(1);
  return Boolean(r?.c);
}

function runRef(run: RunRow) {
  return { id: run.id, userId: run.userId, investigationId: run.investigationId };
}

/* ───────────────────────────── Entry point ───────────────────────────── */

export async function executeRun(runId: string, hooks: { heartbeat?: () => Promise<void> } = {}): Promise<void> {
  let run = await loadRun(runId);
  if (!run || TERMINAL_STATES.has(run.status)) return;
  const status = run.status;
  try {
    if (run.cancelRequested) throw new RunCancelled();
    const settings = await getSettings(run.userId);
    const isGuest = await isGuestUser(run.userId);
    const state: RunState = {
      run,
      isGuest,
      memoryAllowed: run.memoryMode === "enabled" && settings.memoryEnabled && !isGuest,
      checkpoint: run.checkpoint ?? { messages: [], toolCallCount: 0, iterations: 0, evidenceCounter: 0 },
    };

    if (status === "AWAITING_APPROVAL") {
      await resumeAfterPayment(state);
    } else if (status === "CREATED") {
      await prepare(state);
    } else if (status === "VERIFYING" || status === "REFLECTING" || status === "SAVING_MEMORY") {
      // Worker restarted after the model finished: redo the deterministic tail (idempotent).
      await finish(state, status);
      return;
    } else if (status !== "EXECUTING") {
      // Restart during planning/recall/selection: those phases are cheap and idempotent — re-run them.
      await db().update(agentRun).set({ status: "CREATED" }).where(eq(agentRun.id, runId));
      state.run = (await loadRun(runId))!;
      await prepare(state);
    }
    run = (await loadRun(runId))!;
    state.run = run;
    if (run.status !== "EXECUTING") return;
    const outcome = await executeModelLoop(state, hooks);
    if (outcome === "awaiting_approval") return;
    await finish(state, "EXECUTING");
  } catch (err) {
    const current = (await loadRun(runId))!;
    if (err instanceof RunCancelled || current.cancelRequested) {
      if (!TERMINAL_STATES.has(current.status)) {
        await transition(runRef(current), current.status, "CANCELLED", "Investigation cancelled by the user");
      }
      await db()
        .update(paymentIntent)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(and(eq(paymentIntent.runId, runId), eq(paymentIntent.status, "awaiting_approval")));
      return;
    }
    const message = safeErrorMessage(err);
    log.error("run failed", { runId, err: message });
    await db().update(agentRun).set({ error: message }).where(eq(agentRun.id, runId));
    if (!TERMINAL_STATES.has(current.status)) {
      await transition(runRef(current), current.status, "FAILED", "Investigation failed", { error: message });
    }
  }
}

/* ───────────────────────────── Planning → selection ───────────────────────────── */

async function prepare(state: RunState): Promise<void> {
  const { run } = state;
  const category = (run.taskCategory ?? "general") as TaskCategory;
  await transition(runRef(run), "CREATED", "PLANNING", "Understanding the request", {
    category,
    addresses: run.inputs.addresses.length,
    digests: run.inputs.digests.length,
    names: run.inputs.names.length,
  });

  let memories: RecalledMemory[] = [];
  let memoryStatus = "disabled for this run";
  let from: RunStatus = "PLANNING";
  if (state.memoryAllowed) {
    await transition(runRef(run), "PLANNING", "RECALLING_MEMORY", "Retrieving relevant memories from Walrus");
    from = "RECALLING_MEMORY";
    const query = buildRecallQuery(run.task, category);
    const recall = await recallMemories({ userId: run.userId, query });
    if (recall.status === "ok") {
      memories = recall.memories;
      const considered = memories.filter((m) => m.disposition === "considered");
      memoryStatus = `recalled ${memories.length} candidate(s), ${considered.length} relevant`;
      await recordStep(run, "memory_recall", `Recalled ${memories.length} memories (${considered.length} relevant)`, {
        query,
        namespaces: recall.namespaces,
        memories: memories.map((m) => ({
          ref: m.ref,
          blobId: m.blobId,
          distance: Number(m.distance.toFixed(4)),
          scope: m.scope,
          type: m.parsed?.header.type ?? null,
          directive: m.parsed?.header.directive ?? null,
          summary: m.parsed?.summary ?? null,
          linked: Boolean(m.record),
          disposition: m.disposition,
          filterReason: m.filterReason,
        })),
      });
      const usage = await recordMemoryUsage(run, memories);
      state.checkpoint.memoryContext = memories.map((m) => ({
        ref: m.ref,
        usageId: usage.get(m.ref) ?? null,
        memoryId: m.record?.id ?? null,
        blobId: m.blobId,
        directive: m.disposition === "considered" && m.record ? (m.parsed?.header.directive ?? null) : null,
        verified: m.record?.verificationStatus === "verified",
        tool: m.parsed?.header.tool ?? null,
        category: m.parsed?.header.category ?? null,
        recordedAt: m.record?.createdAt ?? m.parsed?.header.recorded ?? "",
        considered: m.disposition === "considered",
      }));
    } else {
      memoryStatus =
        recall.status === "unconfigured" ? "not configured on this deployment" : `unavailable (${"error" in recall ? recall.error : recall.status})`;
      await recordStep(run, "memory_recall", `Walrus Memory ${recall.status}`, { detail: "error" in recall ? recall.error : null });
    }
  } else {
    await recordStep(run, "notice", run.memoryMode === "disabled" ? "Memory disabled for this run (baseline mode)" : "Memory not used for this session", null);
  }

  await transition(runRef(run), from, "SELECTING_TOOLS", "Selecting tools (WorthIt Intelligence)");
  const decision = await selectTools(state, category, memories);
  await db()
    .update(agentRun)
    .set({
      toolPlan: {
        taskCategory: category,
        candidates: decision.tools.map((t) => ({ toolId: t.toolId, offered: t.offered, score: t.score, reasons: t.reasons })),
        paidToolDecision: decision.paidToolDecision,
        directivesApplied: decision.directivesApplied,
      },
    })
    .where(eq(agentRun.id, run.id));
  await recordStep(
    run,
    "tool_selection",
    `Selected ${decision.tools.filter((t) => t.offered).length} tools; paid analysis ${decision.paidToolDecision.offered ? "available" : "not offered"}`,
    {
      tools: decision.tools,
      paid: decision.paidToolDecision,
      directivesApplied: decision.directivesApplied,
    },
  );

  const policies = activePolicies(state);
  const resolved = resolveModel();
  const system = buildSystemPrompt({
    category,
    maxToolCalls: run.limits.maxToolCalls,
    tools: decision.tools,
    paidOffered: decision.paidToolDecision.offered,
    memories: memories.filter((m) => m.disposition === "considered"),
    policies,
    memoryStatus,
  });
  state.checkpoint.messages = [{ role: "user", content: buildUserMessage(run.task, run.inputs) } satisfies ModelMessage];
  (state.checkpoint as RunCheckpoint & { system?: string }).system = system;
  await saveCheckpoint(run.id, state.checkpoint, { provider: resolved.provider, model: resolved.modelId });
  await db().insert(agentMessage).values({ id: newId(), runId: run.id, userId: run.userId, role: "user", content: run.task });
  await transition(runRef(run), "SELECTING_TOOLS", "EXECUTING", "Investigating", { policies });
}

function memoryContext(state: RunState) {
  return (state.checkpoint.memoryContext ?? []) as Array<{
    ref: string;
    usageId: string | null;
    memoryId: string | null;
    blobId: string;
    directive: MemoryDirective | null;
    verified: boolean;
    tool: string | null;
    category: string | null;
    recordedAt: string;
    considered: boolean;
  }>;
}

function activePolicies(state: RunState): MemoryDirective[] {
  const set = new Set<MemoryDirective>();
  for (const m of memoryContext(state)) {
    if (m.considered && m.directive && ENFORCEABLE.includes(m.directive) && m.memoryId) set.add(m.directive);
  }
  return [...set];
}

async function selectTools(state: RunState, category: TaskCategory, memories: RecalledMemory[]): Promise<WorthItDecision> {
  const { run } = state;
  const settings = await getSettings(run.userId);
  const directives: DirectiveSignal[] = memories
    .filter((m) => m.disposition === "considered" && m.record && m.parsed?.header.directive)
    .map((m) => ({
      directive: m.parsed!.header.directive!,
      memoryRef: m.ref,
      toolId: m.parsed!.header.tool,
      category: m.parsed!.header.category,
      verified: m.record!.verificationStatus === "verified",
      recordedAt: m.record!.createdAt,
    }));
  const price = configuredPrice(PAID_FORENSICS_TOOL_ID);
  let priceFitsLimits = false;
  let priceDescription: string | null = null;
  const paidSpec = getTool(PAID_FORENSICS_TOOL_ID)!;
  const cfg = x402Config();
  if (price && cfg.payTo && paidSpec.availability().status === "available" && !state.isGuest && !run.isEvaluation) {
    // Pre-check the operator's configured price against the user's limits; the
    // real quote is fetched (and re-checked) only if the agent requests the tool.
    const decision = await evaluatePolicyFor(run.userId, run.id, {
      scheme: "exact",
      network: cfg.network,
      amount: price.amountAtomic,
      asset: price.asset,
      payTo: cfg.payTo,
      maxTimeoutSeconds: cfg.maxTimeoutSeconds,
    });
    priceFitsLimits = decision.allowed;
    priceDescription = describePrice(price.amountAtomic, null, null);
    if (!decision.allowed) priceDescription = `${priceDescription} (${decision.reasons.join("; ")})`;
  }
  const reliability = await loadReliability();
  return decideTools({
    category,
    tools: ALL_TOOLS,
    reliability,
    directives,
    paid: {
      enabled: settings.paidToolsEnabled,
      configured: paidSpec.availability().status === "available",
      isGuest: state.isGuest,
      isEvaluation: run.isEvaluation,
      priceFitsLimits,
      priceDescription,
    },
  });
}

/* ───────────────────────────── Model loop ───────────────────────────── */

interface LoopFlags {
  finalReport: FinalReportInput | null;
  awaitingIntentId: string | null;
  limitsHit: boolean;
  policyRejections: Array<{ directive: MemoryDirective; detail: string }>;
  calls: Array<{ toolId: string; args: Record<string, unknown> }>;
  groundingRejections: number;
  /** Values in the accepted answer that no evidence supports (listed under limitations). */
  ungrounded: UngroundedValue[];
  /** Most recent rejected report: used, with its problems disclosed, if none is ever accepted. */
  lastRejected: { report: FinalReportInput; problems: string[]; ungrounded: UngroundedValue[] } | null;
  reportFallback: boolean;
}

/** Answers with ungrounded values are sent back this many times, then accepted with a disclosure. */
const MAX_GROUNDING_REJECTIONS = 2;

async function executeModelLoop(state: RunState, hooks: { heartbeat?: () => Promise<void> }): Promise<"done" | "awaiting_approval"> {
  const { run } = state;
  const resolved = resolveModel();
  if (!resolved.configured || !resolved.model) {
    throw new Error(`LLM provider not configured: ${resolved.reason ?? "missing model"}`);
  }
  const cp = state.checkpoint as RunCheckpoint & {
    system?: string;
    nudged?: boolean;
    calls?: LoopFlags["calls"];
    policyRejections?: LoopFlags["policyRejections"];
    groundingRejections?: number;
  };
  const flags: LoopFlags = {
    finalReport: null,
    awaitingIntentId: null,
    limitsHit: false,
    policyRejections: cp.policyRejections ?? [],
    calls: cp.calls ?? [],
    groundingRejections: cp.groundingRejections ?? 0,
    ungrounded: [],
    lastRejected: null,
    reportFallback: false,
  };
  const plan = run.toolPlan;
  const offered = new Set((plan?.candidates ?? []).filter((c) => c.offered).map((c) => c.toolId));
  const policies = activePolicies(state);
  const controller = new AbortController();
  const deadline = (run.startedAt ?? run.createdAt).getTime() + run.limits.maxDurationMs;
  const timer = setTimeout(() => controller.abort(new Error("Execution time limit reached")), Math.max(1_000, deadline - Date.now()));
  const cancelPoll = setInterval(async () => {
    try {
      if (await cancelRequested(run.id)) controller.abort(new RunCancelled());
      await hooks.heartbeat?.();
    } catch {
      /* polling is best effort */
    }
  }, 2_000);

  const tools = buildTools(state, flags, offered, policies, controller.signal);
  const remainingIterations = Math.max(1, run.limits.maxIterations - cp.iterations);
  const stopOnFinal: StopCondition<ToolSet> = () => flags.finalReport !== null;
  const stopOnApproval: StopCondition<ToolSet> = () => flags.awaitingIntentId !== null;

  let messages = cp.messages as ModelMessage[];
  const narrative: string[] = [];
  let endReason: "report" | "awaiting_approval" | "limits" | "no_report" | "rejected_report" = "no_report";
  try {
    // Pass 0: investigate. Pass 1: one reminder. Pass 2: report-only — the model
    // can do nothing but submit, using only evidence already gathered.
    for (let pass = 0; pass < 3; pass++) {
      const reportOnly = pass === 2;
      const result = await generateText({
        model: resolved.model,
        system: cp.system,
        messages,
        tools: reportOnly ? { submit_final_report: tools.submit_final_report! } : tools,
        // Anthropic's newest models reject forced tool use; elsewhere, require the report call.
        toolChoice: reportOnly && resolved.provider !== "anthropic" ? "required" : "auto",
        stopWhen: reportOnly ? [stepCountIs(2), stopOnFinal] : [stepCountIs(remainingIterations), stopOnFinal, stopOnApproval],
        maxOutputTokens: run.limits.maxOutputTokens,
        abortSignal: controller.signal,
        maxRetries: 2,
        providerOptions: providerOptionsFor(resolved.provider, run.analysisDepth),
        onStepFinish: async (step) => {
          const text = step.text?.trim();
          if (text) narrative.push(text);
          if (text && !flags.finalReport) await recordStep(run, "model", text.slice(0, 280), null);
          if (!text && step.toolCalls.length === 0) {
            // Record why the model produced nothing (e.g. Gemini MALFORMED_FUNCTION_CALL / SAFETY).
            await recordStep(run, "notice", `Model returned an empty response (finish: ${step.rawFinishReason ?? step.finishReason})`, {
              finishReason: step.finishReason,
              rawFinishReason: step.rawFinishReason ?? null,
              pass,
            });
          }
        },
      }).catch(async (err: unknown) => {
        // The forced report call still came back without one: record it and end without a report.
        if (!reportOnly || !ToolChoiceViolationError.isInstance(err)) throw err;
        const text = err.content.flatMap((c) => (c.type === "text" && c.text.trim() ? [c.text.trim()] : [])).join("\n\n");
        if (text) narrative.push(text);
        await recordStep(run, "notice", `Model returned no report even when required (finish: ${err.finishReason})`, { finishReason: err.finishReason, pass });
        return null;
      });
      if (!result) break;
      messages = [...messages, ...(result.responseMessages as ModelMessage[])];
      cp.iterations += result.steps.length;
      cp.usage = {
        inputTokens: (cp.usage?.inputTokens ?? 0) + (result.totalUsage.inputTokens ?? 0),
        outputTokens: (cp.usage?.outputTokens ?? 0) + (result.totalUsage.outputTokens ?? 0),
      };
      cp.messages = messages;
      cp.calls = flags.calls;
      cp.policyRejections = flags.policyRejections;
      cp.groundingRejections = flags.groundingRejections;
      const cost = costMicroUsd(resolved.pricing, cp.usage.inputTokens, cp.usage.outputTokens);
      await saveCheckpoint(run.id, cp, { inputTokens: cp.usage.inputTokens, outputTokens: cp.usage.outputTokens, modelCostMicroUsd: cost });

      if (flags.awaitingIntentId) {
        endReason = "awaiting_approval";
        break;
      }
      if (flags.finalReport) {
        endReason = "report";
        break;
      }
      if (cp.iterations >= run.limits.maxIterations || cp.toolCallCount >= run.limits.maxToolCalls) flags.limitsHit = true;
      if (pass === 0) {
        cp.nudged = true;
        messages = [
          ...messages,
          {
            role: "user",
            content: "[RecallIQ system notice] Please call submit_final_report now with your findings, claims (with assertions) and limitations.",
          },
        ];
      } else if (pass === 1) {
        await recordStep(run, "notice", "No report after the reminder — asking for a report-only answer from the evidence gathered", null);
        messages = [
          ...messages,
          {
            role: "user",
            content:
              "[RecallIQ system notice] The investigation is ending. Call submit_final_report now, using only the evidence already gathered. Put anything you could not determine under limitations.",
          },
        ];
      }
    }
  } catch (err) {
    if (controller.signal.reason instanceof RunCancelled) throw new RunCancelled();
    if (controller.signal.aborted) {
      flags.limitsHit = true;
      await recordStep(run, "notice", "Execution time limit reached", { maxDurationMs: run.limits.maxDurationMs });
    } else {
      throw new Error(`LLM provider error: ${safeErrorMessage(err, 300)}`);
    }
  } finally {
    clearTimeout(timer);
    clearInterval(cancelPoll);
  }

  // Every non-report exit (reminders exhausted, limits, time limit) lands here.
  if (!flags.finalReport && !flags.awaitingIntentId) {
    endReason = flags.limitsHit ? "limits" : "no_report";
    const text = narrative.join("\n\n").trim();
    if (flags.lastRejected) {
      // A rejected report still beats none: use it and disclose why it was rejected.
      if (!flags.limitsHit) endReason = "rejected_report";
      const { report, problems, ungrounded } = flags.lastRejected;
      flags.finalReport = withLimitation(report, `This report was not accepted as submitted: ${problems.join("; ")}`);
      flags.ungrounded = ungrounded;
      flags.reportFallback = true;
      await recordStep(run, "notice", "Using the last submitted report; its unresolved problems are listed under limitations", { problems });
    } else if (text) {
      flags.finalReport = {
        answer: text.slice(0, 8000),
        claims: [],
        limitations: ["The agent did not submit a structured report; its claims could not be verified."],
        toolRationale: [],
        memoriesApplied: [],
      };
    }
  }

  if (flags.awaitingIntentId) {
    cp.pendingPaymentIntentId = flags.awaitingIntentId;
    await saveCheckpoint(run.id, cp);
    await transition(runRef(run), "EXECUTING", "AWAITING_APPROVAL", "Awaiting your payment approval", { intentId: flags.awaitingIntentId });
    return "awaiting_approval";
  }

  const report: FinalReport | null = flags.finalReport
    ? {
        answer: flags.finalReport.answer,
        claims: flags.finalReport.claims.map((c, i) => ({
          ref: `C${i + 1}`,
          statement: c.statement,
          kind: c.kind,
          evidenceRefs: c.evidenceRefs,
          assertion: c.assertion,
        })),
        limitations: flags.finalReport.limitations,
        toolRationale: flags.finalReport.toolRationale,
        memoriesApplied: flags.finalReport.memoriesApplied,
        paidAnalysis: null,
      }
    : null;
  await db()
    .update(agentRun)
    .set({
      finalReport: report,
      checkpoint: { ...cp, limitsHit: flags.limitsHit, endReason, ungroundedValues: flags.ungrounded, reportFallback: flags.reportFallback } as RunCheckpoint,
    })
    .where(eq(agentRun.id, run.id));
  return "done";
}

function buildTools(state: RunState, flags: LoopFlags, offered: Set<string>, policies: MemoryDirective[], signal: AbortSignal): ToolSet {
  const { run } = state;
  const tools: ToolSet = {};

  for (const spec of ALL_TOOLS) {
    if (!offered.has(spec.id)) continue;
    if (spec.id === PAID_FORENSICS_TOOL_ID) {
      tools[spec.id] = tool({
        description: spec.description,
        inputSchema: paidForensicsInputSchema,
        execute: async (input) => {
          await recordStep(run, "payment", "Considering paid forensic analysis", { justification: input.justification, mode: input.mode });
          const plan = run.toolPlan?.paidToolDecision ?? { offered: false, reasons: ["No plan"] };
          const res = await requestPaidAnalysis(run, input, plan);
          if (res.status === "awaiting_user_approval") {
            flags.awaitingIntentId = res.intentId;
            await recordStep(run, "payment", `Payment approval requested: ${res.displayAmount ?? `${res.amountAtomic} atomic`}`, res);
            return { status: res.status, message: "The investigation pauses until the user approves or declines this exact payment." };
          }
          await recordStep(run, "payment", `Paid analysis not requested: ${res.status}`, res);
          return { status: res.status, reasons: res.reasons, message: "Continue with free tools." };
        },
      });
      continue;
    }
    tools[spec.id] = tool({
      description: spec.description,
      inputSchema: spec.inputSchema as z.ZodType<Record<string, unknown>>,
      execute: async (input, options) => runFreeTool(state, flags, spec as ToolSpec<Record<string, unknown>>, input, options.toolCallId, signal),
    });
  }

  tools.submit_final_report = tool({
    description:
      "Submit the final investigation report (call exactly once, at the end). Claims are independently re-verified on chain after submission. If the system rejects the report for a policy violation, fix it and submit again.",
    inputSchema: finalReportSchema,
    execute: async (report) => {
      const violations = checkPolicies(report, policies, flags.calls);
      const ungrounded = findUngroundedValues(report.answer, await groundingCorpus(run));
      if (violations.length) {
        flags.policyRejections.push(...violations);
        const problems = violations.map((v) => `${v.directive}: ${v.detail}`);
        if (ungrounded.length) problems.push(`values not found in this run's evidence: ${describeUngrounded(ungrounded)}`);
        flags.lastRejected = { report, problems, ungrounded };
        await recordStep(run, "notice", `Learned policy enforced: report rejected (${violations.map((v) => v.directive).join(", ")})`, { violations });
        return { accepted: false, violations: violations.map((v) => `${v.directive}: ${v.detail}`) };
      }
      if (ungrounded.length && flags.groundingRejections < MAX_GROUNDING_REJECTIONS) {
        flags.groundingRejections++;
        const problem = `values not found in this run's evidence: ${describeUngrounded(ungrounded)}`;
        flags.lastRejected = { report, problems: [problem], ungrounded };
        await recordStep(run, "notice", `Report rejected: ${ungrounded.length} value(s) in the answer are not in this run's evidence`, {
          values: ungrounded.slice(0, 12),
        });
        return {
          accepted: false,
          violations: [
            `Your answer contains ${problem}. Copy digests, addresses, UTC timestamps and amounts exactly from tool output (displayAmount or atomic units), fetch evidence for them, or remove them. Then submit again.`,
          ],
        };
      }
      flags.finalReport = report;
      if (ungrounded.length) {
        flags.ungrounded = ungrounded;
        flags.finalReport = withLimitation(report, `Not found in this investigation's evidence, so unverified: ${describeUngrounded(ungrounded)}`);
        await recordStep(run, "notice", `Report accepted with ${ungrounded.length} unverified value(s) listed under limitations`, {
          values: ungrounded.slice(0, 12),
        });
      }
      flags.lastRejected = null;
      await recordStep(run, "notice", "Final report submitted", { claims: report.claims.length });
      return { accepted: true };
    },
  });
  return tools;
}

async function runFreeTool(
  state: RunState,
  flags: LoopFlags,
  spec: ToolSpec<Record<string, unknown>>,
  input: Record<string, unknown>,
  toolCallId: string,
  runSignal: AbortSignal,
): Promise<unknown> {
  const { run } = state;
  const cp = state.checkpoint;
  if (runSignal.aborted) return { error: "Investigation stopped" };
  if (cp.toolCallCount >= run.limits.maxToolCalls) {
    flags.limitsHit = true;
    return { error: `Tool call budget (${run.limits.maxToolCalls}) exhausted. Submit your final report now with what you have.` };
  }
  cp.toolCallCount++;
  flags.calls.push({ toolId: spec.id, args: input });
  const execId = newId();
  const started = Date.now();
  await db()
    .insert(toolExecution)
    .values({ id: execId, runId: run.id, userId: run.userId, toolId: spec.id, toolCallId, input, status: "running", isEvaluation: run.isEvaluation });
  await recordStep(run, "tool_call", `${spec.name}${describeArgs(input)}`, { toolId: spec.id, toolExecutionId: execId, provider: spec.provider });

  const ctx: ToolContext = {
    run: { id: run.id, userId: run.userId, taskCategory: (run.taskCategory ?? "general") as TaskCategory, isEvaluation: run.isEvaluation },
    chain: chain(),
    signal: AbortSignal.any([runSignal, AbortSignal.timeout(spec.timeoutMs)]),
    addEvidence: (e, provenance) => addEvidence(run, execId, e, { provider: provenance.provider, method: provenance.method, network: provenance.network }),
  };

  try {
    const fault = run.isEvaluation && run.faultInjection?.toolId === spec.id ? run.faultInjection : null;
    let output: unknown;
    if (fault) {
      await recordStep(run, "notice", `Controlled fault injected into ${spec.id} (${fault.mode}) — evaluation only`, { label: fault.label });
      if (fault.mode === "timeout") throw new ChainDataError("Injected timeout (controlled evaluation)", "timeout", spec.id, "fault-injection", true);
      if (fault.mode === "error")
        throw new ChainDataError("Injected provider error (controlled evaluation)", "provider_error", spec.id, "fault-injection", false);
      output = { injectedEmptyResult: true };
    } else {
      output = await spec.run!(input, ctx);
    }
    const latency = Date.now() - started;
    const stored = fitForStorage(output);
    await db()
      .update(toolExecution)
      .set({ status: fault ? "fault_injected" : "success", output: stored, latencyMs: latency, finishedAt: new Date() })
      .where(eq(toolExecution.id, execId));
    await recordStep(run, "tool_result", `${spec.name} returned data`, { toolId: spec.id, toolExecutionId: execId, latencyMs: latency });
    return fitForModel(output);
  } catch (err) {
    const latency = Date.now() - started;
    const code =
      err instanceof ChainDataError
        ? err.code
        : runSignal.aborted
          ? "aborted"
          : /timeout|aborted/i.test(String((err as Error)?.message))
            ? "timeout"
            : "tool_error";
    const injected = err instanceof ChainDataError && err.provider === "fault-injection";
    const status = injected ? "fault_injected" : code === "timeout" ? "timeout" : "error";
    const message = safeErrorMessage(err, 240);
    await db()
      .update(toolExecution)
      .set({ status, errorCode: code, errorMessage: message, latencyMs: latency, finishedAt: new Date() })
      .where(eq(toolExecution.id, execId));
    await recordStep(run, "error", `${spec.name} failed: ${code}`, { toolId: spec.id, toolExecutionId: execId, message });
    if (runSignal.reason instanceof RunCancelled) throw runSignal.reason;
    return {
      error: message,
      code,
      guidance:
        code === "not_found"
          ? "The identifier does not exist on Sui Mainnet. Tell the user; do not guess."
          : code === "rate_limited"
            ? "Provider rate limit. Use fewer calls or continue with the evidence you have."
            : "Try an alternative tool if one fits, otherwise continue and disclose the gap.",
    };
  }
}

function describeArgs(input: Record<string, unknown>): string {
  const v = (input.digest ?? input.address ?? input.packageId ?? input.objectId ?? input.name) as string | undefined;
  return v ? ` · ${String(v).slice(0, 10)}…` : "";
}

const MAX_MODEL_JSON = 14_000;

export function fitForModel(output: unknown): unknown {
  const s = JSON.stringify(output);
  if (s.length <= MAX_MODEL_JSON) return output;
  return { truncated: true, note: "Output exceeded the size limit; key fields preserved in preview.", preview: s.slice(0, MAX_MODEL_JSON) };
}

/** Everything this run fetched or was given: what answer values may be grounded in. */
async function groundingCorpus(run: RunRow): Promise<GroundingCorpus> {
  const [outputs, settlements] = await Promise.all([
    db().select({ output: toolExecution.output }).from(toolExecution).where(eq(toolExecution.runId, run.id)),
    db()
      .select({ digest: paymentSettlement.digest })
      .from(paymentSettlement)
      .innerJoin(paymentIntent, eq(paymentSettlement.intentId, paymentIntent.id))
      .where(eq(paymentIntent.runId, run.id)),
  ]);
  return new GroundingCorpus(
    [run.task, JSON.stringify(run.inputs), ...outputs.map((o) => JSON.stringify(o.output ?? null)), ...settlements.map((s) => s.digest ?? "")],
    new Date(),
  );
}

function withLimitation(report: FinalReportInput, note: string): FinalReportInput {
  return { ...report, limitations: [...report.limitations.slice(0, 9), note.slice(0, 300)] };
}

function fitForStorage(output: unknown): unknown {
  const s = JSON.stringify(output);
  return s.length <= 200_000 ? output : { truncated: true, preview: s.slice(0, 200_000) };
}

/** Learned-policy enforcement on the final report. Pure. */
export function checkPolicies(
  report: FinalReportInput,
  policies: MemoryDirective[],
  calls: Array<{ toolId: string; args: Record<string, unknown> }>,
): Array<{ directive: MemoryDirective; detail: string }> {
  const violations: Array<{ directive: MemoryDirective; detail: string }> = [];
  const called = (toolId: string, digest?: string) => calls.some((c) => c.toolId === toolId && (!digest || c.args.digest === digest));
  const amountDigests = new Set<string>();
  const referencedDigests = new Set<string>();
  for (const c of report.claims) {
    const a = c.assertion;
    if (a && "digest" in a) referencedDigests.add(a.digest);
    if (a && (a.type === "balance_change" || a.type === "balance_change_display")) amountDigests.add(a.digest);
  }
  if (policies.includes("verify_coin_decimals") || policies.includes("confirm_balance_change_direction")) {
    const missing = [...amountDigests].filter((d) => !called("balance_change_analyzer", d));
    if (missing.length) {
      violations.push({
        directive: policies.includes("verify_coin_decimals") ? "verify_coin_decimals" : "confirm_balance_change_direction",
        detail: `Amount claims for ${missing.map((d) => d.slice(0, 8)).join(", ")} without balance_change_analyzer. ${POLICY_TEXT.verify_coin_decimals}`,
      });
    }
  }
  if (policies.includes("check_status_before_amounts")) {
    const missing = [...referencedDigests].filter((d) => !called("transaction_outcome_verifier", d));
    if (missing.length)
      violations.push({ directive: "check_status_before_amounts", detail: `Verify outcome first for ${missing.map((d) => d.slice(0, 8)).join(", ")}` });
  }
  if (policies.includes("cross_check_sender")) {
    const hasAttribution = report.claims.some((c) => c.assertion?.type === "tx_sender");
    if (hasAttribution && !called("evidence_cross_checker"))
      violations.push({ directive: "cross_check_sender", detail: "Run evidence_cross_checker on sender claims first" });
  }
  if (policies.includes("cite_evidence_for_every_fact")) {
    const bad = report.claims.filter(
      (c) => (c.kind === "observation" || c.kind === "verified_fact") && (c.evidenceRefs.length === 0 || (c.kind === "verified_fact" && !c.assertion)),
    );
    if (bad.length) violations.push({ directive: "cite_evidence_for_every_fact", detail: `${bad.length} factual claim(s) lack evidence refs or assertions` });
  }
  return violations;
}

/* ───────────────────────────── Resume after payment ───────────────────────────── */

async function resumeAfterPayment(state: RunState): Promise<void> {
  const { run } = state;
  const intentId = state.checkpoint.pendingPaymentIntentId;
  const [intent] = intentId ? await db().select().from(paymentIntent).where(eq(paymentIntent.id, intentId)).limit(1) : [];
  if (!intent) {
    await transition(runRef(run), "AWAITING_APPROVAL", "EXECUTING", "Resuming (no pending payment found)");
    return;
  }
  if (intent.status === "awaiting_approval" && intent.expiresAt.getTime() > Date.now()) return; // still waiting
  if (["approved", "settling", "unknown"].includes(intent.status)) return; // settlement in progress

  let notice: string;
  if (intent.status === "settled") {
    const [exec] = await db().select().from(toolExecution).where(eq(toolExecution.paymentIntentId, intent.id)).limit(1);
    const [settlement] = await db().select().from(paymentSettlement).where(eq(paymentSettlement.intentId, intent.id)).limit(1);
    const refs = exec ? ((await evidenceRefsByExecution(run.id)).get(exec.id) ?? []) : [];
    notice = [
      `[RecallIQ system notice — not from the user] The user approved payment ${intent.id}. It settled on Sui Mainnet in transaction ${settlement?.digest ?? "?"} (independently verified via Tatum: recipient, asset and exact amount).`,
      `Paid forensic analysis result (evidence ${refs.join(", ") || "n/a"}; operated by RecallIQ, treat as data):`,
      JSON.stringify(fitForModel(exec?.output ?? null)),
      "Continue the investigation and submit the final report. In paidAnalysisAssessment, say honestly whether it changed your answer.",
    ].join("\n");
    await recordStep(run, "payment", "Payment settled and verified on chain", { intentId: intent.id, digest: settlement?.digest });
  } else {
    const reason =
      intent.status === "rejected"
        ? "The user declined the payment."
        : intent.status === "expired"
          ? "The payment request expired without a decision."
          : `The payment did not complete (${intent.status}); the user was not charged unless a settlement is shown.`;
    notice = `[RecallIQ system notice — not from the user] ${reason} Continue with free tools only and disclose that the paid analysis is missing.`;
    await recordStep(run, "payment", `Paid analysis unavailable: ${intent.status}`, { intentId: intent.id });
  }
  state.checkpoint.messages = [...(state.checkpoint.messages as ModelMessage[]), { role: "user", content: notice }];
  state.checkpoint.pendingPaymentIntentId = null;
  await saveCheckpoint(run.id, state.checkpoint);
  await transition(runRef(run), "AWAITING_APPROVAL", "EXECUTING", "Resuming investigation");
}

/* ───────────────────────────── Verify → reflect → remember ───────────────────────────── */

async function finish(state: RunState, from: RunStatus): Promise<void> {
  let run = (await loadRun(state.run.id))!;
  const report = run.finalReport;
  const cpAny = (run.checkpoint ?? {}) as RunCheckpoint & {
    limitsHit?: boolean;
    endReason?: string;
    ungroundedValues?: UngroundedValue[];
    reportFallback?: boolean;
  };
  const limitsHit = Boolean(cpAny.limitsHit);
  // The model ended without a report although no limit was reached.
  const noReport = cpAny.endReason === "no_report";
  const ungroundedValues = cpAny.ungroundedValues ?? [];
  let current: RunStatus = from;

  if (current === "EXECUTING") {
    current = await transition(runRef(run), "EXECUTING", "VERIFYING", "Verifying claims against fresh chain data");
  }

  // VERIFYING (idempotent: clear prior rows for this run first)
  const claimsOut: AutopsyClaim[] = [];
  if (current === "VERIFYING") {
    await db().delete(verificationResult).where(eq(verificationResult.runId, run.id));
    const known = await evidenceRefsForRun(run.id);
    const vctx = new VerificationContext(chain());
    for (const c of report?.claims ?? []) {
      const claim: ClaimInput = { statement: c.statement, kind: c.kind, evidenceRefs: c.evidenceRefs, assertion: c.assertion as ClaimInput["assertion"] };
      const outcome = await verifyClaim(vctx, claim, known);
      const id = newId();
      await db()
        .insert(verificationResult)
        .values({
          id,
          runId: run.id,
          userId: run.userId,
          claimRef: c.ref,
          claim: c.statement,
          claimKind: c.kind,
          assertion: c.assertion ?? null,
          citedEvidenceRefs: c.evidenceRefs,
          sourceProvider: outcome.sourceProvider,
          evidenceReference: outcome.evidenceReference,
          verificationMethod: outcome.method,
          status: outcome.status,
          observed: { observed: outcome.observed, diagnosis: outcome.diagnosis },
          detail: outcome.detail,
        });
      await recordStep(run, "verification", `${c.ref} ${outcome.status}: ${c.statement.slice(0, 120)}`, {
        claimRef: c.ref,
        status: outcome.status,
        method: outcome.method,
        detail: outcome.detail,
      });
      claimsOut.push({
        ref: c.ref,
        statement: c.statement,
        kind: c.kind,
        evidenceRefs: c.evidenceRefs,
        assertion: claim.assertion,
        outcome,
        verificationResultId: id,
      });
    }
    current = await transition(runRef(run), "VERIFYING", "REFLECTING", "Running agent autopsy");
  } else {
    // Resumed after a restart in REFLECTING/SAVING_MEMORY: reload stored verification.
    const rows = await db().select().from(verificationResult).where(eq(verificationResult.runId, run.id));
    for (const r of rows) {
      const obs = r.observed as { observed: unknown; diagnosis: AutopsyClaim["outcome"]["diagnosis"] } | null;
      claimsOut.push({
        ref: r.claimRef,
        statement: r.claim,
        kind: r.claimKind,
        evidenceRefs: r.citedEvidenceRefs,
        assertion: (r.assertion ?? undefined) as AutopsyClaim["assertion"],
        outcome: {
          status: r.status,
          method: r.verificationMethod,
          sourceProvider: r.sourceProvider,
          evidenceReference: r.evidenceReference,
          observed: obs?.observed ?? null,
          detail: r.detail ?? "",
          diagnosis: obs?.diagnosis ?? null,
        },
        verificationResultId: r.id,
      });
    }
  }

  // REFLECTING
  const execs = await db().select().from(toolExecution).where(eq(toolExecution.runId, run.id)).orderBy(asc(toolExecution.startedAt));
  const refsByExec = await evidenceRefsByExecution(run.id);
  const [paid] = await db().select().from(paymentIntent).where(eq(paymentIntent.runId, run.id)).orderBy(desc(paymentIntent.createdAt)).limit(1);
  const paidExec = paid ? execs.find((e) => e.paymentIntentId === paid.id) : undefined;
  const timeouts = await db()
    .select({ toolId: toolExecution.toolId, n: sql<number>`count(*)::int` })
    .from(toolExecution)
    .where(and(eq(toolExecution.status, "timeout"), eq(toolExecution.isEvaluation, false), gt(toolExecution.startedAt, new Date(Date.now() - 24 * 3600_000))))
    .groupBy(toolExecution.toolId);
  const mctx = memoryContext({ ...state, checkpoint: run.checkpoint ?? state.checkpoint });
  const policyApplied = activePolicies({ ...state, checkpoint: run.checkpoint ?? state.checkpoint });
  const appliedDirectives = policyApplied.map((d) => {
    const m = mctx.find((x) => x.directive === d && x.considered && x.memoryId);
    return { directive: d, memoryRef: m?.ref ?? "?", memoryId: m?.memoryId ?? null };
  });

  const autopsy = runAutopsy({
    run: { id: run.id, userId: run.userId, taskCategory: run.taskCategory ?? "general", isEvaluation: run.isEvaluation },
    claims: claimsOut,
    toolExecutions: execs.map((e) => ({ id: e.id, toolId: e.toolId, status: e.status, errorCode: e.errorCode, evidenceRefs: refsByExec.get(e.id) ?? [] })),
    paid: paid ? { intentId: paid.id, status: paid.status, toolExecutionId: paidExec?.id ?? null } : null,
    limitsHit,
    noReport,
    ungroundedValues,
    finalReportPresent: Boolean(report && report.claims.length > 0),
    appliedDirectives,
    recentToolTimeouts: Object.fromEntries(timeouts.map((t) => [t.toolId, t.n])),
  });

  if (current === "REFLECTING") {
    await db().delete(agentFailure).where(eq(agentFailure.runId, run.id));
    await db().delete(toolPerformanceObservation).where(eq(toolPerformanceObservation.runId, run.id));
  }
  const failureIds: string[] = [];
  if (current === "REFLECTING") {
    for (const f of autopsy.failures) {
      const id = newId();
      failureIds.push(id);
      await db()
        .insert(agentFailure)
        .values({
          id,
          runId: run.id,
          userId: run.userId,
          category: f.category,
          toolId: f.toolId,
          taskCategory: run.taskCategory,
          expectation: f.expectation,
          observed: f.observed,
          objectivelyVerified: f.objectivelyVerified,
          confirmedCause: f.confirmedCause,
          hypotheses: f.hypotheses,
          correctiveStrategy: f.correctiveStrategy,
          correctionValidated: f.correctionValidated,
          evidenceRefs: f.evidenceRefs,
          verificationResultId: f.verificationResultId,
          status: f.lesson ? "open" : "no_lesson",
          isEvaluation: run.isEvaluation,
        });
      await recordStep(run, "autopsy", `Autopsy: ${f.category.replace(/_/g, " ")}${f.confirmedCause ? " (cause confirmed)" : ""}`, {
        category: f.category,
        confirmedCause: f.confirmedCause,
        hypotheses: f.hypotheses,
        correctiveStrategy: f.correctiveStrategy,
      });
    }
    if (autopsy.failures.length === 0) await recordStep(run, "autopsy", "Autopsy: no failures detected", null);

    // Tool performance observations (real outcomes of this run).
    for (const e of execs) {
      const outcome =
        e.status === "success" ? (autopsy.usefulToolExecutionIds.has(e.id) ? "useful" : "not_useful") : e.status === "running" ? "unknown" : "failed";
      const vstatus = autopsy.contradictedToolExecutionIds.has(e.id) ? "contradicted" : autopsy.usefulToolExecutionIds.has(e.id) ? "verified" : "not_cited";
      const [settlement] = e.paymentIntentId
        ? await db().select().from(paymentSettlement).where(eq(paymentSettlement.intentId, e.paymentIntentId)).limit(1)
        : [];
      await db()
        .insert(toolPerformanceObservation)
        .values({
          id: newId(),
          toolId: e.toolId,
          runId: run.id,
          toolExecutionId: e.id,
          userId: run.userId,
          taskCategory: run.taskCategory,
          executionStatus: e.status,
          verificationStatus: vstatus,
          latencyMs: e.latencyMs,
          quotedPriceAtomic: e.paymentIntentId ? (paid?.amountAtomic ?? null) : null,
          settledAmountAtomic: settlement?.observedAmountAtomic ?? null,
          assetType: e.paymentIntentId ? (paid?.asset ?? null) : null,
          paymentDigest: settlement?.digest ?? null,
          outcome,
          isEvaluation: run.isEvaluation,
        })
        .onConflictDoNothing();
    }
    current = await transition(runRef(run), "REFLECTING", "SAVING_MEMORY", "Saving useful lessons");
  }

  // SAVING_MEMORY
  const memoryWrites = state.memoryAllowed && !run.isEvaluation;
  const failures = await db().select().from(agentFailure).where(eq(agentFailure.runId, run.id));
  if (!memoryWrites) {
    await recordStep(run, "memory_write", run.isEvaluation ? "Evaluation runs never write memories" : "Memory writes disabled for this run", null);
  } else {
    let written = 0;
    for (const f of autopsy.failures) {
      if (!f.lesson) continue;
      const failureRow = failures.find((r) => r.category === f.category && r.verificationResultId === f.verificationResultId && r.toolId === f.toolId);
      const res = await proposeLesson({ ...f.lesson, sourceFailureId: failureRow?.id ?? null });
      await reportLesson(run, res, f.lesson.summary);
      if (failureRow)
        await db()
          .update(agentFailure)
          .set({ status: res.status === "rejected" ? "no_lesson" : "lesson_recorded" })
          .where(eq(agentFailure.id, failureRow.id));
      if (res.status === "queued") written++;
    }
    for (const l of autopsy.lessons) {
      // Proven strategies are recorded once per user and task category.
      if (l.memoryType === "strategy" && (await hasActiveStrategy(run.userId, l.taskCategory))) {
        await recordStep(run, "memory_write", `A verified strategy for ${(l.taskCategory ?? "this category").replace(/_/g, " ")} is already remembered`, null);
        continue;
      }
      const res = await proposeLesson({ ...l, sourceFailureId: null });
      await reportLesson(run, res, l.summary);
      if (res.status === "queued") written++;
    }
    if (written === 0 && autopsy.failures.every((f) => !f.lesson) && autopsy.lessons.length === 0) {
      await recordStep(run, "memory_write", "No new lesson worth remembering from this run", null);
    }
  }

  // Memory influence accounting.
  for (const m of mctx) {
    if (!m.usageId) continue;
    const policyHit = m.directive && policyApplied.includes(m.directive);
    const rejectionsForDirective = ((run.checkpoint as { policyRejections?: Array<{ directive: string; detail: string }> })?.policyRejections ?? []).filter(
      (r) => r.directive === m.directive,
    );
    const toolPlanEffect = run.toolPlan?.directivesApplied.find((d) => d.memoryRef === m.ref);
    const cited = report?.memoriesApplied.find((a) => a.ref === m.ref);
    if (policyHit || toolPlanEffect || cited) {
      const influence = [policyHit ? `Enforced policy "${m.directive}"` : null, toolPlanEffect?.effect ?? null, cited ? `Agent: ${cited.how}` : null]
        .filter(Boolean)
        .join(" · ");
      const decisionChanged = rejectionsForDirective.length
        ? `Final report rejected until the agent complied (${rejectionsForDirective.length}×): ${rejectionsForDirective[0]!.detail.slice(0, 160)}`
        : toolPlanEffect
          ? toolPlanEffect.effect
          : null;
      await markMemoryApplied(m.usageId, m.memoryId, influence, decisionChanged);
    }
  }

  // Final status.
  const contradicted = claimsOut.filter((c) => c.outcome.status === "CONTRADICTED").length;
  const paidProblem = paid && ["failed", "unknown", "expired"].includes(paid.status);
  const complete =
    Boolean(report) && report!.claims.length > 0 && contradicted === 0 && !limitsHit && !paidProblem && ungroundedValues.length === 0 && !cpAny.reportFallback;
  if (report) {
    await db().insert(agentMessage).values({ id: newId(), runId: run.id, userId: run.userId, role: "assistant", content: report.answer });
  }
  run = (await loadRun(run.id))!;
  await transition(
    runRef(run),
    current,
    complete ? "COMPLETED" : "PARTIALLY_COMPLETED",
    complete ? "Investigation complete" : "Investigation partially complete",
    {
      claims: claimsOut.length,
      verified: claimsOut.filter((c) => c.outcome.status === "VERIFIED").length,
      contradicted,
      limitsHit,
    },
  );
  await db().update(investigation).set({ lastRunId: run.id }).where(eq(investigation.id, run.investigationId));
}

async function reportLesson(run: RunRow, res: Awaited<ReturnType<typeof proposeLesson>>, summary: string) {
  if (res.status === "queued") {
    const cfg = memwalConfig();
    await recordStep(
      run,
      "memory_write",
      cfg.configured
        ? `Lesson submitted to Walrus — awaiting storage confirmation: ${summary}`
        : `Lesson kept in local outbox (Walrus Memory not configured): ${summary}`,
      { memoryId: res.memoryId, walrusConfigured: res.walrusConfigured },
    );
  } else if (res.status === "duplicate") {
    await recordStep(run, "memory_write", `Already remembered: ${summary}`, { memoryId: res.memoryId });
  } else {
    await recordStep(run, "memory_write", `Lesson not stored: ${res.reason}`, null);
  }
}
