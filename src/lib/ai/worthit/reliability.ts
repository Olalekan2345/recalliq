/**
 * Tool reliability from real observations only.
 *
 * Method (documented in the UI):
 *  - sample = production tool executions (evaluation runs excluded)
 *  - success = execution completed without error/timeout
 *  - useful  = output cited by at least one VERIFIED claim
 *  - rates are reported as the Wilson score lower bound (95%), and only when
 *    n ≥ MIN_SAMPLE; below that the UI shows "insufficient data".
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { toolPerformanceObservation } from "@/lib/db/schema";

export const MIN_SAMPLE = 5;

export function wilsonLowerBound(successes: number, n: number, z = 1.96): number | null {
  if (n <= 0) return null;
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return Math.max(0, (centre - margin) / denom);
}

export function percentile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[idx]!;
}

export interface ReliabilityStats {
  toolId: string;
  taskCategory: string | null;
  sampleSize: number;
  successCount: number;
  usefulCount: number;
  contradictedCount: number;
  failureCount: number;
  successRateLowerBound: number | null;
  usefulRateLowerBound: number | null;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  sufficient: boolean;
}

export function computeStats(
  toolId: string,
  taskCategory: string | null,
  rows: Array<{ executionStatus: string; outcome: string; verificationStatus: string; latencyMs: number | null }>,
): ReliabilityStats {
  const n = rows.length;
  const success = rows.filter((r) => r.executionStatus === "success").length;
  const useful = rows.filter((r) => r.outcome === "useful").length;
  const contradicted = rows.filter((r) => r.verificationStatus === "contradicted").length;
  const latencies = rows
    .map((r) => r.latencyMs)
    .filter((v): v is number => typeof v === "number")
    .sort((a, b) => a - b);
  const sufficient = n >= MIN_SAMPLE;
  return {
    toolId,
    taskCategory,
    sampleSize: n,
    successCount: success,
    usefulCount: useful,
    contradictedCount: contradicted,
    failureCount: n - success,
    successRateLowerBound: sufficient ? wilsonLowerBound(success, n) : null,
    usefulRateLowerBound: sufficient ? wilsonLowerBound(useful, n) : null,
    p50LatencyMs: percentile(latencies, 0.5),
    p95LatencyMs: percentile(latencies, 0.95),
    sufficient,
  };
}

/** Stats per tool (overall) and per tool×category, from the last `days` of production data. */
export async function loadReliability(days = 60): Promise<{ overall: Map<string, ReliabilityStats>; byCategory: Map<string, ReliabilityStats> }> {
  const rows = await db()
    .select({
      toolId: toolPerformanceObservation.toolId,
      taskCategory: toolPerformanceObservation.taskCategory,
      executionStatus: toolPerformanceObservation.executionStatus,
      outcome: toolPerformanceObservation.outcome,
      verificationStatus: toolPerformanceObservation.verificationStatus,
      latencyMs: toolPerformanceObservation.latencyMs,
    })
    .from(toolPerformanceObservation)
    .where(and(eq(toolPerformanceObservation.isEvaluation, false), sql`${toolPerformanceObservation.recordedAt} > now() - make_interval(days => ${days})`));

  const byTool = new Map<string, typeof rows>();
  const byToolCat = new Map<string, typeof rows>();
  for (const r of rows) {
    byTool.set(r.toolId, [...(byTool.get(r.toolId) ?? []), r]);
    const key = `${r.toolId}|${r.taskCategory ?? "-"}`;
    byToolCat.set(key, [...(byToolCat.get(key) ?? []), r]);
  }
  const overall = new Map<string, ReliabilityStats>();
  for (const [toolId, rs] of byTool) overall.set(toolId, computeStats(toolId, null, rs));
  const byCategory = new Map<string, ReliabilityStats>();
  for (const [key, rs] of byToolCat) {
    const [toolId, cat] = key.split("|");
    byCategory.set(key, computeStats(toolId!, cat === "-" ? null : cat!, rs));
  }
  return { overall, byCategory };
}
