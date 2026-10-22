import type { z } from "zod";
import type { ChainClient, Provenance } from "@/lib/blockchain/tatum/client";
import type { TaskCategory } from "@/lib/ai/planning/task";

export interface EvidenceInput {
  kind:
    | "transaction"
    | "checkpoint"
    | "network_state"
    | "balances"
    | "balance"
    | "owned_objects"
    | "object"
    | "address_transactions"
    | "package"
    | "name"
    | "coin_info"
    | "paid_analysis";
  reference: string;
  checkpoint?: string | null;
  data: unknown;
}

export interface ToolContext {
  run: {
    id: string;
    userId: string;
    taskCategory: TaskCategory;
    isEvaluation: boolean;
  };
  chain: ChainClient;
  signal: AbortSignal;
  /** Persist an evidence record with provenance; returns its run-local ref ("E3"). */
  addEvidence(e: EvidenceInput, provenance: Provenance | { provider: string; method: string; network: string }): Promise<string>;
}

export type ToolAvailability = { status: "available" | "unconfigured" | "degraded" | "disabled"; detail?: string };

export interface ToolSpec<I = unknown> {
  id: string;
  name: string;
  /** Model-facing description. */
  description: string;
  /** Human-facing one-liner for the UI. */
  summary: string;
  provider: string;
  operator: string;
  capabilities: string[];
  /** Task categories where the tool is directly relevant (WorthIt relevance = 1). */
  categories: TaskCategory[];
  supportedNetworks: string[];
  pricingType: "free" | "x402";
  timeoutMs: number;
  authorizationRequirements: string;
  disclosure?: string;
  inputSchema: z.ZodType<I>;
  availability(): ToolAvailability;
  /** Free tools execute here. The paid tool is handled by the orchestrator's payment flow. */
  run?(input: I, ctx: ToolContext): Promise<unknown>;
}
