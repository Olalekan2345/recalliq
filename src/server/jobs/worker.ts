/**
 * Background worker: leases jobs from PostgreSQL and runs them.
 *
 * Runs either inside the Next.js server process (WORKER_MODE=inline, simple
 * single-service hosting) or as a dedicated process (`pnpm worker`,
 * WORKER_MODE=external on the web service). Safe to run several workers.
 */
import { hostname } from "node:os";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { agentRun, job } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { logger } from "@/lib/logging/logger";
import { randomToken } from "@/lib/security/ids";
import { safeErrorMessage } from "@/lib/security/redact";
import { confirmMemory, resumeMemoryOutbox, retryFailedMemory, submitMemory } from "@/lib/memory/service";
import { executeRun } from "@/lib/ai/orchestrator/run-agent";
import { runEvaluation } from "@/lib/ai/evaluation/harness";
import { syncToolDefinitions } from "@/lib/ai/tools/registry";
import { expireStaleIntents, reconcilePayment, settlePayment } from "@/server/services/payments";
import { runHealthChecks } from "@/server/services/health";
import { claim, complete, enqueue, extendLease, fail, reschedule, type JobRow, type JobType } from "./queue";

const log = logger("worker");
const LEASE_MS = 5 * 60_000;

type HandlerResult = { reschedule?: number } | void;
type Handler = (job: JobRow, heartbeat: () => Promise<void>) => Promise<HandlerResult>;

const str = (job: JobRow, key: string): string => {
  const v = job.payload[key];
  if (typeof v !== "string" || !v) throw new Error(`Job ${job.type} missing ${key}`);
  return v;
};

export const HANDLERS: Record<JobType, Handler> = {
  "agent.run": async (job, heartbeat) => executeRun(str(job, "runId"), { heartbeat }),
  "agent.resume": async (job, heartbeat) => executeRun(str(job, "runId"), { heartbeat }),
  "memory.submit": async (job) => {
    await submitMemory(str(job, "memoryId"));
  },
  "memory.confirm": async (job) => {
    const outcome = await confirmMemory(str(job, "memoryId"));
    if (outcome === "pending") return { reschedule: Math.min(60_000, 10_000 + job.attempts * 5_000) };
    // Resubmit the same outbox text under a fresh relayer key, within the storage attempt budget.
    if (outcome === "failed") await retryFailedMemory(str(job, "memoryId"));
  },
  "payment.settle": async (job) => {
    await settlePayment(str(job, "intentId"));
  },
  "payment.reconcile": async (job) => {
    const outcome = await reconcilePayment(str(job, "intentId"));
    if (outcome === "pending") return { reschedule: 15_000 };
  },
  "evaluation.run": async (job, heartbeat) => runEvaluation(str(job, "evaluationRunId"), heartbeat),
};

export interface WorkerHandle {
  stop(): Promise<void>;
}

/**
 * Runs left mid-flight whose job is gone (dead after repeated crashes) get a
 * fresh recovery job. Jobs that merely lost their worker are reclaimed by
 * `claim` once their lease expires, so they are left alone here.
 */
async function recoverInterruptedRuns(): Promise<void> {
  const stuck = await db()
    .select({ id: agentRun.id })
    .from(agentRun)
    .where(
      and(
        inArray(agentRun.status, ["CREATED", "PLANNING", "RECALLING_MEMORY", "SELECTING_TOOLS", "EXECUTING", "VERIFYING", "REFLECTING", "SAVING_MEMORY"]),
        eq(agentRun.isEvaluation, false),
      ),
    );
  for (const r of stuck) {
    const live = await db()
      .select({ id: job.id })
      .from(job)
      .where(and(inArray(job.status, ["queued", "running"]), inArray(job.type, ["agent.run", "agent.resume"]), sql`${job.payload}->>'runId' = ${r.id}`))
      .limit(1);
    if (live.length === 0) {
      await enqueue("agent.run", { runId: r.id }, { idempotencyKey: `agent.run:${r.id}:recover:${Date.now()}`, maxAttempts: 2 });
      log.warn("re-queued interrupted run", { runId: r.id });
    }
  }
}

export function startWorker(opts: { concurrency?: number; pollMs?: number } = {}): WorkerHandle {
  const workerId = `${hostname()}:${process.pid}:${randomToken(4)}`;
  const concurrency = opts.concurrency ?? env().WORKER_CONCURRENCY;
  const pollMs = opts.pollMs ?? 1_000;
  let stopping = false;
  const running = new Set<Promise<void>>();

  const runJob = async (job: JobRow) => {
    const heartbeat = () => extendLease(job.id, workerId, LEASE_MS);
    const t = Date.now();
    try {
      const res = await HANDLERS[job.type as JobType](job, heartbeat);
      if (res && typeof res.reschedule === "number") await reschedule(job.id, res.reschedule);
      else await complete(job.id);
      log.info("job done", { type: job.type, id: job.id, ms: Date.now() - t });
    } catch (err) {
      const outcome = await fail(job, err);
      log.error("job failed", { type: job.type, id: job.id, attempt: job.attempts, outcome, err: safeErrorMessage(err) });
    }
  };

  const loop = async () => {
    await syncToolDefinitions().catch((err) => log.error("tool sync failed", { err: safeErrorMessage(err) }));
    await recoverInterruptedRuns().catch((err) => log.error("run recovery failed", { err: safeErrorMessage(err) }));
    await resumeMemoryOutbox().catch((err) => log.error("memory outbox resume failed", { err: safeErrorMessage(err) }));
    let lastMaintenance = 0;
    let lastHealth = 0;
    while (!stopping) {
      try {
        if (Date.now() - lastMaintenance > 60_000) {
          lastMaintenance = Date.now();
          await expireStaleIntents();
        }
        if (Date.now() - lastHealth > 5 * 60_000) {
          lastHealth = Date.now();
          void runHealthChecks(true).catch(() => undefined);
        }
        const free = concurrency - running.size;
        if (free > 0) {
          const jobs = await claim(workerId, free, LEASE_MS);
          for (const job of jobs) {
            const p = runJob(job).finally(() => running.delete(p));
            running.add(p);
          }
          if (jobs.length > 0) continue;
        }
      } catch (err) {
        log.error("worker loop error", { err: safeErrorMessage(err) });
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }
  };

  log.info("worker started", { workerId, concurrency });
  const main = loop();
  return {
    async stop() {
      stopping = true;
      await main.catch(() => undefined);
      await Promise.allSettled([...running]);
      log.info("worker stopped", { workerId });
    },
  };
}
