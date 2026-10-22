/**
 * Walrus-backed learning memory.
 *
 *   propose:  validate → dedupe (content hash) → outbox row (queued) → job
 *   submit:   relayer remember() with idempotency key → job id (pending)
 *   confirm:  poll job status → `done` + blob id → stored   (only then "stored")
 *   recall:   semantic recall (user + platform namespaces) → join provenance by
 *             blob id → filter superseded/flagged/evaluation/out-of-range
 *
 * The relayer accepts a write before Walrus storage and indexing finish, so a
 * memory is never shown or used as stored until its job reports `done` with a
 * real blob id.
 */
import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { job, learningMemory, memoryUsage, type EvidenceReference, type MemoryDirective, type MemoryType } from "@/lib/db/schema";
import { memwalConfig } from "@/lib/env";
import { logger } from "@/lib/logging/logger";
import { newId, sha256Hex } from "@/lib/security/ids";
import { containsSecret, safeErrorMessage } from "@/lib/security/redact";
import { enqueue } from "@/server/jobs/queue";
import { composeMemoryText, MEMORY_DIRECTIVES, parseMemoryText, type ComposedLesson } from "./codec";
import { memoryStore, walrusCooldownMs } from "./memwal/store";
import { platformNamespace, userNamespace } from "./namespaces";

const log = logger("memory");

export interface LessonCandidate {
  userId: string | null;
  scope: "user" | "platform";
  memoryType: MemoryType;
  taskCategory: string | null;
  relatedToolId: string | null;
  directive: MemoryDirective | null;
  summary: string;
  lesson: string;
  /** Run-specific evidence line (digests, observed vs claimed values). Not part of the dedupe key. */
  evidenceText: string;
  evidenceReferences: EvidenceReference[];
  verificationStatus: "verified" | "unverified" | "user_reported";
  sourceRunId: string | null;
  sourceFailureId: string | null;
  supersedesMemoryId?: string | null;
  isEvaluation?: boolean;
}

export type ProposeResult =
  | { status: "queued"; memoryId: string; walrusConfigured: boolean }
  | { status: "duplicate"; memoryId: string; reason: string }
  | { status: "rejected"; reason: string };

const HEX_OR_DIGEST = /0x[0-9a-f]{6,}|[1-9A-HJ-NP-Za-km-z]{43,44}/i;

export function validateLesson(c: LessonCandidate): string | null {
  if (c.summary.trim().length < 10 || c.summary.length > 200) return "Summary must be 10–200 characters";
  if (c.lesson.trim().length < 20 || c.lesson.length > 800) return "Lesson must be 20–800 characters";
  if ([c.summary, c.lesson, c.evidenceText].some((t) => containsSecret(t))) return "Lessons never contain keys, seed phrases or credentials";
  if (c.directive && !MEMORY_DIRECTIVES.includes(c.directive)) return "Unknown directive";
  if (c.scope === "user" && !c.userId) return "User-scoped memory requires a user";
  if (c.scope === "platform") {
    if (c.userId) return "Platform memory cannot be tied to a user";
    if ([c.summary, c.lesson, c.evidenceText].some((t) => HEX_OR_DIGEST.test(t))) {
      return "Platform memory must not contain addresses, object ids or digests";
    }
  }
  const needsEvidence: MemoryType[] = ["failure", "correction", "success", "tool_reliability", "cost_efficiency"];
  if (needsEvidence.includes(c.memoryType) && c.evidenceReferences.length === 0) return "This memory type requires evidence references";
  return null;
}

export function namespaceFor(c: Pick<LessonCandidate, "scope" | "userId">): string {
  const prefix = memwalConfig().namespacePrefix;
  return c.scope === "platform" ? platformNamespace(prefix) : userNamespace(prefix, c.userId!);
}

/** Dedupe key: the generalized lesson, not the run-specific evidence. */
export function lessonContentHash(namespace: string, c: LessonCandidate): string {
  const norm = (s: string | null) => (s ?? "-").toLowerCase().replace(/\s+/g, " ").trim();
  return sha256Hex([namespace, c.memoryType, norm(c.directive), norm(c.taskCategory), norm(c.relatedToolId), norm(c.lesson)].join("|"));
}

export async function proposeLesson(c: LessonCandidate): Promise<ProposeResult> {
  const invalid = validateLesson(c);
  if (invalid) return { status: "rejected", reason: invalid };

  const namespace = namespaceFor(c);
  const contentHash = lessonContentHash(namespace, c);
  const database = db();

  const [existing] = await database
    .select({ id: learningMemory.id, status: learningMemory.status, storageStatus: learningMemory.storageStatus })
    .from(learningMemory)
    .where(and(eq(learningMemory.namespace, namespace), eq(learningMemory.contentHash, contentHash), eq(learningMemory.status, "active")))
    .limit(1);
  if (existing && existing.storageStatus !== "failed") {
    return { status: "duplicate", memoryId: existing.id, reason: "An identical active lesson already exists" };
  }

  if (c.sourceRunId) {
    const cap = memwalConfig().maxWritesPerRun;
    const [{ n } = { n: 0 }] = await database
      .select({ n: sql<number>`count(*)::int` })
      .from(learningMemory)
      .where(eq(learningMemory.sourceRunId, c.sourceRunId));
    if (n >= cap) return { status: "rejected", reason: `Per-run memory write budget (${cap}) reached` };
  }

  const memoryId = newId();
  const recorded = new Date().toISOString();
  const composed: ComposedLesson = {
    header: {
      version: 1,
      memoryId,
      type: c.memoryType,
      category: c.taskCategory,
      tool: c.relatedToolId,
      directive: c.directive,
      verification: c.verificationStatus,
      recorded,
    },
    summary: c.summary,
    lesson: c.lesson,
    evidence: c.evidenceText,
  };
  const content = composeMemoryText(composed);
  const idempotencyKey = sha256Hex(`${namespace}|${memoryId}`);

  try {
    await insertLesson();
  } catch (err) {
    // Partial unique index on (namespace, content_hash) for active rows: a concurrent identical lesson won.
    if (/learning_memory_active_content_uq/.test(String((err as Error)?.message ?? ""))) {
      const [dup] = await database
        .select({ id: learningMemory.id })
        .from(learningMemory)
        .where(and(eq(learningMemory.namespace, namespace), eq(learningMemory.contentHash, contentHash), eq(learningMemory.status, "active")))
        .limit(1);
      if (dup) return { status: "duplicate", memoryId: dup.id, reason: "An identical active lesson already exists" };
    }
    throw err;
  }

  return { status: "queued", memoryId, walrusConfigured: Boolean(memoryStore()) };

  async function insertLesson() {
    await database.transaction(async (tx) => {
      if (existing) {
        // A previous identical lesson failed to store: retire it, this one replaces it.
        await tx.update(learningMemory).set({ status: "retracted", flaggedReason: "storage failed; resubmitted" }).where(eq(learningMemory.id, existing.id));
      }
      await tx.insert(learningMemory).values({
        id: memoryId,
        userId: c.userId,
        scope: c.scope,
        namespace,
        memoryType: c.memoryType,
        taskCategory: c.taskCategory,
        relatedToolId: c.relatedToolId,
        directive: c.directive,
        summary: c.summary.trim(),
        lesson: c.lesson.trim(),
        evidenceReferences: c.evidenceReferences,
        verificationStatus: c.verificationStatus,
        sourceRunId: c.sourceRunId,
        sourceFailureId: c.sourceFailureId,
        content,
        contentHash,
        idempotencyKey,
        storageStatus: "queued",
        supersedesMemoryId: c.supersedesMemoryId ?? null,
        isEvaluation: c.isEvaluation ?? false,
      });
      if (c.supersedesMemoryId) {
        await tx.update(learningMemory).set({ status: "superseded", supersededById: memoryId }).where(eq(learningMemory.id, c.supersedesMemoryId));
      }
      if (memoryStore()) {
        await enqueue("memory.submit", { memoryId }, { idempotencyKey: `memory.submit:${memoryId}`, maxAttempts: 4 }, tx);
      }
    });
  }
}

/** Whether the user already has a proven strategy for this category (stored, or still being stored). */
export async function hasActiveStrategy(userId: string, taskCategory: string | null): Promise<boolean> {
  const [row] = await db()
    .select({ id: learningMemory.id })
    .from(learningMemory)
    .where(
      and(
        eq(learningMemory.userId, userId),
        eq(learningMemory.memoryType, "strategy"),
        taskCategory ? eq(learningMemory.taskCategory, taskCategory) : isNull(learningMemory.taskCategory),
        eq(learningMemory.status, "active"),
        ne(learningMemory.storageStatus, "failed"),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export type SubmitOutcome = "submitted" | "already_submitted" | "unconfigured" | "missing";

/** Job handler: hand the outbox text to the relayer. Safe to retry. */
export async function submitMemory(memoryId: string): Promise<SubmitOutcome> {
  const store = memoryStore();
  if (!store) return "unconfigured";
  const database = db();
  const [row] = await database.select().from(learningMemory).where(eq(learningMemory.id, memoryId)).limit(1);
  if (!row) return "missing";
  if (row.storageStatus === "pending" || row.storageStatus === "stored") return "already_submitted";

  await database
    .update(learningMemory)
    .set({ storageStatus: "submitting", storageAttempts: sql`${learningMemory.storageAttempts} + 1` })
    .where(eq(learningMemory.id, memoryId));
  // The relayer dedupes by key: after one of its jobs failed, the same key returns that failed job
  // again. Derive a new key from the failed job, so retries of this submission stay idempotent.
  const relayerKey = row.walrusJobId ? sha256Hex(`${row.idempotencyKey}|after:${row.walrusJobId}`) : row.idempotencyKey;
  try {
    const accepted = await store.remember(row.content, row.namespace, relayerKey);
    await database
      .update(learningMemory)
      .set({ storageStatus: "pending", walrusJobId: accepted.job_id, lastError: null })
      .where(eq(learningMemory.id, memoryId));
    await enqueue("memory.confirm", { memoryId }, { idempotencyKey: `memory.confirm:${memoryId}:${accepted.job_id}`, delayMs: 15_000, maxAttempts: 30 });
    log.info("memory accepted by relayer", { memoryId, jobId: accepted.job_id });
    return "submitted";
  } catch (err) {
    const message = safeErrorMessage(err);
    await database.update(learningMemory).set({ storageStatus: "failed", lastError: message }).where(eq(learningMemory.id, memoryId));
    throw err;
  }
}

export type ConfirmOutcome = "stored" | "pending" | "failed" | "unconfigured" | "missing";

/** Job handler: poll the relayer job; mark stored only on `done` with a blob id. */
export async function confirmMemory(memoryId: string): Promise<ConfirmOutcome> {
  const store = memoryStore();
  if (!store) return "unconfigured";
  const database = db();
  const [row] = await database.select().from(learningMemory).where(eq(learningMemory.id, memoryId)).limit(1);
  if (!row || !row.walrusJobId) return "missing";
  if (row.storageStatus === "stored") return "stored";

  const status = await store.getRememberStatus(row.walrusJobId);
  if (status.status === "done" && status.blob_id) {
    await database
      .update(learningMemory)
      .set({ storageStatus: "stored", walrusBlobId: status.blob_id, walrusOwner: status.owner ?? null, storedAt: new Date(), lastError: null })
      .where(eq(learningMemory.id, memoryId));
    log.info("memory stored on Walrus", { memoryId, blobId: status.blob_id });
    return "stored";
  }
  if (status.status === "failed") {
    await database
      .update(learningMemory)
      .set({ storageStatus: "failed", lastError: safeErrorMessage(status.error ?? "relayer reported failure") })
      .where(eq(learningMemory.id, memoryId));
    return "failed";
  }
  if (status.status === "not_found") {
    const ageMs = Date.now() - row.createdAt.getTime();
    if (ageMs > 30 * 60_000) {
      await database
        .update(learningMemory)
        .set({ storageStatus: "failed", lastError: "Relayer no longer knows this job (not_found)" })
        .where(eq(learningMemory.id, memoryId));
      return "failed";
    }
  }
  return "pending";
}

/** Total relayer submissions per memory (first attempt included) before it stays `failed`. */
export const MAX_STORAGE_ATTEMPTS = 3;

/** After the relayer reported a failed job: resubmit, within the attempt budget. */
export async function retryFailedMemory(memoryId: string): Promise<boolean> {
  const [row] = await db().select().from(learningMemory).where(eq(learningMemory.id, memoryId)).limit(1);
  if (!row || row.storageStatus !== "failed" || row.status !== "active" || row.storageAttempts >= MAX_STORAGE_ATTEMPTS) return false;
  await enqueue("memory.submit", { memoryId }, { idempotencyKey: `memory.submit:${memoryId}:after:${row.walrusJobId ?? "none"}`, maxAttempts: 2 });
  return true;
}

/** Re-enqueue outbox work after a restart or once Walrus becomes configured. */
export async function resumeMemoryOutbox(): Promise<number> {
  if (!memoryStore()) return 0;
  const rows = await db()
    .select({ id: learningMemory.id, storageStatus: learningMemory.storageStatus, walrusJobId: learningMemory.walrusJobId })
    .from(learningMemory)
    .where(inArray(learningMemory.storageStatus, ["queued", "submitting", "pending"]));
  for (const r of rows) {
    if (r.storageStatus === "pending" && r.walrusJobId) {
      const key = `memory.confirm:${r.id}:${r.walrusJobId}`;
      const res = await enqueue("memory.confirm", { memoryId: r.id }, { idempotencyKey: key, maxAttempts: 30 });
      const [existing] = res.created ? [] : await db().select({ status: job.status }).from(job).where(eq(job.id, res.id)).limit(1);
      if (existing && (existing.status === "succeeded" || existing.status === "dead")) {
        // Its poller already finished while the memory still reads pending: poll once more.
        await enqueue("memory.confirm", { memoryId: r.id }, { idempotencyKey: `${key}:resume:${res.id}`, maxAttempts: 30 });
      }
    } else {
      await enqueue("memory.submit", { memoryId: r.id }, { idempotencyKey: `memory.submit:${r.id}`, maxAttempts: 4 });
    }
  }
  return rows.length;
}

/* ───────────────────────────── Recall ───────────────────────────── */

export interface RecalledMemory {
  ref: string;
  blobId: string;
  distance: number;
  namespace: string;
  scope: "user" | "platform";
  text: string;
  parsed: ComposedLesson | null;
  /** Local provenance row, when this blob was written by this deployment. */
  record: {
    id: string;
    memoryType: MemoryType;
    taskCategory: string | null;
    relatedToolId: string | null;
    directive: MemoryDirective | null;
    verificationStatus: string;
    status: string;
    sourceRunId: string | null;
    createdAt: string;
    isEvaluation: boolean;
  } | null;
  disposition: "considered" | "filtered_out";
  filterReason: string | null;
}

export type RecallOutcome =
  | { status: "ok"; memories: RecalledMemory[]; query: string; namespaces: string[] }
  | { status: "unconfigured" | "disabled"; memories: []; query: string; namespaces: [] }
  | { status: "unavailable"; memories: []; query: string; namespaces: string[]; error: string };

export async function recallMemories(params: { userId: string; query: string; limitPerNamespace?: number }): Promise<RecallOutcome> {
  const store = memoryStore();
  if (!store) return { status: "unconfigured", memories: [], query: params.query, namespaces: [] };
  const cfg = memwalConfig();
  const namespaces: Array<{ ns: string; scope: "user" | "platform" }> = [
    { ns: userNamespace(cfg.namespacePrefix, params.userId), scope: "user" },
    { ns: platformNamespace(cfg.namespacePrefix), scope: "platform" },
  ];
  if (walrusCooldownMs() > 0) {
    return {
      status: "unavailable",
      memories: [],
      query: params.query,
      namespaces: namespaces.map((n) => n.ns),
      error: "Walrus Memory relayer is rate-limiting this deployment",
    };
  }

  const hits: Array<{ blobId: string; text: string; distance: number; ns: string; scope: "user" | "platform" }> = [];
  try {
    const results = await Promise.all(
      namespaces.map(async ({ ns, scope }) => {
        const r = await store.recall({ query: params.query, namespace: ns, limit: params.limitPerNamespace ?? 8 });
        return r.results.map((m) => ({ blobId: m.blob_id, text: m.text, distance: m.distance, ns, scope }));
      }),
    );
    for (const r of results) hits.push(...r);
  } catch (err) {
    return { status: "unavailable", memories: [], query: params.query, namespaces: namespaces.map((n) => n.ns), error: safeErrorMessage(err) };
  }

  hits.sort((a, b) => a.distance - b.distance);
  const blobIds = [...new Set(hits.map((h) => h.blobId))];
  const records = blobIds.length
    ? await db().select().from(learningMemory).where(inArray(learningMemory.walrusBlobId, blobIds)).orderBy(desc(learningMemory.createdAt))
    : [];
  const byBlob = new Map(records.map((r) => [r.walrusBlobId!, r]));

  const seen = new Set<string>();
  const memories: RecalledMemory[] = [];
  let n = 0;
  for (const h of hits) {
    if (seen.has(h.blobId)) continue;
    seen.add(h.blobId);
    const rec = byBlob.get(h.blobId) ?? null;
    const parsed = parseMemoryText(h.text);
    let filterReason: string | null = null;
    if (h.distance >= cfg.maxDistance) filterReason = `Low relevance (distance ${h.distance.toFixed(3)} ≥ ${cfg.maxDistance})`;
    else if (!parsed) filterReason = "Not a RecallIQ lesson (unrecognised format)";
    else if (rec && rec.status !== "active") filterReason = `Memory is ${rec.status}`;
    else if (rec?.isEvaluation) filterReason = "Evaluation-only memory";
    else if (rec && h.scope === "user" && rec.userId !== params.userId) filterReason = "Ownership mismatch";
    n++;
    memories.push({
      ref: `M${n}`,
      blobId: h.blobId,
      distance: h.distance,
      namespace: h.ns,
      scope: h.scope,
      text: h.text,
      parsed,
      record: rec
        ? {
            id: rec.id,
            memoryType: rec.memoryType,
            taskCategory: rec.taskCategory,
            relatedToolId: rec.relatedToolId,
            directive: rec.directive,
            verificationStatus: rec.verificationStatus,
            status: rec.status,
            sourceRunId: rec.sourceRunId,
            createdAt: rec.createdAt.toISOString(),
            isEvaluation: rec.isEvaluation,
          }
        : null,
      disposition: filterReason ? "filtered_out" : "considered",
      filterReason,
    });
  }

  resolveConflicts(memories);
  return { status: "ok", memories, query: params.query, namespaces: namespaces.map((x) => x.ns) };
}

/**
 * Contradictory directives for the same tool/category (prefer vs avoid,
 * useful vs unnecessary): keep the most recent verified one, filter the other.
 */
export function resolveConflicts(memories: RecalledMemory[]): void {
  const pairs: Array<[MemoryDirective, MemoryDirective]> = [
    ["prefer_tool_for_category", "avoid_tool_for_category"],
    ["paid_tool_useful_for_category", "paid_tool_unnecessary_for_category"],
  ];
  const active = memories.filter((m) => m.disposition === "considered" && m.parsed?.header.directive);
  for (const [a, b] of pairs) {
    const groups = new Map<string, RecalledMemory[]>();
    for (const m of active) {
      const d = m.parsed!.header.directive!;
      if (d !== a && d !== b) continue;
      const key = `${m.parsed!.header.tool}|${m.parsed!.header.category}`;
      groups.set(key, [...(groups.get(key) ?? []), m]);
    }
    for (const group of groups.values()) {
      const directives = new Set(group.map((m) => m.parsed!.header.directive));
      if (directives.size < 2) continue;
      const score = (m: RecalledMemory) =>
        (m.parsed!.header.verification === "verified" ? 1e15 : 0) + Date.parse(m.record?.createdAt ?? m.parsed!.header.recorded ?? "0");
      const winner = [...group].sort((x, y) => score(y) - score(x))[0]!;
      for (const m of group) {
        if (m !== winner && m.parsed!.header.directive !== winner.parsed!.header.directive) {
          m.disposition = "filtered_out";
          m.filterReason = `Conflicts with newer/verified ${winner.ref}`;
        }
      }
    }
  }
}

export async function recordMemoryUsage(run: { id: string; userId: string }, memories: RecalledMemory[]): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  if (memories.length === 0) return ids;
  const rows = memories.map((m) => {
    const id = newId();
    ids.set(m.ref, id);
    return {
      id,
      memoryId: m.record?.id ?? null,
      walrusBlobId: m.blobId,
      runId: run.id,
      userId: run.userId,
      ref: m.ref,
      distance: m.distance,
      disposition: m.disposition,
      filterReason: m.filterReason,
    };
  });
  await db().insert(memoryUsage).values(rows);
  return ids;
}

export async function markMemoryApplied(usageId: string, memoryId: string | null, influence: string, decisionChanged: string | null): Promise<void> {
  await db()
    .update(memoryUsage)
    .set({ disposition: "applied", influence: influence.slice(0, 500), decisionChanged })
    .where(eq(memoryUsage.id, usageId));
  if (memoryId) await db().update(learningMemory).set({ lastUsedAt: new Date() }).where(eq(learningMemory.id, memoryId));
}
