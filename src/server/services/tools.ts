/**
 * Tool Intelligence read model: registry + measured performance. Aggregates
 * contain counts and latencies only (no user data). Spending is per user.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { learningMemory, paymentIntent, toolDefinition, toolPerformanceObservation } from "@/lib/db/schema";
import { chain } from "@/lib/blockchain/tatum/client";
import { formatAtomic } from "@/lib/blockchain/sui/amounts";
import { ALL_TOOLS, configuredPrice } from "@/lib/ai/tools/registry";
import { computeStats, loadReliability, MIN_SAMPLE } from "@/lib/ai/worthit/reliability";

export async function listToolsWithStats(userId: string) {
  const defs = await db().select().from(toolDefinition);
  const defById = new Map(defs.map((d) => [d.id, d]));
  const { overall, byCategory } = await loadReliability(90);
  const spend = await db()
    .select({
      toolId: paymentIntent.toolId,
      asset: paymentIntent.asset,
      total: sql<string>`coalesce(sum(${paymentIntent.amountAtomic}), 0)::text`,
      n: sql<number>`count(*)::int`,
    })
    .from(paymentIntent)
    .where(and(eq(paymentIntent.userId, userId), eq(paymentIntent.status, "settled")))
    .groupBy(paymentIntent.toolId, paymentIntent.asset);
  const lessons = await db()
    .select({ toolId: learningMemory.relatedToolId, n: sql<number>`count(*)::int` })
    .from(learningMemory)
    .where(and(eq(learningMemory.status, "active"), eq(learningMemory.isEvaluation, false)))
    .groupBy(learningMemory.relatedToolId);
  const priceDisplay = new Map<string, string>();
  for (const t of ALL_TOOLS) {
    const price = configuredPrice(t.id);
    if (!price) continue;
    try {
      const ci = await chain().getCoinInfo(price.asset);
      priceDisplay.set(
        t.id,
        ci.data.decimals !== null
          ? `${formatAtomic(price.amountAtomic, ci.data.decimals)} ${ci.data.symbol ?? ""}`.trim()
          : `${price.amountAtomic} atomic units`,
      );
    } catch {
      priceDisplay.set(t.id, `${price.amountAtomic} atomic units`);
    }
  }
  return ALL_TOOLS.map((t) => {
    const def = defById.get(t.id);
    const price = configuredPrice(t.id);
    return {
      priceDisplay: priceDisplay.get(t.id) ?? null,
      id: t.id,
      name: t.name,
      summary: t.summary,
      provider: t.provider,
      operator: t.operator,
      capabilities: t.capabilities,
      categories: t.categories,
      supportedNetworks: t.supportedNetworks,
      pricingType: t.pricingType,
      price,
      availability: t.availability(),
      disclosure: t.disclosure ?? null,
      registeredAt: def?.updatedAt ?? null,
      stats: overall.get(t.id) ?? computeStats(t.id, null, []),
      byCategory: [...byCategory.values()].filter((s) => s.toolId === t.id),
      spend: spend.filter((s) => s.toolId === t.id),
      lessonCount: lessons.find((l) => l.toolId === t.id)?.n ?? 0,
    };
  });
}

export async function toolRecentObservations(toolId: string, limit = 50) {
  return db()
    .select({
      recordedAt: toolPerformanceObservation.recordedAt,
      taskCategory: toolPerformanceObservation.taskCategory,
      executionStatus: toolPerformanceObservation.executionStatus,
      verificationStatus: toolPerformanceObservation.verificationStatus,
      outcome: toolPerformanceObservation.outcome,
      latencyMs: toolPerformanceObservation.latencyMs,
      settledAmountAtomic: toolPerformanceObservation.settledAmountAtomic,
      paymentDigest: toolPerformanceObservation.paymentDigest,
    })
    .from(toolPerformanceObservation)
    .where(and(eq(toolPerformanceObservation.toolId, toolId), eq(toolPerformanceObservation.isEvaluation, false)))
    .orderBy(desc(toolPerformanceObservation.recordedAt))
    .limit(limit);
}

export async function toolLessons(userId: string, toolId: string) {
  return db()
    .select({
      id: learningMemory.id,
      summary: learningMemory.summary,
      memoryType: learningMemory.memoryType,
      storageStatus: learningMemory.storageStatus,
      walrusBlobId: learningMemory.walrusBlobId,
      createdAt: learningMemory.createdAt,
      scope: learningMemory.scope,
    })
    .from(learningMemory)
    .where(
      and(
        eq(learningMemory.relatedToolId, toolId),
        eq(learningMemory.status, "active"),
        sql`(${learningMemory.userId} = ${userId} or ${learningMemory.scope} = 'platform')`,
      ),
    )
    .orderBy(desc(learningMemory.createdAt))
    .limit(20);
}

export { MIN_SAMPLE };
