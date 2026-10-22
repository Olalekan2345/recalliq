/**
 * x402 facilitator implementations.
 *
 *  - "self"   (default): RecallIQ's resource server verifies and settles the
 *              payer's signed transaction itself through Tatum's
 *              TransactionExecutionService (simulate → execute). Non-custodial:
 *              we only broadcast bytes the payer signed.
 *  - "remote": a Sui x402 facilitator implementing POST /verify and /settle
 *              (x402 v2 facilitator API), e.g. a self-hosted
 *              DrVelvetFog/sui-x402-facilitator. Its answers are still
 *              independently re-verified on chain through Tatum afterwards.
 */
import { chain } from "@/lib/blockchain/tatum/client";
import { x402Config } from "@/lib/env";
import { settleSuiExactPayment, verifySuiExactPayment, type SuiVerifyResult } from "./sui-exact";
import { settleResponseSchema, verifyResponseSchema, X402_VERSION, type PaymentPayload, type PaymentRequirements, type SettleResponse } from "./types";

export interface Facilitator {
  readonly id: string;
  verify(payload: PaymentPayload, requirements: PaymentRequirements): Promise<SuiVerifyResult>;
  settle(payload: PaymentPayload, requirements: PaymentRequirements): Promise<SettleResponse>;
}

export const selfFacilitator: Facilitator = {
  id: "self:tatum-grpc",
  verify: (payload, requirements) => verifySuiExactPayment(chain(), payload, requirements),
  settle: (payload, requirements) => settleSuiExactPayment(chain(), payload, requirements),
};

export function remoteFacilitator(baseUrl: string): Facilitator {
  const url = baseUrl.replace(/\/$/, "");
  const post = async (path: string, payload: PaymentPayload, requirements: PaymentRequirements) => {
    const res = await fetch(`${url}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ x402Version: X402_VERSION, paymentPayload: payload, paymentRequirements: requirements }),
      signal: AbortSignal.timeout(45_000),
      redirect: "error",
    });
    if (!res.ok && res.status !== 200) throw new Error(`Facilitator ${path} HTTP ${res.status}`);
    return res.json();
  };
  return {
    id: `remote:${new URL(url).host}`,
    async verify(payload, requirements) {
      const parsed = verifyResponseSchema.safeParse(await post("/verify", payload, requirements));
      if (!parsed.success) return { isValid: false, invalidReason: "unexpected_verify_error" };
      return parsed.data;
    },
    async settle(payload, requirements) {
      try {
        const parsed = settleResponseSchema.safeParse(await post("/settle", payload, requirements));
        if (!parsed.success) return { success: false, errorReason: "unexpected_settle_error", transaction: "", network: requirements.network };
        return parsed.data;
      } catch {
        return { success: false, errorReason: "settlement_pending", transaction: "", network: requirements.network };
      }
    },
  };
}

export function facilitator(): Facilitator {
  const cfg = x402Config();
  if (cfg.facilitatorMode === "remote") {
    if (!cfg.facilitatorUrl) throw new Error("X402_FACILITATOR_MODE=remote requires X402_FACILITATOR_URL");
    return remoteFacilitator(cfg.facilitatorUrl);
  }
  return selfFacilitator;
}
