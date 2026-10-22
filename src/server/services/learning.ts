/**
 * Learning Lab read model — only recorded, real executions.
 *
 *  - evaluation runs (paired baseline vs memory) with their results
 *  - influence traces: failure → verified correction → Walrus write → stored
 *    → later recall → changed decision → verified new outcome
 *  - production before/after: error categories over time and whether they recur
 *    after a lesson was stored
 */
import { and, asc, desc, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { agentFailure, agentRun, evaluationResult, evaluationRun, learningMemory, memoryUsage, verificationResult } from "@/lib/db/schema";

export async function listEvaluations(userId: string) {
  const runs = await db().select().from(evaluationRun).where(eq(evaluationRun.userId, userId)).orderBy(desc(evaluationRun.createdAt)).limit(50);
  const ids = runs.map((r) => r.id);
  const results = ids.length ? await db().select().from(evaluationResult).where(inArray(evaluationResult.evaluationRunId, ids)) : [];
  return runs.map((r) => ({
    ...r,
    results: results.filter((x) => x.evaluationRunId === r.id).sort((a, b) => a.taskIndex - b.taskIndex || a.mode.localeCompare(b.mode)),
  }));
}

export async function getEvaluation(userId: string, id: string) {
  const [r] = await db()
    .select()
    .from(evaluationRun)
    .where(and(eq(evaluationRun.id, id), eq(evaluationRun.userId, userId)))
    .limit(1);
  if (!r) return null;
  const results = await db().select().from(evaluationResult).where(eq(evaluationResult.evaluationRunId, id)).orderBy(asc(evaluationResult.taskIndex));
  return { ...r, results };
}

/** Complete learning traces for this user's memories that were applied in later runs. */
export async function influenceTraces(userId: string) {
  const memories = await db()
    .select()
    .from(learningMemory)
    .where(and(eq(learningMemory.userId, userId), eq(learningMemory.isEvaluation, false), isNotNull(learningMemory.sourceRunId)))
    .orderBy(desc(learningMemory.createdAt))
    .limit(50);
  if (memories.length === 0) return [];
  const ids = memories.map((m) => m.id);
  const failureIds = memories.map((m) => m.sourceFailureId).filter((x): x is string => Boolean(x));
  const failures = failureIds.length ? await db().select().from(agentFailure).where(inArray(agentFailure.id, failureIds)) : [];
  const usages = await db()
    .select({
      usage: memoryUsage,
      run: {
        id: agentRun.id,
        task: agentRun.task,
        status: agentRun.status,
        createdAt: agentRun.createdAt,
        investigationId: agentRun.investigationId,
        isEvaluation: agentRun.isEvaluation,
      },
    })
    .from(memoryUsage)
    .innerJoin(agentRun, eq(memoryUsage.runId, agentRun.id))
    .where(and(inArray(memoryUsage.memoryId, ids), eq(memoryUsage.userId, userId)))
    .orderBy(asc(memoryUsage.retrievedAt));
  const laterRunIds = [...new Set(usages.map((u) => u.run.id))];
  const outcomes = laterRunIds.length
    ? await db()
        .select({ runId: verificationResult.runId, status: verificationResult.status, n: sql<number>`count(*)::int` })
        .from(verificationResult)
        .where(inArray(verificationResult.runId, laterRunIds))
        .groupBy(verificationResult.runId, verificationResult.status)
    : [];
  return memories.map((m) => {
    const u = usages.filter((x) => x.usage.memoryId === m.id);
    return {
      memory: m,
      failure: failures.find((f) => f.id === m.sourceFailureId) ?? null,
      usages: u.map((x) => ({
        ...x,
        outcome: outcomes.filter((o) => o.runId === x.run.id),
      })),
    };
  });
}

/** Failure categories over time: did a category recur after a lesson for it was stored? */
export async function recurrence(userId: string) {
  const failures = await db()
    .select({ category: agentFailure.category, createdAt: agentFailure.createdAt, runId: agentFailure.runId })
    .from(agentFailure)
    .where(and(eq(agentFailure.userId, userId), eq(agentFailure.isEvaluation, false)))
    .orderBy(asc(agentFailure.createdAt));
  const lessons = await db()
    .select({ directive: learningMemory.directive, storedAt: learningMemory.storedAt, failureId: learningMemory.sourceFailureId })
    .from(learningMemory)
    .where(and(eq(learningMemory.userId, userId), eq(learningMemory.storageStatus, "stored"), eq(learningMemory.isEvaluation, false)));
  const failureById = failureIdsToCategory(
    await db().select({ id: agentFailure.id, category: agentFailure.category }).from(agentFailure).where(eq(agentFailure.userId, userId)),
  );
  const firstLessonAt = new Map<string, Date>();
  for (const l of lessons) {
    const cat = l.failureId ? failureById.get(l.failureId) : undefined;
    if (!cat || !l.storedAt) continue;
    const prev = firstLessonAt.get(cat);
    if (!prev || l.storedAt < prev) firstLessonAt.set(cat, l.storedAt);
  }
  const categories = [...new Set(failures.map((f) => f.category))];
  return categories.map((category) => {
    const all = failures.filter((f) => f.category === category);
    const lessonAt = firstLessonAt.get(category) ?? null;
    return {
      category,
      total: all.length,
      lessonStoredAt: lessonAt,
      before: lessonAt ? all.filter((f) => f.createdAt < lessonAt).length : all.length,
      after: lessonAt ? all.filter((f) => f.createdAt >= lessonAt).length : null,
    };
  });
}

function failureIdsToCategory(rows: Array<{ id: string; category: string }>) {
  return new Map(rows.map((r) => [r.id, r.category]));
}

/** Production run counts by memory mode in the last 90 days (for context; not a controlled comparison). */
export async function productionRunStats(userId: string) {
  return db()
    .select({
      memoryMode: agentRun.memoryMode,
      runs: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where ${agentRun.status} = 'COMPLETED')::int`,
    })
    .from(agentRun)
    .where(and(eq(agentRun.userId, userId), eq(agentRun.isEvaluation, false), gt(agentRun.createdAt, new Date(Date.now() - 90 * 86_400_000))))
    .groupBy(agentRun.memoryMode);
}
