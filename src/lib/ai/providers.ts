/**
 * LLM provider resolution (Vercel AI SDK) and cost accounting.
 *
 * Cost is reported only when pricing is verified: the Anthropic table below
 * mirrors Anthropic's published per-token prices (snapshot 2026-10-06); other
 * providers report a cost only if the operator configures
 * LLM_PRICE_INPUT_USD_PER_MTOK / LLM_PRICE_OUTPUT_USD_PER_MTOK. Otherwise the
 * cost is "unknown" — never estimated.
 */
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { env } from "@/lib/env";

export type ProviderId = "anthropic" | "openai" | "groq" | "google";

/** Only the Anthropic default is pinned; other providers must name LLM_MODEL explicitly. */
const DEFAULT_MODEL: Partial<Record<ProviderId, string>> = {
  anthropic: "claude-opus-5-5",
};

interface Pricing {
  inputUsdPerMTok: number;
  outputUsdPerMTok: number;
  source: string;
}

/** Anthropic first-party API list prices, USD per million tokens. */
const ANTHROPIC_PRICING: Record<string, { in: number; out: number }> = {
  "claude-fable-5-1": { in: 10, out: 50 },
  "claude-fable-5": { in: 10, out: 50 },
  "claude-opus-5-5": { in: 4, out: 20 },
  "claude-opus-5": { in: 5, out: 25 },
  "claude-opus-4-8": { in: 5, out: 25 },
  "claude-opus-4-7": { in: 5, out: 25 },
  "claude-opus-4-6": { in: 5, out: 25 },
  "claude-sonnet-5-5": { in: 2, out: 10 },
  "claude-sonnet-5": { in: 2, out: 10 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-haiku-5-5": { in: 0.1, out: 0.5 },
  "claude-haiku-4-5": { in: 1, out: 5 },
};

export interface ResolvedModel {
  configured: boolean;
  provider: ProviderId;
  modelId: string;
  model: LanguageModel | null;
  pricing: Pricing | null;
  reason?: string;
}

function apiKeyFor(provider: ProviderId): string | undefined {
  const e = env();
  if (e.LLM_API_KEY) return e.LLM_API_KEY;
  switch (provider) {
    case "anthropic":
      return e.ANTHROPIC_API_KEY;
    case "openai":
      return e.OPENAI_API_KEY;
    case "groq":
      return e.GROQ_API_KEY;
    case "google":
      return e.GOOGLE_GENERATIVE_AI_API_KEY;
  }
}

export function pricingFor(provider: ProviderId, modelId: string): Pricing | null {
  const e = env();
  if (e.LLM_PRICE_INPUT_USD_PER_MTOK && e.LLM_PRICE_OUTPUT_USD_PER_MTOK) {
    return { inputUsdPerMTok: e.LLM_PRICE_INPUT_USD_PER_MTOK, outputUsdPerMTok: e.LLM_PRICE_OUTPUT_USD_PER_MTOK, source: "operator-configured" };
  }
  if (provider === "anthropic") {
    const p = ANTHROPIC_PRICING[modelId];
    if (p) return { inputUsdPerMTok: p.in, outputUsdPerMTok: p.out, source: "anthropic-list-price-2026-10-06" };
  }
  return null;
}

const g = globalThis as unknown as { __recalliqModelOverride?: ResolvedModel };

/** Tests only: route the orchestrator to a scripted mock model. */
export function setModelOverride(model: ResolvedModel | undefined): void {
  g.__recalliqModelOverride = model;
}

export function resolveModel(): ResolvedModel {
  if (g.__recalliqModelOverride) return g.__recalliqModelOverride;
  const e = env();
  const provider = e.LLM_PROVIDER;
  const modelId = e.LLM_MODEL ?? DEFAULT_MODEL[provider];
  if (!modelId) {
    return { configured: false, provider, modelId: "", model: null, pricing: null, reason: `Set LLM_MODEL for provider "${provider}"` };
  }
  const apiKey = apiKeyFor(provider);
  const pricing = pricingFor(provider, modelId);
  if (!apiKey) {
    return { configured: false, provider, modelId, model: null, pricing, reason: `No API key configured for provider "${provider}"` };
  }
  let model: LanguageModel;
  switch (provider) {
    case "anthropic":
      model = createAnthropic({ apiKey })(modelId);
      break;
    case "openai":
      model = createOpenAI({ apiKey })(modelId);
      break;
    case "groq":
      model = createGroq({ apiKey })(modelId);
      break;
    case "google":
      model = createGoogleGenerativeAI({ apiKey })(modelId);
      break;
  }
  return { configured: true, provider, modelId, model, pricing };
}

/** Provider-specific options. Anthropic: adaptive effort per depth + server-side refusal fallback. */
export function providerOptionsFor(provider: ProviderId, depth: "standard" | "deep") {
  if (provider === "anthropic") {
    return { anthropic: { effort: depth === "deep" ? "high" : "medium", fallbacks: "default" } } as const;
  }
  return undefined;
}

/** Micro-USD cost from token usage, or null when pricing is not verified. */
export function costMicroUsd(pricing: Pricing | null, inputTokens: number, outputTokens: number): bigint | null {
  if (!pricing) return null;
  // $/MTok × tokens = micro-dollars.
  return BigInt(Math.round(inputTokens * pricing.inputUsdPerMTok + outputTokens * pricing.outputUsdPerMTok));
}
