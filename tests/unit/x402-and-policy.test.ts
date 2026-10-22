import { describe, expect, it } from "vitest";
import {
  decodeHeader,
  encodeHeader,
  paymentPayloadSchema,
  paymentRequiredSchema,
  requirementsEqual,
  type PaymentRequirements,
} from "@/lib/payments/x402/types";
import { evaluateSpendPolicy, type SpendPolicyInput } from "@/lib/payments/authorization/policy";

const PAY_TO = "0x" + "a".repeat(64);
const REQ: PaymentRequirements = { scheme: "exact", network: "sui:mainnet", amount: "10000000", asset: "0x2::sui::SUI", payTo: PAY_TO, maxTimeoutSeconds: 300 };

describe("x402 header codec", () => {
  it("round-trips a PaymentRequired object through base64 JSON", () => {
    const pr = { x402Version: 2, resource: { url: "https://example.test/api/x402/forensics" }, accepts: [REQ] };
    const decoded = decodeHeader(encodeHeader(pr), paymentRequiredSchema);
    expect(decoded).toEqual(pr);
  });

  it("rejects malformed and oversized headers", () => {
    expect(decodeHeader("not-base64-json", paymentRequiredSchema)).toBeNull();
    expect(decodeHeader(encodeHeader({ x402Version: 1, accepts: [] }), paymentRequiredSchema)).toBeNull();
    expect(decodeHeader("a".repeat(200_000), paymentPayloadSchema)).toBeNull();
  });

  it("rejects fractional or negative amounts in requirements", () => {
    const bad = { x402Version: 2, resource: { url: "https://x.test" }, accepts: [{ ...REQ, amount: "1.5" }] };
    expect(decodeHeader(encodeHeader(bad), paymentRequiredSchema)).toBeNull();
  });

  it("compares requirements field by field", () => {
    expect(requirementsEqual(REQ, { ...REQ, payTo: PAY_TO.toUpperCase().replace("0X", "0x") })).toBe(true);
    expect(requirementsEqual(REQ, { ...REQ, amount: "10000001" })).toBe(false);
    expect(requirementsEqual(REQ, { ...REQ, network: "sui:testnet" })).toBe(false);
  });
});

const BASE: SpendPolicyInput = {
  amountAtomic: "10000000",
  asset: "0x2::sui::SUI",
  payTo: PAY_TO,
  network: "sui:mainnet",
  configuredNetwork: "sui:mainnet",
  configuredAsset: "0x2::sui::SUI",
  allowedRecipients: [PAY_TO],
  platformMaxPerTxAtomic: "100000000",
  platformMaxPerDayAtomic: "500000000",
  paidToolsEnabled: true,
  isGuest: false,
  userLimitAsset: "0x2::sui::SUI",
  userPerPaymentLimitAtomic: null,
  userPerRunLimitAtomic: null,
  userDailyLimitAtomic: null,
  committedThisRunAtomic: "0",
  committed24hAtomic: "0",
};

describe("spending policy (trusted code)", () => {
  it("allows a payment inside every limit", () => {
    expect(evaluateSpendPolicy(BASE)).toEqual({ allowed: true, reasons: [] });
  });

  it.each([
    [{ isGuest: true }, "Guest"],
    [{ paidToolsEnabled: false }, "disabled"],
    [{ network: "sui:testnet" }, "Network"],
    [{ asset: "0xdead::coin::COIN" }, "asset"],
    [{ payTo: "0x" + "b".repeat(64) }, "allowlist"],
    [{ amountAtomic: "100000001" }, "platform per-payment"],
    [{ committed24hAtomic: "495000000" }, "platform 24h"],
    [{ userPerPaymentLimitAtomic: "9999999" }, "per-payment limit"],
    [{ userPerRunLimitAtomic: "15000000", committedThisRunAtomic: "10000000" }, "per-investigation"],
    [{ userDailyLimitAtomic: "10000000", committed24hAtomic: "1" }, "24h limit"],
    [{ amountAtomic: "0" }, "positive"],
  ] as Array<[Partial<SpendPolicyInput>, string]>)("blocks %o", (override, reason) => {
    const d = evaluateSpendPolicy({ ...BASE, ...override });
    expect(d.allowed).toBe(false);
    expect(d.reasons.join(" | ")).toContain(reason);
  });

  it("refuses to apply limits written in a different asset", () => {
    const d = evaluateSpendPolicy({ ...BASE, userLimitAsset: "0xdba3::usdc::USDC", userPerPaymentLimitAtomic: "1" });
    expect(d.allowed).toBe(false);
    expect(d.reasons[0]).toContain("different asset");
  });
});
