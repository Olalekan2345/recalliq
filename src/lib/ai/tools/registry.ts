/**
 * Controlled tool registry. The model can only call tools registered here,
 * with arguments validated by each tool's schema. The registry is also synced
 * to `tool_definition` (static configuration — never performance data).
 */
import { z } from "zod";
import { db } from "@/lib/db/client";
import { toolDefinition } from "@/lib/db/schema";
import { env, x402Config } from "@/lib/env";
import { formatAtomic } from "@/lib/blockchain/sui/amounts";
import { forensicsRequestSchema } from "@/lib/specialist/forensics";
import { FREE_TOOLS } from "./chain-tools";
import type { ToolSpec } from "./types";

export const PAID_FORENSICS_TOOL_ID = "paid_forensic_analyzer";

export function specialistResourceUrl(): string {
  return `${env().NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/api/x402/forensics`;
}

/** Flat, top-level object schema (tool APIs require `type: object` at the root). */
export const paidForensicsInputSchema = z
  .object({
    mode: z.enum(["address", "compare"]),
    address: z
      .string()
      .regex(/^0x[0-9a-fA-F]{1,64}$/)
      .optional(),
    digests: z.array(z.string().min(43).max(44)).min(2).max(10).optional(),
    limit: z.number().int().min(5).max(40).optional(),
    justification: z.string().min(10).max(400),
  })
  .refine((v) => (v.mode === "address" ? Boolean(v.address) : Boolean(v.digests)), "address mode needs `address`; compare mode needs `digests`");

export type PaidForensicsInput = z.infer<typeof paidForensicsInputSchema>;

export function toForensicsRequest(input: PaidForensicsInput) {
  return forensicsRequestSchema.parse(
    input.mode === "address" ? { mode: "address", address: input.address, limit: input.limit ?? 40 } : { mode: "compare", digests: input.digests },
  );
}

export const paidForensicsTool: ToolSpec<PaidForensicsInput> = {
  id: PAID_FORENSICS_TOOL_ID,
  name: "Forensic Analyzer (paid, x402)",
  summary: "Deep aggregation over up to 40 transactions or a side-by-side comparison of up to 10 — paid per call via x402 on Sui.",
  description:
    "PAID specialist analysis (x402 on Sui; the user must approve the exact payment in their wallet). mode=address aggregates up to 40 recent transactions of an address: exact net flows per coin, counterparties, Move call targets, gas, failures, cadence and rule-based observational flags. mode=compare compares 2–10 transactions side by side. Only request it when free tools cannot answer adequately, and explain why in `justification`. Calling it pauses the investigation until the user approves or rejects.",
  provider: "RecallIQ specialist API (x402)",
  operator: "RecallIQ",
  capabilities: ["aggregated_wallet_analysis", "multi_transaction_comparison", "observational_flags"],
  categories: ["wallet_activity", "anomaly_investigation", "transaction_comparison", "balance_changes"],
  supportedNetworks: ["sui:mainnet"],
  pricingType: "x402",
  timeoutMs: 90_000,
  authorizationRequirements: "Explicit per-payment approval signed in the user's own Sui wallet",
  disclosure: "Operated by RecallIQ. It performs deeper processing of Tatum data; it is not an independent third-party opinion.",
  inputSchema: paidForensicsInputSchema,
  availability() {
    const cfg = x402Config();
    if (!cfg.configured) return { status: "unconfigured", detail: "X402_PAY_TO and X402_FORENSICS_PRICE_ATOMIC are not configured" };
    return { status: "available" };
  },
};

export const ALL_TOOLS: ToolSpec<never>[] = [...FREE_TOOLS, paidForensicsTool as ToolSpec<never>];

export function getTool(id: string): ToolSpec<never> | undefined {
  return ALL_TOOLS.find((t) => t.id === id);
}

/** Price as configured by the operator for its own x402 endpoint (never invented). */
export function configuredPrice(toolId: string): { amountAtomic: string; asset: string } | null {
  if (toolId !== PAID_FORENSICS_TOOL_ID) return null;
  const cfg = x402Config();
  return cfg.forensicsPriceAtomic ? { amountAtomic: cfg.forensicsPriceAtomic, asset: cfg.asset } : null;
}

export function describePrice(amountAtomic: string, decimals: number | null, symbol: string | null): string {
  return decimals !== null ? `${formatAtomic(amountAtomic, decimals)} ${symbol ?? ""}`.trim() : `${amountAtomic} atomic units`;
}

/** Upsert static tool definitions (idempotent). */
export async function syncToolDefinitions(): Promise<void> {
  const now = new Date();
  for (const t of ALL_TOOLS) {
    const price = configuredPrice(t.id);
    const availability = t.availability();
    const values = {
      id: t.id,
      name: t.name,
      description: t.summary,
      provider: t.provider,
      operator: t.operator,
      capabilities: t.capabilities,
      supportedNetworks: t.supportedNetworks,
      pricingType: t.pricingType,
      priceAtomic: price?.amountAtomic ?? null,
      priceAsset: price?.asset ?? null,
      authorizationRequirements: t.authorizationRequirements,
      timeoutMs: t.timeoutMs,
      availabilityStatus: availability.status,
      disclosure: t.disclosure ?? null,
      updatedAt: now,
    };
    await db().insert(toolDefinition).values(values).onConflictDoUpdate({ target: toolDefinition.id, set: values });
  }
}
