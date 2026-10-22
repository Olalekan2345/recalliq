/**
 * x402 `exact` on Sui with REAL Ed25519 signatures over REAL transaction bytes.
 * Chain state comes from the fixture client.
 */
import { describe, expect, it } from "vitest";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { toBase64 } from "@mysten/sui/utils";
import { decodePaymentTransaction, settleSuiExactPayment, verifySuiExactPayment } from "@/lib/payments/x402/sui-exact";
import type { PaymentPayload, PaymentRequirements } from "@/lib/payments/x402/types";
import { verifySettlement } from "@/lib/payments/verification/settlement";
import { buildOfflinePayment, FakeChain } from "../helpers/fake-chain";

const PAY_TO = "0x" + "a".repeat(64);
const REQ: PaymentRequirements = { scheme: "exact", network: "sui:mainnet", amount: "10000000", asset: "0x2::sui::SUI", payTo: PAY_TO, maxTimeoutSeconds: 300 };

async function signedPayload(amount = 10_000_000n, payTo = PAY_TO, signer = new Ed25519Keypair()) {
  const bytes = await buildOfflinePayment(signer.toSuiAddress(), payTo, amount);
  const { signature } = await signer.signTransaction(bytes);
  const payload: PaymentPayload = { x402Version: 2, accepted: REQ, payload: { transaction: toBase64(bytes), signature } };
  return { payload, signer, bytes };
}

describe("x402 exact on Sui — verification", () => {
  it("accepts a correctly signed exact payment", async () => {
    const { payload, signer } = await signedPayload();
    const r = await verifySuiExactPayment(new FakeChain(), payload, REQ);
    expect(r).toMatchObject({ isValid: true, payer: signer.toSuiAddress(), observedAmountAtomic: "10000000" });
  });

  it("rejects a signature from a different key", async () => {
    const { payload } = await signedPayload();
    const other = await signedPayload();
    const r = await verifySuiExactPayment(new FakeChain(), { ...payload, payload: { ...payload.payload, signature: other.payload.payload.signature } }, REQ);
    expect(r.invalidReason).toBe("invalid_exact_sui_payload_signature");
  });

  it("rejects wrong amounts, wrong recipients and mismatched terms", async () => {
    expect((await verifySuiExactPayment(new FakeChain(), (await signedPayload(9_999_999n)).payload, REQ)).invalidReason).toBe(
      "invalid_exact_sui_payload_amount_mismatch",
    );
    expect((await verifySuiExactPayment(new FakeChain(), (await signedPayload(10_000_000n, "0x" + "b".repeat(64))).payload, REQ)).invalidReason).toBe(
      "invalid_exact_sui_payload_recipient_mismatch",
    );
    const { payload } = await signedPayload();
    expect((await verifySuiExactPayment(new FakeChain(), { ...payload, accepted: { ...REQ, amount: "1" } }, REQ)).invalidReason).toBe(
      "invalid_payment_requirements",
    );
    expect((await verifySuiExactPayment(new FakeChain(), payload, { ...REQ, network: "sui:testnet" })).invalidReason).toBe("invalid_network");
  });

  it("prevents replay of an already executed payment", async () => {
    const chain = new FakeChain();
    const { payload } = await signedPayload();
    const settled = await settleSuiExactPayment(chain, payload, REQ);
    expect(settled.success).toBe(true);
    const again = await verifySuiExactPayment(chain, payload, REQ);
    expect(again.invalidReason).toBe("invalid_transaction_state");
  });

  it("reports an ambiguous broadcast as settlement_pending with the local digest", async () => {
    const chain = new FakeChain();
    chain.failExecute = "ambiguous";
    const { payload, bytes } = await signedPayload();
    const r = await settleSuiExactPayment(chain, payload, REQ);
    expect(r).toMatchObject({ success: false, errorReason: "settlement_pending" });
    expect(r.transaction).toBe(decodePaymentTransaction(toBase64(bytes)).digest);
  });
});

describe("independent settlement verification", () => {
  it("marks settled only when recipient, asset and exact amount are confirmed on chain", async () => {
    const chain = new FakeChain();
    const { payload, signer } = await signedPayload();
    const s = await settleSuiExactPayment(chain, payload, REQ);
    const ok = await verifySettlement(chain, {
      digest: s.transaction,
      network: "sui:mainnet",
      payTo: PAY_TO,
      asset: REQ.asset,
      amountAtomic: REQ.amount,
      expectedSender: signer.toSuiAddress(),
    });
    expect(ok.finalState).toBe("settled");
    const wrong = await verifySettlement(chain, {
      digest: s.transaction,
      network: "sui:mainnet",
      payTo: PAY_TO,
      asset: REQ.asset,
      amountAtomic: "20000000",
      expectedSender: signer.toSuiAddress(),
    });
    expect(wrong.finalState).toBe("mismatch");
    const unknown = await verifySettlement(chain, {
      digest: decodePaymentTransaction((await signedPayload()).payload.payload.transaction).digest,
      network: "sui:mainnet",
      payTo: PAY_TO,
      asset: REQ.asset,
      amountAtomic: REQ.amount,
      expectedSender: null,
    });
    expect(unknown.finalState).toBe("unknown");
  });
});
