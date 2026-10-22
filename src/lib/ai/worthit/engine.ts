/**
 * WorthIt Intelligence — cost-aware tool selection.
 *
 * Deterministic, documented policy (the model interprets the task; this code
 * decides what may be offered and whether a purchase can even be proposed):
 *
 *   relevance   = 1 if the tool lists the task category, else 0.5 (free tools
 *                 remain available as general utilities)
 *   reliability = Wilson lower bound of success (n ≥ 5), else unknown
 *   score       = relevance × (reliability ?? 0.5)   — unknown is labelled
 *
 *   The paid tool is offered only if ALL hold:
 *     paid tools enabled · x402 configured · not a guest · not an evaluation run
 *     relevance = 1 for this category
 *     the quoted price fits the user's limits
 *     no applicable memory says it was unnecessary for this category (unless a
 *       newer verified memory says it was useful)
 *     if ≥ 5 observations for this category: useful-rate lower bound ≥ 0.2
 *     expected benefit = usefulLB ?? 0.4 (prior, labelled) ≥ 0.25
 *
 * A more expensive tool never outranks a cheaper one by price; a previously
 * successful tool is still re-checked by verification every time.
 */
import type { MemoryDirective, ToolPlanRecord } from "@/lib/db/schema";
import type { TaskCategory } from "@/lib/ai/planning/task";
import type { ReliabilityStats } from "./reliability";
import type { ToolSpec } from "@/lib/ai/tools/types";

export interface DirectiveSignal {
  directive: MemoryDirective;
  memoryRef: string;
  toolId: string | null;
  category: string | null;
  verified: boolean;
  recordedAt: string;
}

export interface WorthItInput {
  category: TaskCategory;
  tools: ToolSpec<never>[];
  reliability: { overall: Map<string, ReliabilityStats>; byCategory: Map<string, ReliabilityStats> };
  directives: DirectiveSignal[];
  paid: {
    enabled: boolean;
    configured: boolean;
    isGuest: boolean;
    isEvaluation: boolean;
    priceFitsLimits: boolean;
    priceDescription: string | null;
  };
}

export interface ToolDecision {
  toolId: string;
  offered: boolean;
  deprioritized: boolean;
  score: number | null;
  reasons: string[];
}

export interface WorthItDecision {
  tools: ToolDecision[];
  paidToolDecision: { offered: boolean; reasons: string[] };
  directivesApplied: ToolPlanRecord["directivesApplied"];
}

const PRIOR_USEFUL = 0.4;
const MIN_EXPECTED_BENEFIT = 0.25;

function applies(d: DirectiveSignal, toolId: string, category: string): boolean {
  return (d.toolId === null || d.toolId === toolId) && (d.category === null || d.category === category);
}

export function decideTools(input: WorthItInput): WorthItDecision {
  const directivesApplied: ToolPlanRecord["directivesApplied"] = [];
  const decisions: ToolDecision[] = [];
  let paidDecision = { offered: false, reasons: [] as string[] };

  for (const tool of input.tools) {
    const reasons: string[] = [];
    const availability = tool.availability();
    const relevance = tool.categories.includes(input.category) ? 1 : 0.5;
    const catStats = input.reliability.byCategory.get(`${tool.id}|${input.category}`);
    const stats = catStats?.sufficient ? catStats : input.reliability.overall.get(tool.id);
    const reliability = stats?.sufficient ? stats.successRateLowerBound : null;
    const score = relevance * (reliability ?? 0.5);
    reasons.push(relevance === 1 ? `Relevant to ${input.category}` : "General utility for this task");
    reasons.push(
      stats?.sufficient
        ? `Success lower bound ${(reliability! * 100).toFixed(0)}% (n=${stats.sampleSize})`
        : `Insufficient history (n=${stats?.sampleSize ?? 0} < 5)`,
    );

    if (availability.status === "unconfigured" || availability.status === "disabled") {
      decisions.push({
        toolId: tool.id,
        offered: false,
        deprioritized: false,
        score: null,
        reasons: [...reasons, `Unavailable: ${availability.detail ?? availability.status}`],
      });
      if (tool.pricingType === "x402") paidDecision = { offered: false, reasons: [`Not configured: ${availability.detail ?? ""}`] };
      continue;
    }

    let deprioritized = false;
    for (const d of input.directives) {
      if (!applies(d, tool.id, input.category)) continue;
      if (d.directive === "avoid_tool_for_category") {
        deprioritized = true;
        reasons.push(`Deprioritized by memory ${d.memoryRef}`);
        directivesApplied.push({ directive: d.directive, memoryRef: d.memoryRef, effect: `${tool.id} deprioritized for ${input.category}` });
      }
      if (d.directive === "prefer_tool_for_category") {
        reasons.push(`Preferred by memory ${d.memoryRef}`);
        directivesApplied.push({ directive: d.directive, memoryRef: d.memoryRef, effect: `${tool.id} preferred for ${input.category}` });
      }
      if (d.directive === "tool_timeout_risk") {
        reasons.push(`Timeout risk noted by memory ${d.memoryRef}`);
        directivesApplied.push({ directive: d.directive, memoryRef: d.memoryRef, effect: `${tool.id} flagged as timeout-prone; prefer alternatives` });
      }
    }

    if (tool.pricingType === "x402") {
      const p = input.paid;
      const blockers: string[] = [];
      if (!p.configured) blockers.push("x402 payments not configured");
      if (!p.enabled) blockers.push("Paid tools disabled in user settings");
      if (p.isGuest) blockers.push("Guest sessions cannot pay");
      if (p.isEvaluation) blockers.push("Evaluation runs never spend funds");
      if (relevance < 1) blockers.push(`Not a specialist fit for ${input.category}`);
      if (!p.priceFitsLimits) blockers.push(`Quoted price ${p.priceDescription ?? ""} exceeds the user's limits`);

      const unnecessary = input.directives.filter((d) => d.directive === "paid_tool_unnecessary_for_category" && applies(d, tool.id, input.category));
      const useful = input.directives.filter((d) => d.directive === "paid_tool_useful_for_category" && applies(d, tool.id, input.category));
      const newest = (ds: DirectiveSignal[]) => ds.reduce<DirectiveSignal | null>((a, d) => (!a || d.recordedAt > a.recordedAt ? d : a), null);
      const nu = newest(unnecessary);
      const ny = newest(useful);
      if (nu && (!ny || nu.recordedAt > ny.recordedAt)) {
        blockers.push(`Memory ${nu.memoryRef}: paid analysis previously added no verified value for ${input.category}`);
        directivesApplied.push({ directive: nu.directive, memoryRef: nu.memoryRef, effect: "Paid analysis not offered for this category" });
      } else if (ny) {
        reasons.push(`Memory ${ny.memoryRef}: paid analysis produced verified value for ${input.category}`);
        directivesApplied.push({ directive: ny.directive, memoryRef: ny.memoryRef, effect: "Paid analysis kept on the table" });
      }

      const usefulLB = catStats?.sufficient ? catStats.usefulRateLowerBound : null;
      if (usefulLB !== null && usefulLB < 0.2)
        blockers.push(`Measured usefulness lower bound ${(usefulLB * 100).toFixed(0)}% < 20% (n=${catStats!.sampleSize})`);
      const expected = (usefulLB ?? PRIOR_USEFUL) * relevance;
      if (expected < MIN_EXPECTED_BENEFIT) blockers.push(`Expected benefit ${expected.toFixed(2)} below ${MIN_EXPECTED_BENEFIT}`);
      reasons.push(
        usefulLB === null ? `Expected benefit ${expected.toFixed(2)} (prior — insufficient history)` : `Expected benefit ${expected.toFixed(2)} (measured)`,
      );

      const offered = blockers.length === 0;
      paidDecision = { offered, reasons: offered ? reasons : blockers };
      decisions.push({ toolId: tool.id, offered, deprioritized: false, score: offered ? score : null, reasons: offered ? reasons : [...reasons, ...blockers] });
      continue;
    }

    decisions.push({ toolId: tool.id, offered: true, deprioritized, score: deprioritized ? score * 0.5 : score, reasons });
  }

  decisions.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  return { tools: decisions, paidToolDecision: paidDecision, directivesApplied };
}
