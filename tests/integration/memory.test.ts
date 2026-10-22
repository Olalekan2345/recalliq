/**
 * Walrus Memory service against the SDK's own MemWalMock (test double) and a
 * real migrated Postgres. Verifies the outbox → accepted → done-with-blob-id
 * lifecycle, dedupe, recall provenance and tenant isolation.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { MemWalMock } from "@mysten-incubation/memwal";
import { job, learningMemory } from "@/lib/db/schema";
import { setMemoryStoreOverride, wrapClient } from "@/lib/memory/memwal/store";
import {
  confirmMemory,
  MAX_STORAGE_ATTEMPTS,
  proposeLesson,
  recallMemories,
  retryFailedMemory,
  submitMemory,
  type LessonCandidate,
} from "@/lib/memory/service";
import { createUser, setupTestDb } from "../helpers/db";
import type { Database } from "@/lib/db/client";

let db: Database;
let close: () => Promise<void>;
let userA: string;
let userB: string;

const lesson = (userId: string, over: Partial<LessonCandidate> = {}): LessonCandidate => ({
  userId,
  scope: "user",
  memoryType: "failure",
  taskCategory: "token_transfer",
  relatedToolId: "balance_change_analyzer",
  directive: "verify_coin_decimals",
  summary: "Token amount reported with the wrong decimal scaling",
  lesson: "Before stating any token amount for token transfer investigations, read the coin decimals from chain metadata.",
  evidenceText: "run r1; claimed 1500000000, observed 1.5",
  evidenceReferences: [{ kind: "run", id: "r1" }],
  verificationStatus: "verified",
  sourceRunId: null,
  sourceFailureId: null,
  ...over,
});

beforeAll(async () => {
  ({ db, close } = await setupTestDb());
  userA = await createUser(db);
  userB = await createUser(db);
  setMemoryStoreOverride(wrapClient(MemWalMock.create({ namespace: "test" }), "test-mock", "test"));
});
afterAll(async () => {
  setMemoryStoreOverride(undefined);
  await close();
});

describe("memory lifecycle", () => {
  it("queues a lesson and only marks it stored after the relayer reports done with a blob id", async () => {
    const res = await proposeLesson(lesson(userA));
    expect(res.status).toBe("queued");
    const id = (res as { memoryId: string }).memoryId;

    let [row] = await db.select().from(learningMemory).where(eq(learningMemory.id, id));
    expect(row!.storageStatus).toBe("queued");
    expect(row!.walrusBlobId).toBeNull();
    const jobs = await db.select().from(job);
    expect(jobs.some((j) => j.type === "memory.submit" && j.payload.memoryId === id)).toBe(true);

    expect(await submitMemory(id)).toBe("submitted");
    [row] = await db.select().from(learningMemory).where(eq(learningMemory.id, id));
    expect(row!.storageStatus).toBe("pending");
    expect(row!.walrusJobId).toBeTruthy();
    expect(row!.walrusBlobId).toBeNull();

    // Retried submit jobs never write twice.
    expect(await submitMemory(id)).toBe("already_submitted");

    expect(await confirmMemory(id)).toBe("stored");
    [row] = await db.select().from(learningMemory).where(eq(learningMemory.id, id));
    expect(row!.storageStatus).toBe("stored");
    expect(row!.walrusBlobId).toBeTruthy();
    expect(row!.storedAt).toBeInstanceOf(Date);
  });

  it("dedupes an identical lesson (even with different run evidence)", async () => {
    const res = await proposeLesson(lesson(userA, { evidenceText: "run r2; different tx" }));
    expect(res.status).toBe("duplicate");
  });

  it("rejects lessons carrying secrets", async () => {
    const res = await proposeLesson(lesson(userA, { lesson: "Remember the key suiprivkey1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq for later use" }));
    expect(res.status).toBe("rejected");
  });

  it("recalls with provenance and keeps tenants isolated", async () => {
    const a = await recallMemories({ userId: userA, query: "token transfer decimal scaling amount" });
    expect(a.status).toBe("ok");
    const considered = a.status === "ok" ? a.memories.filter((m) => m.record) : [];
    expect(considered.length).toBeGreaterThan(0);
    expect(considered[0]!.parsed?.header.directive).toBe("verify_coin_decimals");
    expect(considered[0]!.record?.verificationStatus).toBe("verified");

    const b = await recallMemories({ userId: userB, query: "token transfer decimal scaling amount" });
    expect(b.status === "ok" && b.memories.filter((m) => m.record?.id === considered[0]!.record?.id)).toEqual([]);
  });

  it("flagged memories are filtered out of recall", async () => {
    const [row] = await db.select().from(learningMemory).where(eq(learningMemory.userId, userA));
    await db.update(learningMemory).set({ status: "flagged" }).where(eq(learningMemory.id, row!.id));
    const a = await recallMemories({ userId: userA, query: "token transfer decimal scaling amount" });
    const m = a.status === "ok" ? a.memories.find((x) => x.record?.id === row!.id) : undefined;
    expect(m?.disposition).toBe("filtered_out");
    expect(m?.filterReason).toContain("flagged");
  });

  it("reports an unconfigured store honestly", async () => {
    setMemoryStoreOverride(null);
    expect((await recallMemories({ userId: userA, query: "anything" })).status).toBe("unconfigured");
    const res = await proposeLesson(
      lesson(userA, {
        summary: "A different lesson about status checks",
        lesson: "Confirm execution status before describing effects of a transaction.",
        directive: "check_status_before_amounts",
      }),
    );
    expect(res).toMatchObject({ status: "queued", walrusConfigured: false });
    setMemoryStoreOverride(wrapClient(MemWalMock.create({ namespace: "test" }), "test-mock", "test"));
  });

  it("resubmits a relayer-failed memory under a new key, within the attempt budget", async () => {
    // Seen live: the relayer accepts the job, then fails it (its embedding provider returned 401).
    const keys: string[] = [];
    const relayer = {
      ...MemWalMock.create({ namespace: "test" }),
      remember: async (_text: string, _ns: string, opts: { idempotencyKey: string }) => {
        keys.push(opts.idempotencyKey);
        return { job_id: `job-${keys.length}`, status: "pending" };
      },
      getRememberStatus: async (jobId: string) => ({ job_id: jobId, status: "failed", error: "Embedding API error (401 Unauthorized)" }),
    };
    setMemoryStoreOverride(wrapClient(relayer as unknown as Parameters<typeof wrapClient>[0], "test-mock", "test"));
    const res = await proposeLesson(
      lesson(userB, {
        directive: "cross_check_sender",
        summary: "Sender misattributed in a report",
        lesson: "Attribute a transaction only to its on-chain sender.",
      }),
    );
    const id = (res as { memoryId: string }).memoryId;
    for (let i = 0; i < 10; i++) {
      expect(await submitMemory(id)).toBe("submitted");
      expect(await confirmMemory(id)).toBe("failed");
      if (!(await retryFailedMemory(id))) break;
    }
    expect(keys).toHaveLength(MAX_STORAGE_ATTEMPTS);
    expect(new Set(keys).size).toBe(MAX_STORAGE_ATTEMPTS); // a reused key would just return the failed job
    const [row] = await db.select().from(learningMemory).where(eq(learningMemory.id, id));
    expect(row).toMatchObject({ storageStatus: "failed", walrusBlobId: null });
    expect(row!.lastError).toContain("401");
    setMemoryStoreOverride(wrapClient(MemWalMock.create({ namespace: "test" }), "test-mock", "test"));
  });
});
