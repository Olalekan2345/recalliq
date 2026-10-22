import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { evidenceRecord } from "@/lib/db/schema";
import { newId, sha256Hex, stableStringify } from "@/lib/security/ids";
import type { EvidenceInput } from "@/lib/ai/tools/types";

export interface EvidenceProvenance {
  provider: string;
  method: string;
  network: string;
}

/** Persist one evidence record and return its run-local reference ("E3"). */
export async function addEvidence(
  run: { id: string; userId: string },
  toolExecutionId: string | null,
  e: EvidenceInput,
  provenance: EvidenceProvenance,
): Promise<string> {
  const data = JSON.parse(stableStringify(e.data)) as unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    const [{ n } = { n: 0 }] = await db()
      .select({ n: sql<number>`count(*)::int` })
      .from(evidenceRecord)
      .where(eq(evidenceRecord.runId, run.id));
    const ref = `E${n + 1 + attempt}`;
    const inserted = await db()
      .insert(evidenceRecord)
      .values({
        id: newId(),
        ref,
        runId: run.id,
        userId: run.userId,
        toolExecutionId,
        provider: provenance.provider,
        network: provenance.network,
        kind: e.kind,
        reference: e.reference,
        method: provenance.method,
        checkpoint: e.checkpoint ?? null,
        data,
        dataHash: sha256Hex(stableStringify(e.data)),
      })
      .onConflictDoNothing()
      .returning({ ref: evidenceRecord.ref });
    if (inserted.length) return ref;
  }
  throw new Error("Could not allocate an evidence reference");
}

export async function evidenceRefsForRun(runId: string): Promise<Set<string>> {
  const rows = await db().select({ ref: evidenceRecord.ref }).from(evidenceRecord).where(eq(evidenceRecord.runId, runId));
  return new Set(rows.map((r) => r.ref));
}

export async function evidenceRefsByExecution(runId: string): Promise<Map<string, string[]>> {
  const rows = await db()
    .select({ ref: evidenceRecord.ref, toolExecutionId: evidenceRecord.toolExecutionId })
    .from(evidenceRecord)
    .where(and(eq(evidenceRecord.runId, runId)));
  const map = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.toolExecutionId) continue;
    map.set(r.toolExecutionId, [...(map.get(r.toolExecutionId) ?? []), r.ref]);
  }
  return map;
}
