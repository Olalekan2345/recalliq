/**
 * Serverless job execution (WORKER_MODE=serverless, used on Vercel).
 *
 * There is no long-running worker. A request that queues work (or a page that
 * may be waiting on some) calls `scheduleDrain()`, and once its response is
 * sent the same function runs the ready jobs with `drainJobs()`, inside the
 * platform's time limit. Short follow-ups that are due soon (a Walrus storage
 * confirmation, a payment reconciliation) are waited for while time remains;
 * anything left over is picked up by the next drain: a later request, a viewer
 * watching a run, or the daily cron (/api/jobs/drain). Concurrent drains are
 * safe: `claim` leases jobs with FOR UPDATE SKIP LOCKED, and a job cut off by
 * the time limit is reclaimed when its lease expires and resumes from its
 * checkpoint.
 */
import { after } from "next/server";
import { env } from "@/lib/env";
import { logger } from "@/lib/logging/logger";
import { safeErrorMessage } from "@/lib/security/redact";
import { expireStaleIntents } from "@/server/services/payments";
import { latestHealth, runHealthChecks } from "@/server/services/health";
import { claim, nextDueAt, type JobType } from "./queue";
import { LEASE_MS, newWorkerId, runJob, startupTasks } from "./worker";

const log = logger("drain");

/** Routes that drain declare `maxDuration = 300`; the drain stops well before that. */
export const DRAIN_BUDGET_MS = 270_000;
/** Longest wait for a job that is due soon. */
const MAX_WAIT_MS = 30_000;
const HEALTH_MAX_AGE_MS = 10 * 60_000;
/** Jobs that run the agent need a full time budget; the others are short. */
const LONG_TYPES: JobType[] = ["agent.run", "agent.resume", "evaluation.run"];
const SHORT_TYPES: JobType[] = ["memory.submit", "memory.confirm", "payment.settle", "payment.reconcile"];

const g = globalThis as unknown as { __recalliqStartupDone?: Promise<void> };

export interface DrainResult {
  ran: number;
  stoppedBecause: "idle" | "budget";
  /** An agent-run job was ready but this drain no longer had time for it; a fresh drain was requested. */
  handedOff: boolean;
}

/**
 * Run ready jobs until the queue is idle or the budget is spent. If an
 * agent-run job is ready when too little time is left to finish it, `handOff`
 * starts a fresh drain (by default: a request to /api/jobs/drain). `now`,
 * `sleep` and `handOff` are injectable for tests.
 */
export async function drainJobs(
  opts: { budgetMs?: number; now?: () => number; sleep?: (ms: number) => Promise<void>; handOff?: () => Promise<void> } = {},
): Promise<DrainResult> {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const handOff = opts.handOff ?? requestFreshDrain;
  const deadline = now() + (opts.budgetMs ?? DRAIN_BUDGET_MS);
  const workerId = newWorkerId();
  // A full agent run needs its own budget plus room to record the outcome.
  const longJobNeeds = env().AGENT_MAX_DURATION_MS + 15_000;

  g.__recalliqStartupDone ??= startupTasks();
  await g.__recalliqStartupDone;
  await expireStaleIntents().catch((err) => log.error("expire intents failed", { err: safeErrorMessage(err) }));

  const finish = async (ran: number, stoppedBecause: DrainResult["stoppedBecause"]): Promise<DrainResult> => {
    if (deadline - now() >= longJobNeeds) return { ran, stoppedBecause, handedOff: false };
    const due = await nextDueAt(LONG_TYPES);
    if (!due || due.getTime() > now() + MAX_WAIT_MS) return { ran, stoppedBecause, handedOff: false };
    await handOff().catch((err) => log.error("drain hand-off failed", { err: safeErrorMessage(err) }));
    return { ran, stoppedBecause, handedOff: true };
  };

  let ran = 0;
  for (;;) {
    const left = deadline - now();
    if (left < 5_000) return finish(ran, "budget");
    const types = left >= longJobNeeds ? undefined : SHORT_TYPES;
    const [job] = await claim(workerId, 1, LEASE_MS, types);
    if (job) {
      await runJob(job, workerId);
      ran++;
      continue;
    }
    // Nothing ready: wait for a job due soon (e.g. a Walrus confirmation polled every few seconds).
    const due = await nextDueAt(types);
    if (!due) return finish(ran, "idle");
    const wait = Math.max(250, due.getTime() - now());
    if (wait > MAX_WAIT_MS) return finish(ran, "idle");
    if (wait > left - 10_000) return finish(ran, "budget");
    await sleep(wait);
  }
}

/**
 * Start a drain in a new function invocation, which gets a full time budget.
 * Uses the public app URL (production domains are not behind deployment
 * protection) and the cron secret; the route answers 202 at once.
 */
export async function requestFreshDrain(): Promise<void> {
  const { NEXT_PUBLIC_APP_URL: base, CRON_SECRET: secret } = env();
  if (!base || !secret) {
    log.warn("cannot hand off drain: NEXT_PUBLIC_APP_URL or CRON_SECRET is not set");
    return;
  }
  const res = await fetch(new URL("/api/jobs/drain", base), {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`drain hand-off returned ${res.status}`);
}

/** Record fresh integration health when the last check is older than ten minutes. */
export async function refreshHealthIfStale(): Promise<void> {
  const latest = await latestHealth().catch(() => []);
  const newest = Math.max(0, ...latest.map((h) => new Date(h.checkedAt).getTime()));
  if (Date.now() - newest > HEALTH_MAX_AGE_MS) await runHealthChecks(true).catch(() => undefined);
}

/**
 * In serverless mode, run queued jobs after the current response is sent. A
 * no-op in the other modes (a worker loop handles them) and outside a request.
 */
export function scheduleDrain(opts: { health?: boolean } = {}): void {
  if (env().WORKER_MODE !== "serverless") return;
  try {
    after(async () => {
      try {
        const res = await drainJobs();
        if (res.ran > 0) log.info("drained", { ...res });
        if (opts.health) await refreshHealthIfStale();
      } catch (err) {
        log.error("drain failed", { err: safeErrorMessage(err) });
      }
    });
  } catch {
    // Not inside a request: nothing to attach to; the next request drains instead.
  }
}

/**
 * In serverless mode, start draining now, alongside a long response (the run
 * event stream), and keep the function alive until the drain finishes. A run
 * whose original drain was cut off is picked up as soon as someone watches it.
 */
export function startDrainAlongside(): void {
  if (env().WORKER_MODE !== "serverless") return;
  const running = drainJobs().catch((err) => log.error("drain failed", { err: safeErrorMessage(err) }));
  try {
    after(() => running);
  } catch {
    // Not inside a request.
  }
}

/** In serverless mode, refresh stale integration health after the response (homepage status panel). */
export function scheduleHealthRefresh(): void {
  if (env().WORKER_MODE !== "serverless") return;
  try {
    after(() => refreshHealthIfStale());
  } catch {
    // Not inside a request.
  }
}
