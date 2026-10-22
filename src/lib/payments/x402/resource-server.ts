/**
 * Seller side of x402 for RecallIQ's specialist API.
 *
 *   no PAYMENT-SIGNATURE   → 402 + PAYMENT-REQUIRED (the quote)
 *   PAYMENT-SIGNATURE      → verify → do the work → settle → 200 + PAYMENT-RESPONSE
 *
 * The paid result is only released after settlement succeeds. Work that fails
 * after verification is never settled (the payer is not charged). A digest
 * already in the sale ledger with the same request hash gets its stored result
 * back (idempotent re-delivery) instead of being charged or computed twice.
 */
import { eq } from "drizzle-orm";
import { chain } from "@/lib/blockchain/tatum/client";
import { db } from "@/lib/db/client";
import { x402Sale } from "@/lib/db/schema";
import { verifySettlement } from "@/lib/payments/verification/settlement";
import { logger } from "@/lib/logging/logger";
import { newId, sha256Hex, stableStringify } from "@/lib/security/ids";
import { safeErrorMessage } from "@/lib/security/redact";
import type { Facilitator } from "./facilitator";
import { decodePaymentTransaction } from "./sui-exact";
import {
  decodeHeader,
  encodeHeader,
  HEADER_PAYMENT_REQUIRED,
  HEADER_PAYMENT_RESPONSE,
  HEADER_PAYMENT_SIGNATURE,
  paymentPayloadSchema,
  requirementsEqual,
  X402_VERSION,
  type PaymentRequired,
  type PaymentRequirements,
  type ResourceInfo,
  type SettleResponse,
} from "./types";

const log = logger("x402.seller");

export interface PaidHandlerOptions<T> {
  resource: ResourceInfo;
  requirements: PaymentRequirements;
  facilitator: Facilitator;
  /** Canonical request body (already validated) — part of the idempotency hash. */
  requestBody: unknown;
  work: () => Promise<T>;
}

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });
}

export function paymentRequiredResponse(resource: ResourceInfo, requirements: PaymentRequirements, error?: string): Response {
  const body: PaymentRequired = { x402Version: X402_VERSION, error, resource, accepts: [requirements] };
  return json(body, 402, { [HEADER_PAYMENT_REQUIRED]: encodeHeader(body) });
}

export async function handlePaidRequest<T>(req: Request, o: PaidHandlerOptions<T>): Promise<Response> {
  const header = req.headers.get(HEADER_PAYMENT_SIGNATURE);
  if (!header) return paymentRequiredResponse(o.resource, o.requirements, `${HEADER_PAYMENT_SIGNATURE} header is required`);

  const payload = decodeHeader(header, paymentPayloadSchema);
  if (!payload) return paymentRequiredResponse(o.resource, o.requirements, "invalid_payload");
  if (!requirementsEqual(payload.accepted, o.requirements)) return paymentRequiredResponse(o.resource, o.requirements, "invalid_payment_requirements");

  const requestHash = sha256Hex(stableStringify({ resource: o.resource.url, body: o.requestBody }));
  let digest: string;
  try {
    digest = decodePaymentTransaction(payload.payload.transaction).digest;
  } catch {
    return paymentRequiredResponse(o.resource, o.requirements, "invalid_payload");
  }

  // Idempotent re-delivery / reconciliation for a digest we have seen before.
  const [prior] = await db().select().from(x402Sale).where(eq(x402Sale.digest, digest)).limit(1);
  if (prior) {
    if (prior.requestHash !== requestHash) return paymentRequiredResponse(o.resource, o.requirements, "invalid_transaction_state");
    if (prior.status === "settled") {
      return json({ result: prior.result, redelivered: true }, 200, { [HEADER_PAYMENT_RESPONSE]: encodeHeader(prior.settleResponse) });
    }
    if (prior.status === "settlement_pending") {
      // An earlier broadcast was ambiguous: ask the chain before doing anything else.
      const check = await verifySettlement(chain(), {
        digest,
        network: o.requirements.network,
        payTo: o.requirements.payTo,
        asset: o.requirements.asset,
        amountAtomic: o.requirements.amount,
        expectedSender: prior.payer || null,
      });
      if (check.finalState === "settled") {
        const settled: SettleResponse = {
          success: true,
          payer: prior.payer,
          transaction: digest,
          network: o.requirements.network,
          amount: check.observedAmountAtomic ?? undefined,
        };
        await markSaleSettled(digest, settled);
        return json({ result: prior.result, redelivered: true }, 200, { [HEADER_PAYMENT_RESPONSE]: encodeHeader(settled) });
      }
      if (check.finalState === "failed" || check.finalState === "mismatch") {
        await db().update(x402Sale).set({ status: "failed", updatedAt: new Date() }).where(eq(x402Sale.id, prior.id));
        return paymentRequiredResponse(o.resource, o.requirements, "invalid_transaction_state");
      }
      // Not on chain: the bytes never executed — fall through and settle them now.
    }
  }

  const verification = await o.facilitator.verify(payload, o.requirements);
  if (!verification.isValid) {
    return paymentRequiredResponse(o.resource, o.requirements, verification.invalidReason ?? "invalid_payload");
  }

  const saleId = prior?.id ?? newId();
  if (!prior) {
    await db()
      .insert(x402Sale)
      .values({
        id: saleId,
        digest,
        payer: verification.payer ?? "",
        payTo: o.requirements.payTo,
        asset: o.requirements.asset,
        amountAtomic: o.requirements.amount,
        network: o.requirements.network,
        resource: o.resource.url,
        requestHash,
        facilitator: o.facilitator.id,
        status: "verified",
      });
  }

  let result: T;
  try {
    result = prior?.status === "settlement_pending" && prior.result ? (prior.result as T) : await o.work();
  } catch (err) {
    await db().update(x402Sale).set({ status: "failed", updatedAt: new Date() }).where(eq(x402Sale.id, saleId));
    log.warn("paid work failed before settlement — payer not charged", { digest, err: safeErrorMessage(err) });
    return json({ error: "The analysis could not be completed; your payment was not settled.", detail: safeErrorMessage(err) }, 502);
  }

  const settlement: SettleResponse = await o.facilitator.settle(payload, o.requirements);
  if (settlement.success) {
    await db()
      .update(x402Sale)
      .set({ status: "settled", settleResponse: settlement, result: result as unknown, updatedAt: new Date() })
      .where(eq(x402Sale.id, saleId));
    return json({ result }, 200, { [HEADER_PAYMENT_RESPONSE]: encodeHeader(settlement) });
  }

  const pending = settlement.errorReason === "settlement_pending";
  await db()
    .update(x402Sale)
    .set({
      status: pending ? "settlement_pending" : "failed",
      settleResponse: settlement,
      result: pending ? (result as unknown) : null,
      updatedAt: new Date(),
    })
    .where(eq(x402Sale.id, saleId));
  const failure: SettleResponse = { ...settlement, transaction: settlement.transaction || digest };
  return json({ x402Version: X402_VERSION, error: settlement.errorReason ?? "unexpected_settle_error", resource: o.resource, accepts: [o.requirements] }, 402, {
    [HEADER_PAYMENT_RESPONSE]: encodeHeader(failure),
    [HEADER_PAYMENT_REQUIRED]: encodeHeader({ x402Version: X402_VERSION, error: settlement.errorReason, resource: o.resource, accepts: [o.requirements] }),
  });
}

/**
 * Called by reconciliation once a `settlement_pending` digest is confirmed on
 * chain: promote the sale so the stored result can be re-delivered.
 */
export async function markSaleSettled(digest: string, settleResponse: SettleResponse): Promise<void> {
  await db().update(x402Sale).set({ status: "settled", settleResponse, updatedAt: new Date() }).where(eq(x402Sale.digest, digest));
}
