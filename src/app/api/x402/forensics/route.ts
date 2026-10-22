/**
 * RecallIQ Forensic Analyzer — x402-protected specialist API (Sui, `exact`).
 * Operated by RecallIQ. Without PAYMENT-SIGNATURE it answers 402 with the real
 * quote; with a valid signed payment it verifies, computes over live Tatum
 * data, settles on Sui, and returns the result with PAYMENT-RESPONSE.
 */
import { chain } from "@/lib/blockchain/tatum/client";
import { x402Config } from "@/lib/env";
import { clientIp, hitRateLimit } from "@/lib/security/rate-limit";
import { facilitator } from "@/lib/payments/x402/facilitator";
import { handlePaidRequest } from "@/lib/payments/x402/resource-server";
import type { PaymentRequirements, ResourceInfo } from "@/lib/payments/x402/types";
import { forensicsRequestSchema, runForensics } from "@/lib/specialist/forensics";
import { specialistResourceUrl } from "@/lib/ai/tools/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function jsonError(status: number, error: string) {
  return new Response(JSON.stringify({ error }), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const cfg = x402Config();
  if (!cfg.configured || !cfg.payTo || !cfg.forensicsPriceAtomic) return jsonError(503, "Paid specialist API is not configured on this deployment");

  const rl = await hitRateLimit(`x402:${clientIp(req.headers)}`, 60, 60);
  if (!rl.allowed) return jsonError(429, "Too many requests");

  const text = await req.text();
  if (text.length > 16 * 1024) return jsonError(413, "Request too large");
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(text || "{}");
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const body = forensicsRequestSchema.safeParse(parsedBody);
  if (!body.success) return jsonError(400, "Invalid request: use {mode:'address', address, limit?} or {mode:'compare', digests:[...]}");

  const requirements: PaymentRequirements = {
    scheme: "exact",
    network: cfg.network,
    amount: cfg.forensicsPriceAtomic,
    asset: cfg.asset,
    payTo: cfg.payTo,
    maxTimeoutSeconds: cfg.maxTimeoutSeconds,
    extra: { operator: "RecallIQ", disclosure: "First-party specialist analysis over Tatum data; not an independent third party." },
  };
  const resource: ResourceInfo = {
    url: specialistResourceUrl(),
    description: body.data.mode === "address" ? "Aggregated wallet forensics over recent Sui transactions" : "Side-by-side Sui transaction comparison",
    mimeType: "application/json",
    serviceName: "RecallIQ Forensic Analyzer",
  };

  return handlePaidRequest(req, {
    resource,
    requirements,
    facilitator: facilitator(),
    requestBody: body.data,
    work: () => runForensics(chain(), body.data),
  });
}
