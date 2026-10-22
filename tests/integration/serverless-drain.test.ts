/**
 * Serverless job draining (WORKER_MODE=serverless, Vercel): against a real
 * migrated database, with the job handlers replaced by spies so the tests
 * exercise the drain's scheduling decisions, not the agent itself.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { job } from "@/lib/db/schema";
import { resetEnvCache } from "@/lib/env";
import { enqueue } from "@/server/jobs/queue";
import { HANDLERS } from "@/server/jobs/worker";
import { drainJobs } from "@/server/jobs/drain";
import { setupTestDb } from "../helpers/db";
import type { Database } from "@/lib/db/client";

let db: Database;
let close: () => Promise<void>;

beforeAll(async () => ({ db, close } = await setupTestDb()));
afterAll(async () => close());
beforeEach(async () => {
  await db.delete(job);
});
afterEach(() => {
  vi.restoreAllMocks();
});

const statusOf = async (id: string) => (await db.select({ status: job.status }).from(job).where(eq(job.id, id)))[0]!.status;

describe("serverless drain", () => {
  it("runs a queued investigation, then waits for its follow-up that is due soon", async () => {
    const run = vi.spyOn(HANDLERS, "agent.run").mockImplementation(async () => {
      // The run stores a lesson; Walrus confirmation is polled a moment later.
      await enqueue("memory.confirm", { memoryId: "m1" }, { delayMs: 300 });
    });
    const confirm = vi.spyOn(HANDLERS, "memory.confirm").mockResolvedValue(undefined);
    const { id } = await enqueue("agent.run", { runId: "r1" });

    const res = await drainJobs({ handOff: async () => expect.fail("no hand-off expected") });

    expect(run).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ ran: 2, stoppedBecause: "idle", handedOff: false });
    expect(await statusOf(id)).toBe("succeeded");
  });

  it("does not start an investigation it could not finish, and hands it to a fresh drain", async () => {
    const run = vi.spyOn(HANDLERS, "agent.run").mockResolvedValue(undefined);
    const settle = vi.spyOn(HANDLERS, "payment.settle").mockResolvedValue(undefined);
    const handOff = vi.fn(async () => undefined);
    const { id: runJobId } = await enqueue("agent.run", { runId: "r2" });
    await enqueue("payment.settle", { intentId: "p1" });

    // 60 s left: less than an agent run's budget (AGENT_MAX_DURATION_MS + margin).
    const res = await drainJobs({ budgetMs: 60_000, handOff });

    expect(settle).toHaveBeenCalledTimes(1);
    expect(run).not.toHaveBeenCalled();
    expect(handOff).toHaveBeenCalledTimes(1);
    expect(res.handedOff).toBe(true);
    expect(await statusOf(runJobId)).toBe("queued");
  });

  it("stops at once when the next job is not due soon", async () => {
    const sleep = vi.fn(async () => undefined);
    await enqueue("memory.confirm", { memoryId: "m2" }, { delayMs: 120_000 });

    const res = await drainJobs({ sleep, handOff: async () => undefined });

    expect(sleep).not.toHaveBeenCalled();
    expect(res).toEqual({ ran: 0, stoppedBecause: "idle", handedOff: false });
  });

  it("stops before the budget runs out instead of waiting past it", async () => {
    // Starts at real time: due dates come from the database clock.
    let clock = Date.now();
    const now = () => clock;
    const sleep = vi.fn(async (ms: number) => {
      clock += ms;
    });
    await enqueue("memory.confirm", { memoryId: "m3" }, { delayMs: 20_000 });

    // 25 s of budget: the job is due in 20 s, but waiting would leave less than the 10 s safety margin.
    const res = await drainJobs({ budgetMs: 25_000, now, sleep, handOff: async () => undefined });

    expect(sleep).not.toHaveBeenCalled();
    expect(res.stoppedBecause).toBe("budget");
  });

  it("the drain endpoint requires the cron secret and serverless mode", async () => {
    const { GET, POST } = await import("@/app/api/jobs/drain/route");
    process.env.CRON_SECRET = "test-cron-secret-0123456789";
    resetEnvCache();
    try {
      const anon = await POST(new Request("http://localhost/api/jobs/drain", { method: "POST" }));
      expect(anon.status).toBe(401);
      const wrong = await GET(new Request("http://localhost/api/jobs/drain", { headers: { authorization: "Bearer nope" } }));
      expect(wrong.status).toBe(401);
      // Authorized, but this deployment has a worker process (WORKER_MODE=off in tests): nothing to do here.
      const ok = await GET(new Request("http://localhost/api/jobs/drain", { headers: { authorization: "Bearer test-cron-secret-0123456789" } }));
      expect(ok.status).toBe(409);
    } finally {
      delete process.env.CRON_SECRET;
      resetEnvCache();
    }
  });

  it("keeps draining past a failing job, retries it with backoff while time remains, then dead-letters it", async () => {
    const submit = vi.spyOn(HANDLERS, "memory.submit").mockRejectedValue(new Error("relayer unavailable"));
    const confirm = vi.spyOn(HANDLERS, "memory.confirm").mockResolvedValue(undefined);
    const { id: failing } = await enqueue("memory.submit", { memoryId: "m4" }, { maxAttempts: 2 });
    await enqueue("memory.confirm", { memoryId: "m5" });

    const res = await drainJobs({ handOff: async () => undefined });

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledTimes(2); // first try, then once more after a 5 s backoff
    expect(res).toEqual({ ran: 3, stoppedBecause: "idle", handedOff: false });
    const [row] = await db.select().from(job).where(eq(job.id, failing));
    expect(row!.status).toBe("dead");
    expect(row!.lastError).toContain("relayer unavailable");
  });
});
