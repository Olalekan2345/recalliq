/**
 * Deployment-wide counts for the public homepage. Aggregates only (no user
 * data), production runs only (evaluation runs excluded), read straight from
 * the database — the homepage never shows a number this does not return.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, isDatabaseConfigured } from "@/lib/db/client";
import { agentRun, evaluationRun, learningMemory, verificationResult } from "@/lib/db/schema";

export interface PublicStats {
  investigationsCompleted: number;
  claimsVerified: number;
  claimsContradicted: number;
  lessonsStored: number;
  evaluationsCompleted: number;
}

export async function loadPublicStats(): Promise<PublicStats | null> {
  if (!isDatabaseConfigured()) return null;
  try {
    const count = sql<number>`count(*)::int`;
    const [[runs], [verified], [contradicted], [stored], [evals]] = await Promise.all([
      db()
        .select({ n: count })
        .from(agentRun)
        .where(and(eq(agentRun.isEvaluation, false), inArray(agentRun.status, ["COMPLETED", "PARTIALLY_COMPLETED"]))),
      db()
        .select({ n: count })
        .from(verificationResult)
        .innerJoin(agentRun, eq(verificationResult.runId, agentRun.id))
        .where(and(eq(agentRun.isEvaluation, false), eq(verificationResult.status, "VERIFIED"))),
      db()
        .select({ n: count })
        .from(verificationResult)
        .innerJoin(agentRun, eq(verificationResult.runId, agentRun.id))
        .where(and(eq(agentRun.isEvaluation, false), eq(verificationResult.status, "CONTRADICTED"))),
      db()
        .select({ n: count })
        .from(learningMemory)
        .where(and(eq(learningMemory.isEvaluation, false), eq(learningMemory.storageStatus, "stored"))),
      db().select({ n: count }).from(evaluationRun).where(eq(evaluationRun.status, "completed")),
    ]);
    return {
      investigationsCompleted: runs?.n ?? 0,
      claimsVerified: verified?.n ?? 0,
      claimsContradicted: contradicted?.n ?? 0,
      lessonsStored: stored?.n ?? 0,
      evaluationsCompleted: evals?.n ?? 0,
    };
  } catch {
    return null;
  }
}
