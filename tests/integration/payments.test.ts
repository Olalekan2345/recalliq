/**
 * End-to-end x402 on Sui: real HTTP 402 handler (seller), real buyer flow,
 * real Ed25519 signatures, independent settlement verification, idempotency,
 * replay protection and reconciliation of an ambiguous broadcast. Chain state
 * comes from the fixture client.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { fromBase64 } from "@mysten/sui/utils";
import {
  agentRun,
  connectedWallet,
  evidenceRecord,
  investigation,
  job,
  paymentIntent,
  paymentSettlement,
  toolExecution,
  userSettings,
  x402Sale,
} from "@/lib/db/schema";
import { setChainOverride } from "@/lib/blockchain/tatum/client";
import { newId } from "@/lib/security/ids";
import { POST as forensicsRoute } from "@/app/api/x402/forensics/route";
import { HEADER_PAYMENT_REQUIRED, decodeHeader, paymentRequiredSchema } from "@/lib/payments/x402/types";
import {
  authorizePayment,
  preparePaymentTransaction,
  reconcilePayment,
  requestPaidAnalysis,
  setSpecialistTransport,
  settlePayment,
  PaymentAuthorizationError,
} from "@/server/services/payments";
import { createUser, setupTestDb } from "../helpers/db";
import { FakeChain, fixtureAddress, fixtureDigest, fixtureTx, SUI } from "../helpers/fake-chain";
import type { Database } from "@/lib/db/client";

let db: Database;
let close: () => Promise<void>;
let chain: FakeChain;
let userId: string;

const PAY_TO = "0x" + "a".repeat(64);
const D1 = fixtureDigest("cmp-1");
const D2 = fixtureDigest("cmp-2");
const INPUT = { mode: "compare" as const, digests: [D1, D2], justification: "Compare two transfers side by side for the user" };

async function newRun(uid = userId) {
  const invId = newId();
  const runId = newId();
  await db.insert(investigation).values({ id: invId, userId: uid, title: "t" });
  await db.insert(agentRun).values({
    id: runId,
    investigationId: invId,
    userId: uid,
    task: "compare",
    inputs: { addresses: [], digests: [D1, D2], names: [], objectIds: [] },
    status: "AWAITING_APPROVAL",
    limits: { maxToolCalls: 5, maxIterations: 5, maxDurationMs: 60000, maxOutputTokens: 1000 },
  });
  return { id: runId, userId: uid, isEvaluation: false };
}

async function approve(intentId: string, kp: Ed25519Keypair) {
  const prepared = await preparePaymentTransaction(userId, intentId, kp.toSuiAddress());
  const { signature } = await kp.signTransaction(fromBase64(prepared.transactionBytes));
  return authorizePayment(userId, intentId, { decision: "approved", walletAddress: kp.toSuiAddress(), transactionBytes: prepared.transactionBytes, signature });
}

beforeAll(async () => {
  ({ db, close } = await setupTestDb());
  userId = await createUser(db);
  setSpecialistTransport((url, init) => forensicsRoute(new Request(url, init)));
});
afterAll(async () => {
  setSpecialistTransport(undefined);
  setChainOverride(undefined);
  await close();
});
beforeEach(() => {
  chain = new FakeChain()
    .addTx(fixtureTx({ digest: D1, balanceChanges: [{ address: fixtureAddress("bob"), coinType: SUI, amountAtomic: "1000000000" }] }))
    .addTx(fixtureTx({ digest: D2, status: "failure", balanceChanges: [] }));
  setChainOverride(chain);
});

describe("x402 seller endpoint", () => {
  it("answers an unpaid request with a real 402 quote", async () => {
    const res = await forensicsRoute(
      new Request("http://localhost:3300/api/x402/forensics", { method: "POST", body: JSON.stringify({ mode: "compare", digests: [D1, D2] }) }),
    );
    expect(res.status).toBe(402);
    const pr = decodeHeader(res.headers.get(HEADER_PAYMENT_REQUIRED), paymentRequiredSchema)!;
    expect(pr.accepts[0]).toMatchObject({ scheme: "exact", network: "sui:mainnet", amount: "10000000", payTo: PAY_TO });
  });
});

describe("agent payment flow", () => {
  it("quote → approval → settlement → independent verification → paid result", async () => {
    const run = await newRun();
    const req = await requestPaidAnalysis(run, INPUT, { offered: true, reasons: [] });
    expect(req.status).toBe("awaiting_user_approval");
    const intentId = (req as { intentId: string }).intentId;
    expect(req).toMatchObject({ amountAtomic: "10000000", displayAmount: "0.01 SUI", payTo: PAY_TO });

    const kp = new Ed25519Keypair();
    const auth = await approve(intentId, kp);
    expect(auth.status).toBe("approved");
    const [wallet] = await db.select().from(connectedWallet).where(eq(connectedWallet.userId, userId));
    expect(wallet!.address).toBe(kp.toSuiAddress());

    expect(await settlePayment(intentId)).toBe("settled");
    const [intent] = await db.select().from(paymentIntent).where(eq(paymentIntent.id, intentId));
    expect(intent!.status).toBe("settled");
    const [settlement] = await db.select().from(paymentSettlement).where(eq(paymentSettlement.intentId, intentId));
    expect(settlement).toMatchObject({
      finalState: "settled",
      amountVerified: true,
      recipientVerified: true,
      assetVerified: true,
      observedAmountAtomic: "10000000",
    });
    const [exec] = await db.select().from(toolExecution).where(eq(toolExecution.paymentIntentId, intentId));
    expect((exec!.output as { mode: string }).mode).toBe("compare");
    const ev = await db
      .select()
      .from(evidenceRecord)
      .where(and(eq(evidenceRecord.runId, run.id), eq(evidenceRecord.kind, "paid_analysis")));
    expect(ev).toHaveLength(1);
    const [sale] = await db.select().from(x402Sale).where(eq(x402Sale.digest, settlement!.digest));
    expect(sale!.status).toBe("settled");
    const resume = await db.select().from(job).where(eq(job.type, "agent.resume"));
    expect(resume.some((j) => j.payload.runId === run.id)).toBe(true);

    // Idempotent: a second settle is a no-op and nothing is broadcast twice.
    expect(await settlePayment(intentId)).toBe("noop");
    expect(chain.calls.filter((c) => c === "ExecuteTransaction")).toHaveLength(1);
  });

  it("rejects signed bytes from a wallet other than the one approving", async () => {
    const run = await newRun();
    const req = await requestPaidAnalysis(run, { ...INPUT, justification: "A different comparison request" }, { offered: true, reasons: [] });
    const intentId = (req as { intentId: string }).intentId;
    const alice = new Ed25519Keypair();
    const mallory = new Ed25519Keypair();
    const prepared = await preparePaymentTransaction(userId, intentId, mallory.toSuiAddress());
    const { signature } = await mallory.signTransaction(fromBase64(prepared.transactionBytes));
    await expect(
      authorizePayment(userId, intentId, { decision: "approved", walletAddress: alice.toSuiAddress(), transactionBytes: prepared.transactionBytes, signature }),
    ).rejects.toBeInstanceOf(PaymentAuthorizationError);
  });

  it("a declined payment resumes the run without paying", async () => {
    const run = await newRun();
    const req = await requestPaidAnalysis(run, { ...INPUT, digests: [D2, D1] }, { offered: true, reasons: [] });
    const intentId = (req as { intentId: string }).intentId;
    expect((await authorizePayment(userId, intentId, { decision: "rejected" })).status).toBe("rejected");
    expect(chain.calls).not.toContain("ExecuteTransaction");
    await expect(authorizePayment(userId, intentId, { decision: "rejected" })).resolves.toMatchObject({ idempotent: true });
  });

  it("enforces the user's spending limit before a request is ever shown", async () => {
    const other = await createUser(db);
    await db.insert(userSettings).values({ userId: other, perPaymentLimitAtomic: "9999999" });
    const run = await newRun(other);
    const req = await requestPaidAnalysis(run, INPUT, { offered: true, reasons: [] });
    expect(req.status).toBe("blocked_by_policy");
  });

  it("guests can never pay", async () => {
    const guest = await createUser(db, { guest: true });
    const run = await newRun(guest);
    expect((await requestPaidAnalysis(run, INPUT, { offered: true, reasons: [] })).status).toBe("blocked_by_policy");
  });

  it("an ambiguous broadcast is reconciled on chain — never paid twice", async () => {
    const run = await newRun();
    const req = await requestPaidAnalysis(run, { ...INPUT, justification: "Ambiguous settlement scenario test" }, { offered: true, reasons: [] });
    const intentId = (req as { intentId: string }).intentId;
    await approve(intentId, new Ed25519Keypair());
    chain.failExecute = "ambiguous"; // executes on chain, but the response is lost
    expect(await settlePayment(intentId)).toBe("unknown");
    chain.failExecute = "none";
    expect(await reconcilePayment(intentId)).toBe("settled");
    const [intent] = await db.select().from(paymentIntent).where(eq(paymentIntent.id, intentId));
    expect(intent!.status).toBe("settled");
    expect(chain.calls.filter((c) => c === "ExecuteTransaction")).toHaveLength(1);
    const [exec] = await db.select().from(toolExecution).where(eq(toolExecution.paymentIntentId, intentId));
    expect(exec).toBeTruthy();
  });
});
