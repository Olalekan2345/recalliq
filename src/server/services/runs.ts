/**
 * Investigation runs: creation (validated, rate-limited), cancellation, retry.
 * Every function is tenant-scoped by userId.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { agentRun, auditEvent, investigation } from "@/lib/db/schema";
import { agentLimits } from "@/lib/env";
import { newId } from "@/lib/security/ids";
import { hitRateLimit } from "@/lib/security/rate-limit";
import { parseTask } from "@/lib/ai/planning/task";
import { resolveModel } from "@/lib/ai/providers";
import { enqueue } from "@/server/jobs/queue";
import { getSettings, isGuestUser } from "./settings";
import { recordStep, TERMINAL_STATES, transition } from "./steps";

export const createRunSchema = z.object({
  task: z.string().trim().min(3, "Describe what you want investigated").max(2000),
  address: z.string().trim().max(80).optional().nullable(),
  digest: z.string().trim().max(60).optional().nullable(),
  investigationId: z.string().uuid().optional().nullable(),
  memoryMode: z.enum(["enabled", "disabled"]).default("enabled"),
});

export type CreateRunInput = z.infer<typeof createRunSchema>;

export class RunRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "RunRequestError";
  }
}

const ACTIVE_STATES = ["CREATED", "PLANNING", "RECALLING_MEMORY", "SELECTING_TOOLS", "EXECUTING", "VERIFYING", "REFLECTING", "SAVING_MEMORY"] as const;

export async function createRun(userId: string, input: CreateRunInput) {
  const model = resolveModel();
  if (!model.configured) throw new RunRequestError(`The AI model is not configured on this deployment (${model.reason}).`, 503, "llm_unconfigured");

  const limits = agentLimits();
  const guest = await isGuestUser(userId);
  const hourly = await hitRateLimit(`runs:user:${userId}`, limits.maxRunsPerHourPerUser, 3600);
  if (!hourly.allowed) throw new RunRequestError("Hourly investigation limit reached. Try again later.", 429, "rate_limited");
  if (guest) {
    const daily = await hitRateLimit(`runs:guest:${userId}`, limits.guestMaxRunsPerDay, 86_400);
    if (!daily.allowed) throw new RunRequestError("Guest limit reached for today. Create a free account to continue.", 429, "guest_limit");
  }
  const [{ active } = { active: 0 }] = await db()
    .select({ active: sql<number>`count(*)::int` })
    .from(agentRun)
    .where(and(eq(agentRun.userId, userId), inArray(agentRun.status, [...ACTIVE_STATES]), eq(agentRun.isEvaluation, false)));
  if (active >= limits.maxConcurrentRunsPerUser) {
    throw new RunRequestError(`You already have ${active} investigation(s) running. Wait for one to finish or cancel it.`, 429, "concurrency");
  }

  const parsed = parseTask(input.task, { address: input.address, digest: input.digest });
  if (input.address && !parsed.inputs.addresses.length) throw new RunRequestError("The wallet address is not a valid Sui address.", 400, "invalid_address");
  if (input.digest && !parsed.inputs.digests.length) throw new RunRequestError("The transaction digest is not a valid Sui digest.", 400, "invalid_digest");

  const settings = await getSettings(userId);
  const runId = newId();
  let investigationId = input.investigationId ?? null;

  await db().transaction(async (tx) => {
    if (investigationId) {
      const [inv] = await tx
        .select({ id: investigation.id })
        .from(investigation)
        .where(and(eq(investigation.id, investigationId), eq(investigation.userId, userId)))
        .limit(1);
      if (!inv) throw new RunRequestError("Investigation not found", 404, "not_found");
    } else {
      investigationId = newId();
      await tx.insert(investigation).values({ id: investigationId, userId, title: input.task.slice(0, 120) });
    }
    await tx.insert(agentRun).values({
      id: runId,
      investigationId: investigationId!,
      userId,
      task: input.task,
      inputs: parsed.inputs,
      taskCategory: parsed.category,
      memoryMode: input.memoryMode,
      analysisDepth: settings.analysisDepth,
      provider: model.provider,
      model: model.modelId,
      limits: {
        maxToolCalls: limits.maxToolCalls,
        maxIterations: limits.maxIterations,
        maxDurationMs: limits.maxDurationMs,
        maxOutputTokens: limits.maxOutputTokens,
      },
    });
    await tx.update(investigation).set({ lastRunId: runId, lastStatus: "CREATED", updatedAt: new Date() }).where(eq(investigation.id, investigationId!));
    await tx
      .insert(auditEvent)
      .values({ id: newId(), userId, actor: "user", action: "run.created", targetType: "agent_run", targetId: runId, metadata: { category: parsed.category } });
    await enqueue("agent.run", { runId }, { idempotencyKey: `agent.run:${runId}`, maxAttempts: 3 }, tx);
  });
  await recordStep({ id: runId, userId }, "state", "Investigation queued", { category: parsed.category, signals: parsed.signals }, "CREATED");
  return { runId, investigationId: investigationId!, category: parsed.category };
}

export async function cancelRun(userId: string, runId: string) {
  const [run] = await db()
    .select()
    .from(agentRun)
    .where(and(eq(agentRun.id, runId), eq(agentRun.userId, userId)))
    .limit(1);
  if (!run) throw new RunRequestError("Run not found", 404, "not_found");
  if (TERMINAL_STATES.has(run.status)) return { status: run.status };
  await db().update(agentRun).set({ cancelRequested: true, updatedAt: new Date() }).where(eq(agentRun.id, runId));
  // Not actively executing in a worker: cancel immediately.
  if (run.status === "CREATED" || run.status === "AWAITING_APPROVAL") {
    await transition({ id: run.id, userId, investigationId: run.investigationId }, run.status, "CANCELLED", "Investigation cancelled by the user");
    return { status: "CANCELLED" as const };
  }
  return { status: run.status, cancelRequested: true };
}

export async function retryRun(userId: string, runId: string) {
  const [run] = await db()
    .select()
    .from(agentRun)
    .where(and(eq(agentRun.id, runId), eq(agentRun.userId, userId)))
    .limit(1);
  if (!run) throw new RunRequestError("Run not found", 404, "not_found");
  if (!TERMINAL_STATES.has(run.status)) throw new RunRequestError("Only finished runs can be retried", 409, "not_finished");
  return createRun(userId, { task: run.task, investigationId: run.investigationId, memoryMode: run.memoryMode });
}
