/**
 * x402 `exact` scheme on Sui — verification and settlement.
 *
 * Verification (x402 scheme_exact_sui):
 *   1. version / scheme / network / accepted terms match the requirements
 *   2. transaction bytes decode; gas owner == sender (no sponsorship in this flow)
 *   3. signature is valid for the bytes and the signer is the sender
 *   4. not already executed (replay protection: digest computed locally)
 *   5. simulation succeeds and credits `payTo` with exactly `amount` of `asset`
 *
 * Settlement broadcasts the payer's exact bytes. It is never blindly retried:
 * an ambiguous outcome returns `settlement_pending` with the locally computed
 * digest so the caller reconciles on chain first.
 */
import { TransactionDataBuilder } from "@mysten/sui/transactions";
import { fromBase64 } from "@mysten/sui/utils";
import { ChainDataError, type ChainClient } from "@/lib/blockchain/tatum/client";
import { normalizeAddress, sameAddress, sameCoinType } from "@/lib/blockchain/sui/validation";
import { toBigInt } from "@/lib/blockchain/sui/amounts";
import type { PaymentPayload, PaymentRequirements, SettleResponse, VerifyResponse, X402Reason } from "./types";
import { requirementsEqual, X402_VERSION } from "./types";

export interface DecodedPayment {
  digest: string;
  sender: string;
  gasOwner: string | null;
}

export function decodePaymentTransaction(transactionB64: string): DecodedPayment {
  const bytes = fromBase64(transactionB64);
  const data = TransactionDataBuilder.fromBytes(bytes);
  const sender = data.sender ? normalizeAddress(data.sender) : null;
  if (!sender) throw new Error("Transaction has no sender");
  return {
    digest: TransactionDataBuilder.getDigestFromBytes(bytes),
    sender,
    gasOwner: data.gasData?.owner ? normalizeAddress(data.gasData.owner) : null,
  };
}

export interface SuiVerifyResult extends VerifyResponse {
  digest?: string;
  observedAmountAtomic?: string;
}

function invalid(reason: X402Reason, payer?: string, digest?: string): SuiVerifyResult {
  return { isValid: false, invalidReason: reason, payer, digest };
}

export async function verifySuiExactPayment(chainClient: ChainClient, payload: PaymentPayload, requirements: PaymentRequirements): Promise<SuiVerifyResult> {
  if (payload.x402Version !== X402_VERSION) return invalid("invalid_x402_version");
  if (requirements.scheme !== "exact" || payload.accepted.scheme !== "exact") return invalid("unsupported_scheme");
  if (payload.accepted.network !== requirements.network || `sui:${chainClient.network}` !== requirements.network) return invalid("invalid_network");
  if (!requirementsEqual(payload.accepted, requirements)) return invalid("invalid_payment_requirements");

  let decoded: DecodedPayment;
  try {
    decoded = decodePaymentTransaction(payload.payload.transaction);
  } catch {
    return invalid("invalid_payload");
  }
  if (decoded.gasOwner && decoded.gasOwner !== decoded.sender) return invalid("invalid_exact_sui_payload_sponsorship", decoded.sender, decoded.digest);

  const sig = await chainClient.verifyTransactionSignature(payload.payload.transaction, payload.payload.signature, decoded.sender);
  if (!sig.valid) return invalid("invalid_exact_sui_payload_signature", decoded.sender, decoded.digest);

  // Replay: an already-executed payment cannot be accepted again.
  try {
    await chainClient.getTransaction(decoded.digest);
    return invalid("invalid_transaction_state", decoded.sender, decoded.digest);
  } catch (err) {
    if (!(err instanceof ChainDataError) || err.code !== "not_found") {
      return invalid("unexpected_verify_error", decoded.sender, decoded.digest);
    }
  }

  let sim;
  try {
    sim = (await chainClient.simulateTransaction(payload.payload.transaction)).data;
  } catch {
    return invalid("unexpected_verify_error", decoded.sender, decoded.digest);
  }
  if (!sim.success) {
    const reason: X402Reason = /insufficient|balance/i.test(sim.error ?? "") ? "insufficient_funds" : "invalid_exact_sui_payload_simulation_failed";
    return invalid(reason, decoded.sender, decoded.digest);
  }
  const credit = sim.balanceChanges
    .filter((b) => sameAddress(b.address, requirements.payTo) && sameCoinType(b.coinType, requirements.asset))
    .reduce((acc, b) => acc + toBigInt(b.amountAtomic), 0n);
  if (credit === 0n) {
    const anyToPayTo = sim.balanceChanges.some((b) => sameAddress(b.address, requirements.payTo));
    return invalid(anyToPayTo ? "invalid_exact_sui_payload_asset_mismatch" : "invalid_exact_sui_payload_recipient_mismatch", decoded.sender, decoded.digest);
  }
  if (credit !== toBigInt(requirements.amount)) {
    return { ...invalid("invalid_exact_sui_payload_amount_mismatch", decoded.sender, decoded.digest), observedAmountAtomic: credit.toString() };
  }
  return { isValid: true, payer: decoded.sender, digest: decoded.digest, observedAmountAtomic: credit.toString() };
}

export async function settleSuiExactPayment(chainClient: ChainClient, payload: PaymentPayload, requirements: PaymentRequirements): Promise<SettleResponse> {
  const verification = await verifySuiExactPayment(chainClient, payload, requirements);
  if (!verification.isValid) {
    return {
      success: false,
      errorReason: verification.invalidReason,
      payer: verification.payer,
      transaction: "",
      network: requirements.network,
    };
  }
  try {
    const res = await chainClient.executeTransaction(payload.payload.transaction, [payload.payload.signature]);
    return {
      success: res.data.success,
      errorReason: res.data.success ? undefined : "unexpected_settle_error",
      payer: verification.payer,
      transaction: res.data.digest,
      network: requirements.network,
      amount: verification.observedAmountAtomic,
    };
  } catch {
    // Ambiguous (timeout, connection reset…): the transaction may or may not
    // have executed. Report pending with the digest; caller reconciles on chain.
    return {
      success: false,
      errorReason: "settlement_pending",
      payer: verification.payer,
      transaction: verification.digest ?? "",
      network: requirements.network,
    };
  }
}
