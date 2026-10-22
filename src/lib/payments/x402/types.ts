/**
 * x402 v2 protocol types (x402-foundation/x402 specs) with the Sui `exact`
 * scheme payload: the payer's complete signed transaction.
 *
 * HTTP transport:
 *   402 response   → `PAYMENT-REQUIRED`  header: base64(JSON PaymentRequired)
 *   paid request   → `PAYMENT-SIGNATURE` header: base64(JSON PaymentPayload)
 *   success        → `PAYMENT-RESPONSE`  header: base64(JSON SettleResponse)
 */
import { z } from "zod";

export const X402_VERSION = 2;
export const HEADER_PAYMENT_REQUIRED = "PAYMENT-REQUIRED";
export const HEADER_PAYMENT_SIGNATURE = "PAYMENT-SIGNATURE";
export const HEADER_PAYMENT_RESPONSE = "PAYMENT-RESPONSE";

const atomicString = z.string().regex(/^\d+$/, "amount must be an integer string in atomic units");

export const resourceInfoSchema = z.object({
  url: z.string().url(),
  description: z.string().max(500).optional(),
  mimeType: z.string().max(100).optional(),
  serviceName: z.string().max(100).optional(),
  tags: z.array(z.string().max(40)).max(10).optional(),
});

export const paymentRequirementsSchema = z.object({
  scheme: z.literal("exact"),
  network: z.enum(["sui:mainnet", "sui:testnet"]),
  amount: atomicString,
  asset: z.string().min(3).max(200),
  payTo: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  maxTimeoutSeconds: z.number().int().positive().max(3600),
  extra: z.record(z.string(), z.unknown()).optional(),
});

export const paymentRequiredSchema = z.object({
  x402Version: z.literal(X402_VERSION),
  error: z.string().max(500).optional(),
  resource: resourceInfoSchema,
  accepts: z.array(paymentRequirementsSchema).min(1).max(10),
  extensions: z.record(z.string(), z.unknown()).optional(),
});

export const suiExactPayloadSchema = z.object({
  /** Base64 BCS-serialised TransactionData signed by the payer. */
  transaction: z.string().min(16).max(64_000),
  /** Base64 serialised Sui signature (flag || sig || pk, or zkLogin/multisig). */
  signature: z.string().min(16).max(16_000),
});

export const paymentPayloadSchema = z.object({
  x402Version: z.literal(X402_VERSION),
  resource: resourceInfoSchema.optional(),
  accepted: paymentRequirementsSchema,
  payload: suiExactPayloadSchema,
  extensions: z.record(z.string(), z.unknown()).optional(),
});

export const settleResponseSchema = z.object({
  success: z.boolean(),
  errorReason: z.string().optional(),
  payer: z.string().optional(),
  transaction: z.string(),
  network: z.string(),
  amount: z.string().optional(),
  extensions: z.record(z.string(), z.unknown()).optional(),
});

export const verifyResponseSchema = z.object({
  isValid: z.boolean(),
  invalidReason: z.string().optional(),
  payer: z.string().optional(),
});

export type ResourceInfo = z.infer<typeof resourceInfoSchema>;
export type PaymentRequirements = z.infer<typeof paymentRequirementsSchema>;
export type PaymentRequired = z.infer<typeof paymentRequiredSchema>;
export type PaymentPayload = z.infer<typeof paymentPayloadSchema>;
export type SettleResponse = z.infer<typeof settleResponseSchema>;
export type VerifyResponse = z.infer<typeof verifyResponseSchema>;

/** Spec §9 reason codes used by the Sui exact scheme. */
export type X402Reason =
  | "insufficient_funds"
  | "invalid_network"
  | "invalid_payload"
  | "invalid_payment_requirements"
  | "invalid_scheme"
  | "unsupported_scheme"
  | "invalid_x402_version"
  | "invalid_transaction_state"
  | "invalid_exact_sui_payload_signature"
  | "invalid_exact_sui_payload_recipient_mismatch"
  | "invalid_exact_sui_payload_amount_mismatch"
  | "invalid_exact_sui_payload_asset_mismatch"
  | "invalid_exact_sui_payload_simulation_failed"
  | "invalid_exact_sui_payload_sponsorship"
  | "unexpected_verify_error"
  | "unexpected_settle_error"
  | "settlement_pending";

export function encodeHeader(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

/** Decode a base64 JSON header and validate it. Returns null when malformed. */
export function decodeHeader<T>(raw: string | null | undefined, schema: z.ZodType<T>): T | null {
  if (!raw || raw.length > 128_000) return null;
  try {
    const json = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
    const parsed = schema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function requirementsEqual(a: PaymentRequirements, b: PaymentRequirements): boolean {
  return (
    a.scheme === b.scheme &&
    a.network === b.network &&
    a.amount === b.amount &&
    a.asset === b.asset &&
    a.payTo.toLowerCase() === b.payTo.toLowerCase() &&
    a.maxTimeoutSeconds === b.maxTimeoutSeconds
  );
}
