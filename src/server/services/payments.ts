/**
 * Agent payments (buyer side of x402 on Sui).
 *
 *  quote      POST specialist without payment → 402 PAYMENT-REQUIRED (real terms)
 *  intent     trusted policy check → PaymentIntent awaiting the user's approval
 *  authorize  user signs the exact transfer in their own wallet; we verify the
 *             signed bytes by simulation (read-only) before accepting them
 *  settle     POST with PAYMENT-SIGNATURE → seller verifies, works, settles →
 *             we independently verify settlement on chain through Tatum
 *  reconcile  ambiguous outcomes are resolved by the locally computed digest —
 *             a timed-out payment is never replaced by a new one
 */
import { and, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { chain } from "@/lib/blockchain/tatum/client";
import { formatAtomic } from "@/lib/blockchain/sui/amounts";
import { sameCoinType, normalizeAddress, sameAddress } from "@/lib/blockchain/sui/validation";
import { db } from "@/lib/db/client";
import { auditEvent, connectedWallet, paymentAuthorization, paymentIntent, paymentSettlement, paymentTransaction, toolExecution } from "@/lib/db/schema";
import { x402Config } from "@/lib/env";
import { logger } from "@/lib/logging/logger";
import { newId, sha256Hex, stableStringify } from "@/lib/security/ids";
import { safeErrorMessage } from "@/lib/security/redact";
import { evaluateSpendPolicy, type SpendPolicyDecision } from "@/lib/payments/authorization/policy";
import { verifySettlement, type SettlementCheck } from "@/lib/payments/verification/settlement";
import { decodePaymentTransaction, verifySuiExactPayment } from "@/lib/payments/x402/sui-exact";
import {
  decodeHeader,
  encodeHeader,
  HEADER_PAYMENT_REQUIRED,
  HEADER_PAYMENT_RESPONSE,
  HEADER_PAYMENT_SIGNATURE,
  paymentRequiredSchema,
  settleResponseSchema,
  X402_VERSION,
  type PaymentPayload,
  type PaymentRequired,
  type PaymentRequirements,
} from "@/lib/payments/x402/types";
import { PAID_FORENSICS_TOOL_ID, specialistResourceUrl, toForensicsRequest, type PaidForensicsInput } from "@/lib/ai/tools/registry";
import { enqueue } from "@/server/jobs/queue";
import { addEvidence } from "./evidence";
import { getSettings, isGuestUser } from "./settings";

const log = logger("payments");

export type PaymentIntentRow = typeof paymentIntent.$inferSelect;

/* ───────────── transport (HTTP to the registered specialist only) ───────────── */

export type SpecialistTransport = (url: string, init: RequestInit) => Promise<Response>;
const g = globalThis as unknown as { __recalliqSpecialistTransport?: SpecialistTransport };

function transport(): SpecialistTransport {
  return g.__recalliqSpecialistTransport ?? ((url, init) => fetch(url, init));
}

/** Tests only. */
export function setSpecialistTransport(t: SpecialistTransport | undefined): void {
  g.__recalliqSpecialistTransport = t;
}

function assertRegisteredUrl(url: string): void {
  // SSRF guard: the agent can only ever reach the URL registered for the paid tool.
  if (url !== specialistResourceUrl()) throw new Error("Refusing to call an unregistered paid resource");
}

export async function fetchSpecialistQuote(body: unknown): Promise<{ ok: true; paymentRequired: PaymentRequired } | { ok: false; error: string }> {
  const url = specialistResourceUrl();
  assertRegisteredUrl(url);
  let res: Response;
  try {
    res = await transport()(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
      redirect: "error",
    });
  } catch (err) {
    return { ok: false, error: `Paid service unavailable: ${safeErrorMessage(err, 160)}` };
  }
  if (res.status !== 402) return { ok: false, error: `Paid service returned HTTP ${res.status} instead of a 402 quote` };
  const fromHeader = decodeHeader(res.headers.get(HEADER_PAYMENT_REQUIRED), paymentRequiredSchema);
  if (fromHeader) return { ok: true, paymentRequired: fromHeader };
  const parsed = paymentRequiredSchema.safeParse(await res.json().catch(() => null));
  return parsed.success ? { ok: true, paymentRequired: parsed.data } : { ok: false, error: "Malformed PAYMENT-REQUIRED quote" };
}

export function selectRequirements(pr: PaymentRequired): PaymentRequirements | null {
  const cfg = x402Config();
  return (
    pr.accepts.find(
      (a) =>
        a.scheme === "exact" && a.network === cfg.network && sameCoinType(a.asset, cfg.asset) && cfg.allowedRecipients.some((r) => sameAddress(r, a.payTo)),
    ) ?? null
  );
}

/* ───────────── spend accounting & policy ───────────── */

const COMMITTED: Array<PaymentIntentRow["status"]> = ["approved", "settling", "settled", "unknown"];

export async function spendContext(userId: string, runId: string | null, asset: string) {
  const base = and(eq(paymentIntent.userId, userId), inArray(paymentIntent.status, COMMITTED), eq(paymentIntent.asset, asset));
  const [day] = await db()
    .select({ total: sql<string>`coalesce(sum(${paymentIntent.amountAtomic}), 0)::text` })
    .from(paymentIntent)
    .where(and(base, gt(paymentIntent.createdAt, new Date(Date.now() - 24 * 3600_000))));
  let runTotal = "0";
  if (runId) {
    const [r] = await db()
      .select({ total: sql<string>`coalesce(sum(${paymentIntent.amountAtomic}), 0)::text` })
      .from(paymentIntent)
      .where(and(base, eq(paymentIntent.runId, runId)));
    runTotal = r?.total ?? "0";
  }
  return { committed24hAtomic: day?.total ?? "0", committedThisRunAtomic: runTotal };
}

export async function evaluatePolicyFor(userId: string, runId: string | null, req: PaymentRequirements): Promise<SpendPolicyDecision> {
  const cfg = x402Config();
  const settings = await getSettings(userId);
  const guest = await isGuestUser(userId);
  const spent = await spendContext(userId, runId, req.asset);
  return evaluateSpendPolicy({
    amountAtomic: req.amount,
    asset: req.asset,
    payTo: req.payTo,
    network: req.network,
    configuredNetwork: cfg.network,
    configuredAsset: cfg.asset,
    allowedRecipients: cfg.allowedRecipients,
    platformMaxPerTxAtomic: cfg.maxPerTxAtomic,
    platformMaxPerDayAtomic: cfg.maxPerDayAtomic,
    paidToolsEnabled: settings.paidToolsEnabled,
    isGuest: guest,
    userLimitAsset: settings.limitAsset,
    userPerPaymentLimitAtomic: settings.perPaymentLimitAtomic,
    userPerRunLimitAtomic: settings.perRunLimitAtomic,
    userDailyLimitAtomic: settings.dailyLimitAtomic,
    ...spent,
  });
}

async function audit(userId: string | null, action: string, targetId: string, metadata: Record<string, unknown>) {
  await db()
    .insert(auditEvent)
    .values({ id: newId(), userId, actor: userId ? "user" : "system", action, targetType: "payment_intent", targetId, metadata });
}

/* ───────────── agent requests paid analysis ───────────── */

export type PaidRequestResult =
  | { status: "awaiting_user_approval"; intentId: string; amountAtomic: string; asset: string; displayAmount: string | null; payTo: string; network: string }
  | { status: "not_offered" | "blocked_by_policy" | "quote_failed"; reasons: string[] };

export async function requestPaidAnalysis(
  run: { id: string; userId: string; isEvaluation: boolean },
  input: PaidForensicsInput,
  offered: { offered: boolean; reasons: string[] },
): Promise<PaidRequestResult> {
  if (!offered.offered) return { status: "not_offered", reasons: offered.reasons };
  if (run.isEvaluation) return { status: "not_offered", reasons: ["Evaluation runs never spend funds"] };

  const forensicsRequest = toForensicsRequest(input);
  const quote = await fetchSpecialistQuote(forensicsRequest);
  if (!quote.ok) return { status: "quote_failed", reasons: [quote.error] };
  const req = selectRequirements(quote.paymentRequired);
  if (!req) return { status: "blocked_by_policy", reasons: ["The quote's network/asset/recipient is not on the allowlist"] };

  const policy = await evaluatePolicyFor(run.userId, run.id, req);
  if (!policy.allowed) return { status: "blocked_by_policy", reasons: policy.reasons };

  let decimals: number | null = null;
  let symbol: string | null = null;
  try {
    const ci = await chain().getCoinInfo(req.asset);
    decimals = ci.data.decimals;
    symbol = ci.data.symbol;
  } catch {
    // Displayed as atomic units if metadata is unavailable.
  }

  const idempotencyKey = sha256Hex(`${run.id}|${PAID_FORENSICS_TOOL_ID}|${stableStringify(forensicsRequest)}`);
  const id = newId();
  const expiresAt = new Date(Date.now() + Math.min(req.maxTimeoutSeconds, 900) * 1000);
  await db()
    .insert(paymentIntent)
    .values({
      id,
      userId: run.userId,
      runId: run.id,
      toolId: PAID_FORENSICS_TOOL_ID,
      resourceUrl: quote.paymentRequired.resource.url,
      toolInput: forensicsRequest,
      network: req.network,
      scheme: req.scheme,
      asset: req.asset,
      assetDecimals: decimals,
      assetSymbol: symbol,
      amountAtomic: req.amount,
      payTo: req.payTo,
      maxTimeoutSeconds: req.maxTimeoutSeconds,
      paymentRequirements: { requirements: req, resource: quote.paymentRequired.resource },
      reason: input.justification,
      alternatives: { freeToolsConsidered: true, note: "Free Tatum tools remain available if declined" },
      status: "awaiting_approval",
      idempotencyKey,
      expiresAt,
    })
    .onConflictDoNothing();
  const [intent] = await db().select().from(paymentIntent).where(eq(paymentIntent.idempotencyKey, idempotencyKey)).limit(1);
  if (!intent) throw new Error("Failed to create payment intent");
  if (intent.status !== "awaiting_approval") {
    return { status: "blocked_by_policy", reasons: [`An identical request already exists with status ${intent.status}`] };
  }
  await audit(run.userId, "payment.intent_created", intent.id, { amountAtomic: req.amount, asset: req.asset, payTo: req.payTo, runId: run.id });
  return {
    status: "awaiting_user_approval",
    intentId: intent.id,
    amountAtomic: req.amount,
    asset: req.asset,
    displayAmount: decimals !== null ? `${formatAtomic(req.amount, decimals)} ${symbol ?? ""}`.trim() : null,
    payTo: req.payTo,
    network: req.network,
  };
}

/* ───────────── user authorization ───────────── */

export class PaymentAuthorizationError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "PaymentAuthorizationError";
  }
}

export type AuthorizeBody = { decision: "rejected" } | { decision: "approved"; walletAddress: string; transactionBytes: string; signature: string };

function requirementsOf(intent: PaymentIntentRow): { requirements: PaymentRequirements; resource: PaymentRequired["resource"] } {
  return intent.paymentRequirements as { requirements: PaymentRequirements; resource: PaymentRequired["resource"] };
}

/**
 * Build the exact transfer the user will be asked to sign. Built server-side
 * through Tatum so the browser needs no RPC credentials; the wallet signs the
 * bytes, and `authorizePayment` re-verifies whatever comes back.
 */
export async function preparePaymentTransaction(userId: string, intentId: string, walletAddress: string) {
  const [intent] = await db()
    .select()
    .from(paymentIntent)
    .where(and(eq(paymentIntent.id, intentId), eq(paymentIntent.userId, userId)))
    .limit(1);
  if (!intent) throw new PaymentAuthorizationError("Payment request not found", 404);
  if (intent.status !== "awaiting_approval") throw new PaymentAuthorizationError(`Payment request is ${intent.status}`, 409);
  if (intent.expiresAt.getTime() < Date.now()) throw new PaymentAuthorizationError("Payment request expired", 410);
  const sender = normalizeAddress(walletAddress);
  if (!sender) throw new PaymentAuthorizationError("Invalid wallet address");
  const { requirements } = requirementsOf(intent);
  const policy = await evaluatePolicyFor(userId, intent.runId, requirements);
  if (!policy.allowed) throw new PaymentAuthorizationError(`Blocked by spending policy: ${policy.reasons.join("; ")}`, 403);
  try {
    const built = await chain().buildPaymentTransaction({ sender, payTo: requirements.payTo, coinType: requirements.asset, amountAtomic: requirements.amount });
    return {
      transactionBytes: built.data.bytesB64,
      digest: built.data.digest,
      amountAtomic: requirements.amount,
      asset: requirements.asset,
      payTo: requirements.payTo,
      network: requirements.network,
      builtVia: built.provenance.providerLabel,
    };
  } catch (err) {
    const msg = safeErrorMessage(err, 200);
    if (/insufficient|not enough|balance/i.test(msg))
      throw new PaymentAuthorizationError("Insufficient balance in the connected wallet for this payment plus gas", 422);
    throw new PaymentAuthorizationError(`Could not build the payment transaction: ${msg}`, 502);
  }
}

export async function authorizePayment(userId: string, intentId: string, body: AuthorizeBody) {
  const [intent] = await db()
    .select()
    .from(paymentIntent)
    .where(and(eq(paymentIntent.id, intentId), eq(paymentIntent.userId, userId)))
    .limit(1);
  if (!intent) throw new PaymentAuthorizationError("Payment request not found", 404);

  const [existing] = await db().select().from(paymentAuthorization).where(eq(paymentAuthorization.intentId, intentId)).limit(1);
  if (existing) return { status: intent.status, idempotent: true };
  if (intent.status !== "awaiting_approval") throw new PaymentAuthorizationError(`Payment request is ${intent.status}`, 409);
  if (intent.expiresAt.getTime() < Date.now()) {
    await db().update(paymentIntent).set({ status: "expired", updatedAt: new Date() }).where(eq(paymentIntent.id, intentId));
    if (intent.runId) await enqueue("agent.resume", { runId: intent.runId }, { idempotencyKey: `agent.resume:${intent.runId}:${intentId}` });
    throw new PaymentAuthorizationError("Payment request expired", 410);
  }

  if (body.decision === "rejected") {
    await db().transaction(async (tx) => {
      await tx.insert(paymentAuthorization).values({ id: newId(), intentId, userId, decision: "rejected" });
      await tx.update(paymentIntent).set({ status: "rejected", decidedAt: new Date(), updatedAt: new Date() }).where(eq(paymentIntent.id, intentId));
      if (intent.runId) await enqueue("agent.resume", { runId: intent.runId }, { idempotencyKey: `agent.resume:${intent.runId}:${intentId}` }, tx);
    });
    await audit(userId, "payment.rejected", intentId, {});
    return { status: "rejected" as const, idempotent: false };
  }

  const { requirements, resource } = requirementsOf(intent);
  const policy = await evaluatePolicyFor(userId, intent.runId, requirements);
  if (!policy.allowed) throw new PaymentAuthorizationError(`Blocked by spending policy: ${policy.reasons.join("; ")}`, 403);

  const wallet = normalizeAddress(body.walletAddress);
  if (!wallet) throw new PaymentAuthorizationError("Invalid wallet address");
  let decoded;
  try {
    decoded = decodePaymentTransaction(body.transactionBytes);
  } catch {
    throw new PaymentAuthorizationError("Signed transaction could not be decoded");
  }
  if (decoded.sender !== wallet) throw new PaymentAuthorizationError("Transaction sender does not match the connected wallet");

  const payload: PaymentPayload = {
    x402Version: X402_VERSION,
    resource,
    accepted: requirements,
    payload: { transaction: body.transactionBytes, signature: body.signature },
  };
  // Read-only checks before we accept the authorization: signature, replay, exact amount/recipient by simulation.
  const check = await verifySuiExactPayment(chain(), payload, requirements);
  if (!check.isValid) throw new PaymentAuthorizationError(`Signed payment did not verify: ${check.invalidReason}`, 422);

  await db().transaction(async (tx) => {
    await tx.insert(paymentAuthorization).values({
      id: newId(),
      intentId,
      userId,
      decision: "approved",
      walletAddress: wallet,
      transactionBytes: body.transactionBytes,
      signature: body.signature,
      expectedDigest: decoded.digest,
    });
    await tx.update(paymentIntent).set({ status: "approved", decidedAt: new Date(), updatedAt: new Date() }).where(eq(paymentIntent.id, intentId));
    await tx
      .insert(connectedWallet)
      .values({ id: newId(), userId, address: wallet, network: intent.network, verifiedAt: new Date() })
      .onConflictDoUpdate({ target: [connectedWallet.userId, connectedWallet.address, connectedWallet.network], set: { verifiedAt: new Date() } });
    await enqueue("payment.settle", { intentId }, { idempotencyKey: `payment.settle:${intentId}`, maxAttempts: 3 }, tx);
  });
  await audit(userId, "payment.approved", intentId, { expectedDigest: decoded.digest, wallet });
  return { status: "approved" as const, idempotent: false, expectedDigest: decoded.digest };
}

/* ───────────── settlement ───────────── */

async function loadForSettlement(intentId: string) {
  const [intent] = await db().select().from(paymentIntent).where(eq(paymentIntent.id, intentId)).limit(1);
  const [auth] = await db().select().from(paymentAuthorization).where(eq(paymentAuthorization.intentId, intentId)).limit(1);
  return { intent, auth };
}

async function recordSettlement(intent: PaymentIntentRow, userId: string, check: SettlementCheck) {
  await db()
    .insert(paymentSettlement)
    .values({
      id: newId(),
      intentId: intent.id,
      userId,
      digest: check.digest,
      network: check.network,
      checkpoint: check.checkpoint,
      executionSuccess: check.executionSuccess,
      sender: check.sender,
      assetVerified: check.assetVerified,
      recipientVerified: check.recipientVerified,
      amountVerified: check.amountVerified,
      observedAmountAtomic: check.observedAmountAtomic,
      verifiedVia: check.verifiedVia,
      finalState: check.finalState,
      detail: { detail: check.detail, senderVerified: check.senderVerified },
    })
    .onConflictDoUpdate({
      target: paymentSettlement.intentId,
      set: {
        digest: check.digest,
        checkpoint: check.checkpoint,
        executionSuccess: check.executionSuccess,
        sender: check.sender,
        assetVerified: check.assetVerified,
        recipientVerified: check.recipientVerified,
        amountVerified: check.amountVerified,
        observedAmountAtomic: check.observedAmountAtomic,
        finalState: check.finalState,
        detail: { detail: check.detail, senderVerified: check.senderVerified },
        verifiedAt: new Date(),
      },
    });
}

async function setIntentStatus(intentId: string, status: PaymentIntentRow["status"]) {
  await db().update(paymentIntent).set({ status, updatedAt: new Date() }).where(eq(paymentIntent.id, intentId));
}

async function storePaidResult(intent: PaymentIntentRow, result: unknown): Promise<string> {
  const [existing] = await db().select({ id: toolExecution.id }).from(toolExecution).where(eq(toolExecution.paymentIntentId, intent.id)).limit(1);
  if (existing) return existing.id;
  const id = newId();
  await db().insert(toolExecution).values({
    id,
    runId: intent.runId!,
    userId: intent.userId,
    toolId: PAID_FORENSICS_TOOL_ID,
    input: intent.toolInput,
    output: result,
    status: "success",
    paymentIntentId: intent.id,
    finishedAt: new Date(),
    latencyMs: null,
  });
  return id;
}

/** Job: present the authorized payment to the seller and verify the outcome. */
export async function settlePayment(intentId: string): Promise<"settled" | "failed" | "unknown" | "noop"> {
  const { intent, auth } = await loadForSettlement(intentId);
  if (!intent || !auth || auth.decision !== "approved" || !intent.runId) return "noop";
  if (["settled", "failed", "rejected", "expired", "cancelled"].includes(intent.status)) return "noop";

  const { requirements, resource } = requirementsOf(intent);
  const expected = {
    digest: auth.expectedDigest!,
    network: requirements.network,
    payTo: requirements.payTo,
    asset: requirements.asset,
    amountAtomic: requirements.amount,
    expectedSender: auth.walletAddress,
  };

  if (intent.status === "settling" || intent.status === "unknown") {
    // A previous attempt may have broadcast: never pay twice — check the chain first.
    const prior = await verifySettlement(chain(), expected);
    if (prior.finalState === "failed" || prior.finalState === "mismatch") {
      await recordSettlement(intent, intent.userId, prior);
      await setIntentStatus(intentId, "failed");
      await enqueue("agent.resume", { runId: intent.runId }, { idempotencyKey: `agent.resume:${intent.runId}:${intentId}` });
      return "failed";
    }
  }

  await setIntentStatus(intentId, "settling");
  const payload: PaymentPayload = {
    x402Version: X402_VERSION,
    resource,
    accepted: requirements,
    payload: { transaction: auth.transactionBytes!, signature: auth.signature! },
  };
  const url = specialistResourceUrl();
  assertRegisteredUrl(url);

  let res: Response;
  try {
    res = await transport()(url, {
      method: "POST",
      headers: { "content-type": "application/json", [HEADER_PAYMENT_SIGNATURE]: encodeHeader(payload) },
      body: JSON.stringify(intent.toolInput),
      signal: AbortSignal.timeout(120_000),
      redirect: "error",
    });
  } catch (err) {
    log.warn("paid request failed in transit — reconciling", { intentId, err: safeErrorMessage(err) });
    await setIntentStatus(intentId, "unknown");
    await enqueue("payment.reconcile", { intentId }, { idempotencyKey: `payment.reconcile:${intentId}:${Date.now()}`, delayMs: 10_000, maxAttempts: 20 });
    return "unknown";
  }

  const settle = decodeHeader(res.headers.get(HEADER_PAYMENT_RESPONSE), settleResponseSchema);
  const bodyJson = (await res.json().catch(() => null)) as { result?: unknown; error?: string } | null;
  const digest = settle?.transaction || auth.expectedDigest!;
  if (digest) {
    await db()
      .insert(paymentTransaction)
      .values({
        id: newId(),
        intentId,
        userId: intent.userId,
        digest,
        facilitator: "seller",
        settleResponse: settle ?? { httpStatus: res.status },
        status: res.ok ? "submitted" : "unknown",
      })
      .onConflictDoNothing();
  }

  if (res.status === 200 && bodyJson?.result !== undefined) {
    const execId = await storePaidResult(intent, bodyJson.result);
    const check = await verifySettlement(chain(), { ...expected, digest });
    await recordSettlement(intent, intent.userId, check);
    if (check.finalState === "settled") {
      await finalizeSettled(intent, digest, execId, bodyJson.result);
      return "settled";
    }
    if (check.finalState === "unknown") {
      await setIntentStatus(intentId, "unknown");
      await enqueue("payment.reconcile", { intentId }, { idempotencyKey: `payment.reconcile:${intentId}:${Date.now()}`, delayMs: 8_000, maxAttempts: 20 });
      return "unknown";
    }
    await setIntentStatus(intentId, "failed");
    await db().update(paymentTransaction).set({ status: "failed" }).where(eq(paymentTransaction.digest, digest));
    await enqueue("agent.resume", { runId: intent.runId }, { idempotencyKey: `agent.resume:${intent.runId}:${intentId}` });
    return "failed";
  }

  if (settle?.errorReason === "settlement_pending" || (res.status >= 500 && res.status !== 502)) {
    await setIntentStatus(intentId, "unknown");
    await enqueue("payment.reconcile", { intentId }, { idempotencyKey: `payment.reconcile:${intentId}:${Date.now()}`, delayMs: 10_000, maxAttempts: 20 });
    return "unknown";
  }

  // 402 with a verification failure, or 502 (work failed, payment not settled): not charged.
  log.info("paid request not settled", { intentId, status: res.status, reason: bodyJson?.error });
  await db()
    .update(paymentIntent)
    .set({ status: "failed", alternatives: { ...(intent.alternatives as object), failure: bodyJson?.error ?? `HTTP ${res.status}` }, updatedAt: new Date() })
    .where(eq(paymentIntent.id, intentId));
  await enqueue("agent.resume", { runId: intent.runId }, { idempotencyKey: `agent.resume:${intent.runId}:${intentId}` });
  return "failed";
}

async function finalizeSettled(intent: PaymentIntentRow, digest: string, toolExecutionId: string, result: unknown) {
  await addEvidence(
    { id: intent.runId!, userId: intent.userId },
    toolExecutionId,
    { kind: "paid_analysis", reference: digest, data: result },
    { provider: "recalliq-specialist (x402)", method: "POST /api/x402/forensics", network: intent.network },
  );
  await db().update(paymentTransaction).set({ status: "confirmed" }).where(eq(paymentTransaction.digest, digest));
  await setIntentStatus(intent.id, "settled");
  await audit(intent.userId, "payment.settled", intent.id, { digest });
  await enqueue("agent.resume", { runId: intent.runId }, { idempotencyKey: `agent.resume:${intent.runId}:${intent.id}` });
}

/** Job: resolve an `unknown` payment from chain state; never re-pay with new bytes. */
export async function reconcilePayment(intentId: string): Promise<"settled" | "failed" | "pending" | "noop"> {
  const { intent, auth } = await loadForSettlement(intentId);
  if (!intent || !auth || !intent.runId) return "noop";
  if (intent.status !== "unknown" && intent.status !== "settling") return "noop";
  const { requirements } = requirementsOf(intent);
  const check = await verifySettlement(chain(), {
    digest: auth.expectedDigest!,
    network: requirements.network,
    payTo: requirements.payTo,
    asset: requirements.asset,
    amountAtomic: requirements.amount,
    expectedSender: auth.walletAddress,
  });
  await recordSettlement(intent, intent.userId, check);

  if (check.finalState === "settled") {
    const [exec] = await db().select().from(toolExecution).where(eq(toolExecution.paymentIntentId, intentId)).limit(1);
    if (exec) {
      await finalizeSettled(intent, check.digest, exec.id, exec.output);
      return "settled";
    }
    // Paid on chain but we never received the result: the seller re-delivers for the same signed payload.
    await setIntentStatus(intentId, "settling");
    const outcome = await settlePayment(intentId);
    return outcome === "settled" ? "settled" : "pending";
  }
  if (check.finalState === "failed" || check.finalState === "mismatch") {
    await setIntentStatus(intentId, "failed");
    await enqueue("agent.resume", { runId: intent.runId }, { idempotencyKey: `agent.resume:${intent.runId}:${intentId}` });
    return "failed";
  }
  const ageMs = Date.now() - (intent.decidedAt ?? intent.createdAt).getTime();
  if (ageMs > 30 * 60_000) {
    await db()
      .update(paymentIntent)
      .set({
        status: "failed",
        alternatives: { ...(intent.alternatives as object), failure: "Payment never appeared on chain within 30 minutes" },
        updatedAt: new Date(),
      })
      .where(eq(paymentIntent.id, intentId));
    await enqueue("agent.resume", { runId: intent.runId }, { idempotencyKey: `agent.resume:${intent.runId}:${intentId}` });
    return "failed";
  }
  return "pending";
}

/** Expire approval requests nobody answered; the paused run resumes without the paid analysis. */
export async function expireStaleIntents(): Promise<number> {
  const stale = await db()
    .update(paymentIntent)
    .set({ status: "expired", updatedAt: new Date() })
    .where(and(eq(paymentIntent.status, "awaiting_approval"), lt(paymentIntent.expiresAt, new Date())))
    .returning({ id: paymentIntent.id, runId: paymentIntent.runId });
  for (const s of stale) {
    if (s.runId) await enqueue("agent.resume", { runId: s.runId }, { idempotencyKey: `agent.resume:${s.runId}:${s.id}` });
  }
  return stale.length;
}
