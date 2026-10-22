/**
 * Memory Vault read/write models. A user sees their own memories plus the
 * platform's generic tool lessons (which never contain user data).
 *
 * Deletion: Walrus storage is append-only and MemWal offers no delete. RecallIQ
 * can only retract a memory from future recall (it stays on Walrus, encrypted).
 */
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { agentFailure, agentRun, learningMemory, memoryCorrection, memoryUsage, verificationResult } from "@/lib/db/schema";
import { newId } from "@/lib/security/ids";
import { MEMORY_TYPES } from "@/lib/memory/codec";
import { proposeLesson } from "@/lib/memory/service";

export const memoryFilterSchema = z.object({
  q: z.string().trim().max(200).optional(),
  type: z.enum(MEMORY_TYPES as unknown as [string, ...string[]]).optional(),
  status: z.enum(["active", "superseded", "flagged", "retracted"]).optional(),
  storage: z.enum(["queued", "submitting", "pending", "stored", "failed"]).optional(),
  scope: z.enum(["user", "platform", "all"]).default("all"),
});

function visibleTo(userId: string): SQL {
  return or(eq(learningMemory.userId, userId), and(eq(learningMemory.scope, "platform"), isNull(learningMemory.userId)))!;
}

export async function listMemories(userId: string, f: z.infer<typeof memoryFilterSchema>) {
  const conds: SQL[] = [visibleTo(userId), eq(learningMemory.isEvaluation, false)];
  if (f.scope === "user") conds.push(eq(learningMemory.userId, userId));
  if (f.scope === "platform") conds.push(eq(learningMemory.scope, "platform"));
  if (f.type) conds.push(eq(learningMemory.memoryType, f.type as never));
  if (f.status) conds.push(eq(learningMemory.status, f.status));
  if (f.storage) conds.push(eq(learningMemory.storageStatus, f.storage));
  if (f.q) {
    const like = `%${f.q.replace(/[%_]/g, "")}%`;
    conds.push(or(ilike(learningMemory.summary, like), ilike(learningMemory.lesson, like), ilike(learningMemory.walrusBlobId, like))!);
  }
  const rows = await db()
    .select()
    .from(learningMemory)
    .where(and(...conds))
    .orderBy(desc(learningMemory.createdAt))
    .limit(200);
  const ids = rows.map((r) => r.id);
  const usage = ids.length
    ? await db()
        .select({
          memoryId: memoryUsage.memoryId,
          applied: sql<number>`count(*) filter (where ${memoryUsage.disposition} = 'applied')::int`,
          retrieved: sql<number>`count(*)::int`,
        })
        .from(memoryUsage)
        .where(and(inArray(memoryUsage.memoryId, ids), eq(memoryUsage.userId, userId)))
        .groupBy(memoryUsage.memoryId)
    : [];
  const byId = new Map(usage.map((u) => [u.memoryId, u]));
  return rows.map(({ content, idempotencyKey, ...m }) => {
    void content;
    void idempotencyKey;
    return { ...m, retrievedCount: byId.get(m.id)?.retrieved ?? 0, appliedCount: byId.get(m.id)?.applied ?? 0 };
  });
}

export async function memoryCounts(userId: string) {
  const rows = await db()
    .select({ storageStatus: learningMemory.storageStatus, n: sql<number>`count(*)::int` })
    .from(learningMemory)
    .where(and(eq(learningMemory.userId, userId), eq(learningMemory.isEvaluation, false)))
    .groupBy(learningMemory.storageStatus);
  return Object.fromEntries(rows.map((r) => [r.storageStatus, r.n])) as Partial<Record<string, number>>;
}

/** Full provenance & influence trace for one memory. */
export async function getMemoryTrace(userId: string, memoryId: string) {
  const [m] = await db()
    .select()
    .from(learningMemory)
    .where(and(eq(learningMemory.id, memoryId), visibleTo(userId)))
    .limit(1);
  if (!m) return null;
  const isOwn = m.userId === userId;
  const [sourceRun] =
    isOwn && m.sourceRunId
      ? await db()
          .select({
            id: agentRun.id,
            task: agentRun.task,
            status: agentRun.status,
            createdAt: agentRun.createdAt,
            investigationId: agentRun.investigationId,
            taskCategory: agentRun.taskCategory,
          })
          .from(agentRun)
          .where(and(eq(agentRun.id, m.sourceRunId), eq(agentRun.userId, userId)))
          .limit(1)
      : [];
  const [failure] = isOwn && m.sourceFailureId ? await db().select().from(agentFailure).where(eq(agentFailure.id, m.sourceFailureId)).limit(1) : [];
  const [verification] = failure?.verificationResultId
    ? await db().select().from(verificationResult).where(eq(verificationResult.id, failure.verificationResultId)).limit(1)
    : [];
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
        memoryMode: agentRun.memoryMode,
      },
    })
    .from(memoryUsage)
    .innerJoin(agentRun, eq(memoryUsage.runId, agentRun.id))
    .where(and(eq(memoryUsage.memoryId, memoryId), eq(memoryUsage.userId, userId)))
    .orderBy(asc(memoryUsage.retrievedAt));
  const laterRunIds = usages.filter((u) => u.usage.disposition === "applied").map((u) => u.run.id);
  const laterVerification = laterRunIds.length
    ? await db()
        .select({ runId: verificationResult.runId, status: verificationResult.status, n: sql<number>`count(*)::int` })
        .from(verificationResult)
        .where(inArray(verificationResult.runId, laterRunIds))
        .groupBy(verificationResult.runId, verificationResult.status)
    : [];
  const corrections = await db().select().from(memoryCorrection).where(eq(memoryCorrection.memoryId, memoryId)).orderBy(asc(memoryCorrection.createdAt));
  const [supersedes] = m.supersedesMemoryId
    ? await db()
        .select({ id: learningMemory.id, summary: learningMemory.summary })
        .from(learningMemory)
        .where(eq(learningMemory.id, m.supersedesMemoryId))
        .limit(1)
    : [];
  const [supersededBy] = m.supersededById
    ? await db().select({ id: learningMemory.id, summary: learningMemory.summary }).from(learningMemory).where(eq(learningMemory.id, m.supersededById)).limit(1)
    : [];
  return {
    memory: m,
    isOwn,
    sourceRun: sourceRun ?? null,
    failure: failure ?? null,
    verification: verification ?? null,
    usages,
    laterVerification,
    corrections,
    supersedes: supersedes ?? null,
    supersededBy: supersededBy ?? null,
  };
}

export const memoryActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("flag"), note: z.string().trim().min(3).max(1000), evidence: z.string().trim().max(500).optional() }),
  z.object({
    action: z.literal("supersede"),
    note: z.string().trim().min(3).max(1000),
    correctedLesson: z.string().trim().min(20).max(800),
  }),
  z.object({ action: z.literal("retract"), note: z.string().trim().max(1000).optional() }),
]);

export async function applyMemoryAction(userId: string, memoryId: string, input: z.infer<typeof memoryActionSchema>) {
  const [m] = await db()
    .select()
    .from(learningMemory)
    .where(and(eq(learningMemory.id, memoryId), eq(learningMemory.userId, userId)))
    .limit(1);
  if (!m) return null;
  if (input.action === "flag") {
    await db()
      .update(learningMemory)
      .set({ status: "flagged", flaggedReason: input.note.slice(0, 300) })
      .where(eq(learningMemory.id, memoryId));
    await db()
      .insert(memoryCorrection)
      .values({
        id: newId(),
        memoryId,
        userId,
        note: input.note,
        evidence: input.evidence ?? null,
        verificationStatus: "unverified",
        verificationDetail: "User flag — excluded from future recall; not independently verified.",
      });
    return { status: "flagged" };
  }
  if (input.action === "retract") {
    await db()
      .update(learningMemory)
      .set({ status: "retracted", flaggedReason: input.note?.slice(0, 300) ?? "Retracted by user" })
      .where(eq(learningMemory.id, memoryId));
    await db()
      .insert(memoryCorrection)
      .values({
        id: newId(),
        memoryId,
        userId,
        note: input.note ?? "Retracted",
        verificationStatus: "unverified",
        verificationDetail: "Retracted from recall. The encrypted blob remains on Walrus (append-only storage).",
      });
    return { status: "retracted" };
  }
  const res = await proposeLesson({
    userId,
    scope: "user",
    memoryType: "correction",
    taskCategory: m.taskCategory,
    relatedToolId: m.relatedToolId,
    directive: null,
    summary: `Correction of: ${m.summary}`.slice(0, 200),
    lesson: input.correctedLesson,
    evidenceText: `User correction of memory ${m.id}: ${input.note.slice(0, 300)}`,
    evidenceReferences: [{ kind: "evidence", id: m.id, label: "superseded memory" }],
    verificationStatus: "user_reported",
    sourceRunId: null,
    sourceFailureId: null,
    supersedesMemoryId: m.id,
  });
  await db()
    .insert(memoryCorrection)
    .values({
      id: newId(),
      memoryId,
      userId,
      note: input.note,
      verificationStatus: "unverified",
      verificationDetail: "User-provided correction; stored as user_reported, not as a verified fact.",
      replacementMemoryId: res.status === "queued" ? res.memoryId : null,
    });
  return res;
}
