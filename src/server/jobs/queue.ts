/**
 * Durable PostgreSQL job queue.
 *
 *  - enqueue is idempotent on `idempotencyKey` (unique partial index)
 *  - claim uses FOR UPDATE SKIP LOCKED with a lease; a crashed worker's jobs
 *    become claimable again when the lease expires (restart recovery)
 *  - attempts are bounded; exhausted jobs go to `dead` with the last error
 *  - `reschedule` (polling: "not finished yet") does not consume an attempt
 */
import { and, eq, sql } from "drizzle-orm";
import { db, rowsOf, type Database, type Tx } from "@/lib/db/client";
import { job } from "@/lib/db/schema";
import { newId } from "@/lib/security/ids";
import { safeErrorMessage } from "@/lib/security/redact";

export type JobType = "agent.run" | "agent.resume" | "memory.submit" | "memory.confirm" | "payment.settle" | "payment.reconcile" | "evaluation.run";

export type JobRow = typeof job.$inferSelect;

export interface EnqueueOptions {
  runAt?: Date;
  delayMs?: number;
  idempotencyKey?: string;
  maxAttempts?: number;
}

export async function enqueue(
  type: JobType,
  payload: Record<string, unknown>,
  opts: EnqueueOptions = {},
  executor: Database | Tx = db(),
): Promise<{ id: string; created: boolean }> {
  const id = newId();
  const runAt = opts.runAt ?? new Date(Date.now() + (opts.delayMs ?? 0));
  const rows = await executor
    .insert(job)
    .values({
      id,
      type,
      payload,
      runAt,
      maxAttempts: opts.maxAttempts ?? 5,
      idempotencyKey: opts.idempotencyKey ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: job.id });
  if (rows.length > 0) return { id, created: true };
  // Idempotent duplicate: return the existing job.
  if (opts.idempotencyKey) {
    const [existing] = await executor.select({ id: job.id }).from(job).where(eq(job.idempotencyKey, opts.idempotencyKey)).limit(1);
    if (existing) return { id: existing.id, created: false };
  }
  return { id, created: false };
}

/** Claim up to `limit` ready jobs (or jobs whose lease expired). */
export async function claim(workerId: string, limit: number, leaseMs: number, types?: JobType[]): Promise<JobRow[]> {
  const database = db();
  const typeFilter =
    types && types.length
      ? sql`and type in (${sql.join(
          types.map((t) => sql`${t}`),
          sql`, `,
        )})`
      : sql``;
  const lockedUntil = new Date(Date.now() + leaseMs);
  const result = await database.execute(sql`
    update job set
      status = 'running',
      locked_by = ${workerId},
      locked_until = ${lockedUntil.toISOString()}::timestamptz,
      attempts = attempts + 1,
      updated_at = now()
    where id in (
      select id from job
      where (
        (status = 'queued' and run_at <= now())
        or (status = 'running' and locked_until < now())
      )
      ${typeFilter}
      order by run_at asc
      limit ${limit}
      for update skip locked
    )
    returning id
  `);
  const ids = rowsOf<{ id: string }>(result).map((r) => r.id);
  if (ids.length === 0) return [];
  const rows = await database
    .select()
    .from(job)
    .where(
      sql`${job.id} in (${sql.join(
        ids.map((i) => sql`${i}`),
        sql`, `,
      )})`,
    );
  // Jobs that exceeded their attempt budget (e.g. repeated crashes) are retired, not run.
  const runnable: JobRow[] = [];
  for (const r of rows) {
    if (r.attempts > r.maxAttempts) {
      await database
        .update(job)
        .set({ status: "dead", lastError: r.lastError ?? "attempt budget exhausted", lockedBy: null, lockedUntil: null, updatedAt: new Date() })
        .where(eq(job.id, r.id));
    } else {
      runnable.push(r);
    }
  }
  return runnable;
}

export async function extendLease(jobId: string, workerId: string, leaseMs: number): Promise<void> {
  await db()
    .update(job)
    .set({ lockedUntil: new Date(Date.now() + leaseMs), updatedAt: new Date() })
    .where(and(eq(job.id, jobId), eq(job.lockedBy, workerId)));
}

export async function complete(jobId: string): Promise<void> {
  await db().update(job).set({ status: "succeeded", lockedBy: null, lockedUntil: null, updatedAt: new Date() }).where(eq(job.id, jobId));
}

/** "Not done yet" — check again later without consuming an attempt. */
export async function reschedule(jobId: string, delayMs: number): Promise<void> {
  await db()
    .update(job)
    .set({
      status: "queued",
      runAt: new Date(Date.now() + delayMs),
      attempts: sql`greatest(${job.attempts} - 1, 0)`,
      lockedBy: null,
      lockedUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(job.id, jobId));
}

export class NonRetryableJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableJobError";
  }
}

export function backoffMs(attempt: number): number {
  return Math.min(5 * 60_000, 2 ** Math.max(0, attempt - 1) * 5_000);
}

export async function fail(row: JobRow, err: unknown): Promise<"retry" | "dead"> {
  const message = safeErrorMessage(err);
  const terminal = err instanceof NonRetryableJobError || row.attempts >= row.maxAttempts;
  await db()
    .update(job)
    .set({
      status: terminal ? "dead" : "queued",
      runAt: terminal ? row.runAt : new Date(Date.now() + backoffMs(row.attempts)),
      lastError: message,
      lockedBy: null,
      lockedUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(job.id, row.id));
  return terminal ? "dead" : "retry";
}
