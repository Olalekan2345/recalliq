/**
 * Learning evaluation harness.
 *
 * For each user-supplied task, run the real agent twice under identical model,
 * tools and limits: once with memory disabled (baseline) and once with Walrus
 * memory recall enabled. Both runs hit live providers. Evaluation runs never
 * spend funds and never write memories, so they cannot contaminate production
 * statistics or the comparison itself.
 *
 * Optional, explicitly labelled fault injection (same fault in both modes)
 * tests recovery behaviour.
 *
 * The conclusion is computed, not asserted: a two-sided sign test over paired
 * tasks; anything below the significance bar is reported as inconclusive.
 */
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  agentFailure,
  agentRun,
  evaluationResult,
  evaluationRun,
  investigation,
  memoryUsage,
  toolExecution,
  verificationResult,
  type EvaluationSummary,
  type EvaluationTask,
  type FaultInjection,
} from "@/lib/db/schema";
import { agentLimits } from "@/lib/env";
import { logger } from "@/lib/logging/logger";
import { newId } from "@/lib/security/ids";
import { safeErrorMessage } from "@/lib/security/redact";
import { parseTask } from "@/lib/ai/planning/task";
import { resolveModel } from "@/lib/ai/providers";
import { executeRun } from "@/lib/ai/orchestrator/run-agent";
import { enqueue } from "@/server/jobs/queue";
import { getSettings } from "@/server/services/settings";

const log = logger("evaluation");

export const METHODOLOGY = [
  "Paired design: every task runs once with memory disabled (baseline) and once with Walrus memory recall enabled, sequentially, with the same model, tool registry and execution limits.",
  "Both modes query live Sui Mainnet data through Tatum; results are independently verified claim-by-claim against fresh chain reads.",
  "Evaluation runs never spend funds and never write new memories.",
  "Metrics: completion, verified / contradicted / unverified claims, tool calls and failures, duration, memories retrieved/applied, decisions changed by memory, and repeated errors (failure categories the user had already hit in earlier production runs).",
  "Conclusion: two-sided sign test on paired outcomes (fewer contradictions + repeated errors is better). p ≥ 0.05 or fewer than 5 informative pairs ⇒ inconclusive.",
].join("\n");

export async function createEvaluation(
  userId: string,
  input: { name: string; tasks: EvaluationTask[]; faultInjection?: FaultInjection | null },
): Promise<string> {
  const model = resolveModel();
  if (!model.configured) throw new Error(`LLM provider not configured: ${model.reason}`);
  const limits = agentLimits();
  const id = newId();
  const modes: Array<"baseline" | "memory"> = ["baseline", "memory"];
  await db().transaction(async (tx) => {
    await tx.insert(evaluationRun).values({
      id,
      userId,
      name: input.name.slice(0, 120),
      methodology: METHODOLOGY,
      tasks: input.tasks,
      modes,
      faultInjection: input.faultInjection ?? null,
      provider: model.provider,
      model: model.modelId,
      limits: {
        maxToolCalls: limits.maxToolCalls,
        maxIterations: limits.maxIterations,
        maxDurationMs: limits.maxDurationMs,
        maxOutputTokens: limits.maxOutputTokens,
      },
      status: "queued",
    });
    for (let i = 0; i < input.tasks.length; i++) {
      for (const mode of modes) {
        await tx.insert(evaluationResult).values({ id: newId(), evaluationRunId: id, userId, taskIndex: i, mode, status: "pending" });
      }
    }
    await enqueue("evaluation.run", { evaluationRunId: id }, { idempotencyKey: `evaluation.run:${id}`, maxAttempts: 3 }, tx);
  });
  return id;
}

async function runOne(evalRow: typeof evaluationRun.$inferSelect, taskIndex: number, mode: "baseline" | "memory", heartbeat?: () => Promise<void>) {
  const task = evalRow.tasks[taskIndex]!;
  const parsed = parseTask(task.task);
  const settings = await getSettings(evalRow.userId);
  const invId = newId();
  const runId = newId();
  const started = new Date();
  await db()
    .insert(investigation)
    .values({ id: invId, userId: evalRow.userId, title: `[Eval] ${task.task.slice(0, 80)}`, isEvaluation: true, lastRunId: runId });
  await db()
    .insert(agentRun)
    .values({
      id: runId,
      investigationId: invId,
      userId: evalRow.userId,
      task: task.task,
      inputs: parsed.inputs,
      taskCategory: parsed.category,
      memoryMode: mode === "memory" ? "enabled" : "disabled",
      analysisDepth: settings.analysisDepth,
      isEvaluation: true,
      evaluationRunId: evalRow.id,
      faultInjection: evalRow.faultInjection,
      limits: evalRow.limits,
    });
  await db()
    .update(evaluationResult)
    .set({ status: "running", agentRunId: runId })
    .where(and(eq(evaluationResult.evaluationRunId, evalRow.id), eq(evaluationResult.taskIndex, taskIndex), eq(evaluationResult.mode, mode)));

  await executeRun(runId, { heartbeat });
  const metrics = await collectRunMetrics(runId, evalRow.userId, started);
  await db()
    .update(evaluationResult)
    .set({ status: "done", ...metrics })
    .where(and(eq(evaluationResult.evaluationRunId, evalRow.id), eq(evaluationResult.taskIndex, taskIndex), eq(evaluationResult.mode, mode)));
}

export async function collectRunMetrics(runId: string, userId: string, startedBefore: Date) {
  const [run] = await db().select().from(agentRun).where(eq(agentRun.id, runId)).limit(1);
  const ver = await db()
    .select({ status: verificationResult.status, n: sql<number>`count(*)::int` })
    .from(verificationResult)
    .where(eq(verificationResult.runId, runId))
    .groupBy(verificationResult.status);
  const count = (s: string) => ver.find((v) => v.status === s)?.n ?? 0;
  const [{ failures } = { failures: 0 }] = await db()
    .select({ failures: sql<number>`count(*)::int` })
    .from(toolExecution)
    .where(and(eq(toolExecution.runId, runId), sql`${toolExecution.status} not in ('success','running')`));
  const usage = await db().select().from(memoryUsage).where(eq(memoryUsage.runId, runId));
  const runFailures = await db().select({ category: agentFailure.category }).from(agentFailure).where(eq(agentFailure.runId, runId));
  const prior = runFailures.length
    ? await db()
        .select({ category: agentFailure.category })
        .from(agentFailure)
        .where(
          and(
            eq(agentFailure.userId, userId),
            eq(agentFailure.isEvaluation, false),
            lt(agentFailure.createdAt, startedBefore),
            inArray(
              agentFailure.category,
              runFailures.map((f) => f.category),
            ),
          ),
        )
    : [];
  const priorCats = new Set(prior.map((p) => p.category));
  return {
    completed: run?.status === "COMPLETED",
    verifiedClaims: count("VERIFIED") + count("PARTIALLY_VERIFIED"),
    contradictedClaims: count("CONTRADICTED"),
    unverifiedClaims: count("UNVERIFIED") + count("UNAVAILABLE"),
    toolCalls: run?.toolCallCount ?? 0,
    toolFailures: failures,
    paidSpendAtomic: "0",
    modelCostMicroUsd: run?.modelCostMicroUsd ?? null,
    durationMs: run?.startedAt && run.completedAt ? run.completedAt.getTime() - run.startedAt.getTime() : null,
    memoriesRetrieved: usage.length,
    memoriesApplied: usage.filter((u) => u.disposition === "applied").length,
    decisionsChanged: usage.map((u) => u.decisionChanged).filter((d): d is string => Boolean(d)),
    repeatedErrors: runFailures.filter((f) => priorCats.has(f.category)).length,
  };
}

/** Two-sided exact binomial sign test, p = P(|X - n/2| ≥ |k - n/2|) under p=0.5. */
export function signTestPValue(better: number, worse: number): number | null {
  const n = better + worse;
  if (n === 0) return null;
  const k = Math.max(better, worse);
  let tail = 0;
  for (let i = k; i <= n; i++) tail += binom(n, i);
  return Math.min(1, (2 * tail) / 2 ** n);
}

function binom(n: number, k: number): number {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

type ResultRow = typeof evaluationResult.$inferSelect;

export function summarize(rows: ResultRow[]): EvaluationSummary {
  const modes: EvaluationSummary["modes"] = {};
  for (const mode of ["baseline", "memory"]) {
    const rs = rows.filter((r) => r.mode === mode && r.status === "done");
    const durations = rs
      .map((r) => r.durationMs)
      .filter((d): d is number => d !== null)
      .sort((a, b) => a - b);
    modes[mode] = {
      runs: rs.length,
      completed: rs.filter((r) => r.completed).length,
      verifiedClaims: rs.reduce((s, r) => s + (r.verifiedClaims ?? 0), 0),
      contradictedClaims: rs.reduce((s, r) => s + (r.contradictedClaims ?? 0), 0),
      unverifiedClaims: rs.reduce((s, r) => s + (r.unverifiedClaims ?? 0), 0),
      toolCalls: rs.reduce((s, r) => s + (r.toolCalls ?? 0), 0),
      toolFailures: rs.reduce((s, r) => s + (r.toolFailures ?? 0), 0),
      memoriesApplied: rs.reduce((s, r) => s + (r.memoriesApplied ?? 0), 0),
      medianDurationMs: durations.length ? durations[Math.floor(durations.length / 2)]! : null,
      repeatedErrors: rs.reduce((s, r) => s + (r.repeatedErrors ?? 0), 0),
    };
  }
  const byTask = new Map<number, { baseline?: ResultRow; memory?: ResultRow }>();
  for (const r of rows.filter((x) => x.status === "done")) {
    const e = byTask.get(r.taskIndex) ?? {};
    e[r.mode] = r;
    byTask.set(r.taskIndex, e);
  }
  let better = 0;
  let worse = 0;
  let pairs = 0;
  for (const { baseline, memory } of byTask.values()) {
    if (!baseline || !memory) continue;
    pairs++;
    const b = (baseline.contradictedClaims ?? 0) + (baseline.repeatedErrors ?? 0);
    const m = (memory.contradictedClaims ?? 0) + (memory.repeatedErrors ?? 0);
    if (m < b) better++;
    else if (m > b) worse++;
  }
  const p = signTestPValue(better, worse);
  const informative = better + worse;
  const inconclusive = informative < 5 || p === null || p >= 0.05;
  const conclusion = inconclusive
    ? `Inconclusive: ${pairs} paired task(s); memory better in ${better}, worse in ${worse}, tied in ${pairs - informative}${p !== null ? ` (sign test p=${p.toFixed(3)})` : ""}. More paired tasks are needed before claiming an effect.`
    : `Memory-enabled runs had fewer contradictions/repeated errors in ${better} of ${informative} informative pairs (sign test p=${p!.toFixed(3)}), worse in ${worse}.`;
  return { sampleSize: pairs, modes, conclusion, inconclusive };
}

/**
 * Job handler: resumable — finished task×mode results are skipped. With
 * `maxUnits` (serverless hosting, where one function cannot run a whole
 * evaluation) it runs at most that many task×mode units and returns "more"
 * while work remains; units that already failed are not retried by a later step.
 */
export async function runEvaluation(evaluationRunId: string, heartbeat?: () => Promise<void>, opts: { maxUnits?: number } = {}): Promise<"done" | "more"> {
  const [evalRow] = await db().select().from(evaluationRun).where(eq(evaluationRun.id, evaluationRunId)).limit(1);
  if (!evalRow || evalRow.status === "completed" || evalRow.status === "cancelled") return "done";
  await db().update(evaluationRun).set({ status: "running" }).where(eq(evaluationRun.id, evaluationRunId));
  const rows = await db().select().from(evaluationResult).where(eq(evaluationResult.evaluationRunId, evaluationRunId));
  const stepped = opts.maxUnits !== undefined;
  let units = 0;
  for (let i = 0; i < evalRow.tasks.length; i++) {
    for (const mode of ["baseline", "memory"] as const) {
      const row = rows.find((r) => r.taskIndex === i && r.mode === mode);
      if (row?.status === "done" || (stepped && row?.status === "failed")) continue;
      if (stepped && units >= opts.maxUnits!) return "more";
      units++;
      try {
        await runOne(evalRow, i, mode, heartbeat);
      } catch (err) {
        log.error("evaluation task failed", { evaluationRunId, taskIndex: i, mode, err: safeErrorMessage(err) });
        await db()
          .update(evaluationResult)
          .set({ status: "failed" })
          .where(and(eq(evaluationResult.evaluationRunId, evaluationRunId), eq(evaluationResult.taskIndex, i), eq(evaluationResult.mode, mode)));
      }
    }
  }
  const finalRows = await db().select().from(evaluationResult).where(eq(evaluationResult.evaluationRunId, evaluationRunId));
  await db()
    .update(evaluationRun)
    .set({ status: "completed", summary: summarize(finalRows), completedAt: new Date() })
    .where(eq(evaluationRun.id, evaluationRunId));
  return "done";
}
