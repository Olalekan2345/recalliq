/** Tenant isolation: one user's data never reaches another user's read models. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { agentRun, investigation, learningMemory, paymentIntent } from "@/lib/db/schema";
import { newId } from "@/lib/security/ids";
import { getEvidenceData, getInvestigation, getRunDetail, listInvestigations, submitFeedback } from "@/server/services/investigations";
import { applyMemoryAction, getMemoryTrace, listMemories } from "@/server/services/memories";
import { listPayments } from "@/server/services/payments-read";
import { authorizePayment, PaymentAuthorizationError } from "@/server/services/payments";
import { cancelRun, RunRequestError } from "@/server/services/runs";
import { createUser, setupTestDb } from "../helpers/db";
import type { Database } from "@/lib/db/client";

let db: Database;
let close: () => Promise<void>;
let alice: string;
let bob: string;
let aliceRun: string;
let aliceInv: string;
let aliceMemory: string;
let aliceIntent: string;

beforeAll(async () => {
  ({ db, close } = await setupTestDb());
  alice = await createUser(db);
  bob = await createUser(db);
  aliceInv = newId();
  aliceRun = newId();
  await db.insert(investigation).values({ id: aliceInv, userId: alice, title: "alice private" });
  await db.insert(agentRun).values({
    id: aliceRun,
    investigationId: aliceInv,
    userId: alice,
    task: "secret task",
    inputs: { addresses: [], digests: [], names: [], objectIds: [] },
    status: "COMPLETED",
    limits: { maxToolCalls: 1, maxIterations: 1, maxDurationMs: 1000, maxOutputTokens: 100 },
  });
  aliceMemory = newId();
  await db.insert(learningMemory).values({
    id: aliceMemory,
    userId: alice,
    scope: "user",
    namespace: "ns-a",
    memoryType: "failure",
    summary: "alice lesson summary",
    lesson: "alice lesson body text",
    evidenceReferences: [],
    verificationStatus: "verified",
    content: "x",
    contentHash: "h-a",
    idempotencyKey: "k-a",
  });
  aliceIntent = newId();
  await db.insert(paymentIntent).values({
    id: aliceIntent,
    userId: alice,
    runId: aliceRun,
    toolId: "paid_forensic_analyzer",
    resourceUrl: "http://x",
    toolInput: {},
    network: "sui:mainnet",
    scheme: "exact",
    asset: "0x2::sui::SUI",
    amountAtomic: "1",
    payTo: "0x" + "a".repeat(64),
    maxTimeoutSeconds: 60,
    paymentRequirements: {},
    reason: "r",
    idempotencyKey: "i-a",
    expiresAt: new Date(Date.now() + 60_000),
  });
});
afterAll(async () => close());

describe("tenant isolation", () => {
  it("investigations and runs", async () => {
    expect(await listInvestigations(bob)).toEqual([]);
    expect(await getInvestigation(bob, aliceInv)).toBeNull();
    expect(await getRunDetail(bob, aliceRun)).toBeNull();
    expect(await getEvidenceData(bob, aliceRun, "E1")).toBeNull();
    expect(await submitFeedback(bob, aliceRun, { note: "not mine" })).toBeNull();
    await expect(cancelRun(bob, aliceRun)).rejects.toBeInstanceOf(RunRequestError);
    expect((await getRunDetail(alice, aliceRun))?.run.task).toBe("secret task");
  });

  it("memories", async () => {
    expect(await listMemories(bob, { scope: "all" })).toEqual([]);
    expect(await getMemoryTrace(bob, aliceMemory)).toBeNull();
    expect(await applyMemoryAction(bob, aliceMemory, { action: "retract" })).toBeNull();
    expect((await listMemories(alice, { scope: "all" })).map((m) => m.id)).toEqual([aliceMemory]);
  });

  it("payments", async () => {
    expect(await listPayments(bob)).toEqual([]);
    await expect(authorizePayment(bob, aliceIntent, { decision: "rejected" })).rejects.toBeInstanceOf(PaymentAuthorizationError);
  });

  it("never exposes model message history in run detail", async () => {
    const d = await getRunDetail(alice, aliceRun);
    expect(d && "checkpoint" in d.run).toBe(false);
  });
});
