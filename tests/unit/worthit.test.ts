import { describe, expect, it } from "vitest";
import { computeStats, MIN_SAMPLE, percentile, wilsonLowerBound } from "@/lib/ai/worthit/reliability";
import { decideTools, type DirectiveSignal, type WorthItInput } from "@/lib/ai/worthit/engine";
import { ALL_TOOLS, PAID_FORENSICS_TOOL_ID } from "@/lib/ai/tools/registry";
import type { ToolSpec } from "@/lib/ai/tools/types";

describe("reliability statistics", () => {
  it("computes the Wilson lower bound", () => {
    expect(wilsonLowerBound(0, 0)).toBeNull();
    expect(wilsonLowerBound(10, 10)!).toBeCloseTo(0.7225, 3);
    expect(wilsonLowerBound(5, 10)!).toBeCloseTo(0.2366, 3);
  });

  it("refuses to estimate below the minimum sample size", () => {
    const rows = Array.from({ length: MIN_SAMPLE - 1 }, () => ({
      executionStatus: "success",
      outcome: "useful",
      verificationStatus: "verified",
      latencyMs: 100,
    }));
    const s = computeStats("t", null, rows);
    expect(s.sufficient).toBe(false);
    expect(s.successRateLowerBound).toBeNull();
    expect(s.sampleSize).toBe(MIN_SAMPLE - 1);
  });

  it("estimates once enough observations exist", () => {
    const rows = [
      ...Array.from({ length: 8 }, () => ({ executionStatus: "success", outcome: "useful", verificationStatus: "verified", latencyMs: 200 })),
      ...Array.from({ length: 2 }, () => ({ executionStatus: "timeout", outcome: "failed", verificationStatus: "not_cited", latencyMs: 25000 })),
    ];
    const s = computeStats("t", "x", rows);
    expect(s.sufficient).toBe(true);
    expect(s.failureCount).toBe(2);
    expect(s.successRateLowerBound!).toBeLessThan(0.8);
    expect(s.p95LatencyMs).toBe(25000);
  });

  it("percentile handles empty input", () => {
    expect(percentile([], 0.5)).toBeNull();
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2);
  });
});

// Availability is environment dependent; pin it for deterministic policy tests.
const tools = ALL_TOOLS.map((t) => ({ ...t, availability: () => ({ status: "available" as const }) })) as ToolSpec<never>[];

function input(over: Partial<WorthItInput> = {}, paid: Partial<WorthItInput["paid"]> = {}): WorthItInput {
  return {
    category: "wallet_activity",
    tools,
    reliability: { overall: new Map(), byCategory: new Map() },
    directives: [],
    paid: { enabled: true, configured: true, isGuest: false, isEvaluation: false, priceFitsLimits: true, priceDescription: "0.01 SUI", ...paid },
    ...over,
  };
}

const d = (directive: DirectiveSignal["directive"], recordedAt: string, extra: Partial<DirectiveSignal> = {}): DirectiveSignal => ({
  directive,
  memoryRef: "M1",
  toolId: PAID_FORENSICS_TOOL_ID,
  category: "wallet_activity",
  verified: true,
  recordedAt,
  ...extra,
});

describe("WorthIt decisions", () => {
  it("offers the paid tool for a relevant category with no history (labelled prior)", () => {
    const r = decideTools(input());
    expect(r.paidToolDecision.offered).toBe(true);
    expect(r.paidToolDecision.reasons.join(" ")).toContain("insufficient history");
  });

  it("never offers paid tools to guests, evaluations, disabled users or over-budget quotes", () => {
    expect(decideTools(input({}, { isGuest: true })).paidToolDecision.offered).toBe(false);
    expect(decideTools(input({}, { isEvaluation: true })).paidToolDecision.offered).toBe(false);
    expect(decideTools(input({}, { enabled: false })).paidToolDecision.offered).toBe(false);
    expect(decideTools(input({}, { priceFitsLimits: false })).paidToolDecision.offered).toBe(false);
  });

  it("does not offer the paid tool where it is not a specialist fit", () => {
    expect(decideTools(input({ category: "transaction_verification" })).paidToolDecision.offered).toBe(false);
  });

  it("a memory that paid analysis was unnecessary changes the decision", () => {
    const r = decideTools(input({ directives: [d("paid_tool_unnecessary_for_category", "2026-10-20T00:00:00Z")] }));
    expect(r.paidToolDecision.offered).toBe(false);
    expect(r.directivesApplied).toEqual([expect.objectContaining({ memoryRef: "M1", effect: "Paid analysis not offered for this category" })]);
  });

  it("a newer 'useful' memory overrides an older 'unnecessary' one", () => {
    const r = decideTools(
      input({
        directives: [
          d("paid_tool_unnecessary_for_category", "2026-10-01T00:00:00Z"),
          d("paid_tool_useful_for_category", "2026-10-15T00:00:00Z", { memoryRef: "M2" }),
        ],
      }),
    );
    expect(r.paidToolDecision.offered).toBe(true);
  });

  it("measured low usefulness blocks the paid tool", () => {
    const rows = Array.from({ length: 10 }, () => ({ executionStatus: "success", outcome: "not_useful", verificationStatus: "not_cited", latencyMs: 100 }));
    const stats = computeStats(PAID_FORENSICS_TOOL_ID, "wallet_activity", rows);
    const r = decideTools(input({ reliability: { overall: new Map(), byCategory: new Map([[`${PAID_FORENSICS_TOOL_ID}|wallet_activity`, stats]]) } }));
    expect(r.paidToolDecision.offered).toBe(false);
    expect(r.paidToolDecision.reasons.join(" ")).toContain("usefulness lower bound");
  });

  it("an avoid directive deprioritizes a free tool but keeps it available", () => {
    const r = decideTools(input({ directives: [d("avoid_tool_for_category", "2026-10-20T00:00:00Z", { toolId: "tatum_wallet_inspector" })] }));
    const w = r.tools.find((t) => t.toolId === "tatum_wallet_inspector")!;
    expect(w.offered).toBe(true);
    expect(w.deprioritized).toBe(true);
  });

  it("price never raises a tool's rank", () => {
    const r = decideTools(input());
    const paid = r.tools.find((t) => t.toolId === PAID_FORENSICS_TOOL_ID)!;
    const free = r.tools.find((t) => t.toolId === "tatum_wallet_inspector")!;
    expect(paid.score).toBe(free.score);
  });
});
