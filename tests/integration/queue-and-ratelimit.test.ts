import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { job } from "@/lib/db/schema";
import { claim, complete, enqueue, fail, NonRetryableJobError, reschedule } from "@/server/jobs/queue";
import { hitRateLimit } from "@/lib/security/rate-limit";
import { setupTestDb } from "../helpers/db";
import { rowsOf, type Database } from "@/lib/db/client";

let db: Database;
let close: () => Promise<void>;

beforeAll(async () => ({ db, close } = await setupTestDb()));
afterAll(async () => close());
beforeEach(async () => {
  await db.delete(job);
});

describe("durable job queue", () => {
  it("enqueue is idempotent on its key", async () => {
    const a = await enqueue("agent.run", { runId: "r1" }, { idempotencyKey: "agent.run:r1" });
    const b = await enqueue("agent.run", { runId: "r1" }, { idempotencyKey: "agent.run:r1" });
    expect(a.created).toBe(true);
    expect(b).toEqual({ id: a.id, created: false });
    const rows = await db.select().from(job);
    expect(rows).toHaveLength(1);
  });

  it("claims ready jobs once and respects run_at", async () => {
    await enqueue("memory.submit", { memoryId: "m1" });
    await enqueue("memory.submit", { memoryId: "m2" }, { delayMs: 60_000 });
    const first = await claim("w1", 10, 60_000);
    expect(first.map((j) => j.payload.memoryId)).toEqual(["m1"]);
    expect(await claim("w2", 10, 60_000)).toHaveLength(0);
    await complete(first[0]!.id);
    const [row] = await db.select().from(job).where(eq(job.id, first[0]!.id));
    expect(row!.status).toBe("succeeded");
  });

  it("recovers a job whose worker died (expired lease)", async () => {
    await enqueue("agent.run", { runId: "r2" });
    const [j] = await claim("crashed-worker", 1, 60_000);
    await db
      .update(job)
      .set({ lockedUntil: new Date(Date.now() - 1000) })
      .where(eq(job.id, j!.id));
    const again = await claim("w2", 1, 60_000);
    expect(again[0]!.id).toBe(j!.id);
    expect(again[0]!.attempts).toBe(2);
    expect(again[0]!.lockedBy).toBe("w2");
  });

  it("reschedule does not consume an attempt", async () => {
    await enqueue("memory.confirm", { memoryId: "m3" }, { maxAttempts: 2 });
    for (let i = 0; i < 4; i++) {
      const [j] = await claim("w", 1, 60_000);
      await reschedule(j!.id, 0);
    }
    const [row] = await db.select().from(job);
    expect(row!.attempts).toBe(0);
    expect(row!.status).toBe("queued");
  });

  it("retries with backoff, then dead-letters", async () => {
    await enqueue("payment.settle", { intentId: "p1" }, { maxAttempts: 2 });
    const [j1] = await claim("w", 1, 60_000);
    expect(await fail(j1!, new Error("boom"))).toBe("retry");
    await db.update(job).set({ runAt: new Date(Date.now() - 1) });
    const [j2] = await claim("w", 1, 60_000);
    expect(await fail(j2!, new Error("boom again"))).toBe("dead");
    const [row] = await db.select().from(job);
    expect(row!.status).toBe("dead");
    expect(row!.lastError).toContain("boom again");
  });

  it("non-retryable errors go straight to dead", async () => {
    await enqueue("payment.settle", { intentId: "p2" }, { maxAttempts: 5 });
    const [j] = await claim("w", 1, 60_000);
    expect(await fail(j!, new NonRetryableJobError("invalid"))).toBe("dead");
  });

  it("two workers never claim the same job", async () => {
    for (let i = 0; i < 6; i++) await enqueue("memory.submit", { memoryId: `c${i}` });
    const [a, b] = await Promise.all([claim("A", 6, 60_000), claim("B", 6, 60_000)]);
    const ids = [...a, ...b].map((j) => j.id);
    expect(new Set(ids).size).toBe(ids.length);
    const [{ n } = { n: 0 }] = rowsOf<{ n: number }>(await db.execute(sql`select count(*)::int as n from job where status='running'`));
    expect(n).toBe(6);
  });
});

describe("rate limiting", () => {
  it("counts within a window and blocks over the limit", async () => {
    const r = [];
    for (let i = 0; i < 4; i++) r.push(await hitRateLimit("test:key", 3, 60));
    expect(r.map((x) => x.allowed)).toEqual([true, true, true, false]);
    expect(r[3]!.count).toBe(4);
  });
});
