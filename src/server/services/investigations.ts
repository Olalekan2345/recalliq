/**
 * Investigation & run read models (tenant-scoped) and user feedback.
 */
import { and, asc, desc, eq, gt, inArray } from "drizzle-orm";
import { z } from "zod";
import { chain } from "@/lib/blockchain/tatum/client";
import { db } from "@/lib/db/client";
import {
  agentExecutionStep,
  agentFailure,
  agentMessage,
  agentRun,
  evidenceRecord,
  investigation,
  learningMemory,
  memoryUsage,
  paymentAuthorization,
  paymentIntent,
  paymentSettlement,
  paymentTransaction,
  runFeedback,
  toolExecution,
  verificationResult,
} from "@/lib/db/schema";
import { newId } from "@/lib/security/ids";
import { assertionSchema } from "@/lib/ai/verification/assertions";
import { VerificationContext, verifyAssertion } from "@/lib/ai/verification/engine";
import { proposeLesson } from "@/lib/memory/service";

export async function listInvestigations(userId: string, opts: { includeEvaluation?: boolean; limit?: number } = {}) {
  const conds = [eq(investigation.userId, userId)];
  if (!opts.includeEvaluation) conds.push(eq(investigation.isEvaluation, false));
  const invs = await db()
    .select()
    .from(investigation)
    .where(and(...conds))
    .orderBy(desc(investigation.updatedAt))
    .limit(opts.limit ?? 50);
  const runIds = invs.map((i) => i.lastRunId).filter((x): x is string => Boolean(x));
  const runs = runIds.length
    ? await db()
        .select({
          id: agentRun.id,
          taskCategory: agentRun.taskCategory,
          status: agentRun.status,
          toolCallCount: agentRun.toolCallCount,
          createdAt: agentRun.createdAt,
          completedAt: agentRun.completedAt,
        })
        .from(agentRun)
        .where(inArray(agentRun.id, runIds))
    : [];
  const byId = new Map(runs.map((r) => [r.id, r]));
  return invs.map((i) => ({ ...i, lastRun: i.lastRunId ? (byId.get(i.lastRunId) ?? null) : null }));
}

export async function getInvestigation(userId: string, investigationId: string) {
  const [inv] = await db()
    .select()
    .from(investigation)
    .where(and(eq(investigation.id, investigationId), eq(investigation.userId, userId)))
    .limit(1);
  if (!inv) return null;
  const runs = await db()
    .select({
      id: agentRun.id,
      task: agentRun.task,
      status: agentRun.status,
      createdAt: agentRun.createdAt,
      taskCategory: agentRun.taskCategory,
      memoryMode: agentRun.memoryMode,
    })
    .from(agentRun)
    .where(and(eq(agentRun.investigationId, investigationId), eq(agentRun.userId, userId)))
    .orderBy(asc(agentRun.createdAt));
  return { investigation: inv, runs };
}

export async function getRunDetail(userId: string, runId: string) {
  const [run] = await db()
    .select()
    .from(agentRun)
    .where(and(eq(agentRun.id, runId), eq(agentRun.userId, userId)))
    .limit(1);
  if (!run) return null;
  const [steps, tools, evidence, verifications, failures, usage, messages, intents, feedback] = await Promise.all([
    db().select().from(agentExecutionStep).where(eq(agentExecutionStep.runId, runId)).orderBy(asc(agentExecutionStep.id)),
    db().select().from(toolExecution).where(eq(toolExecution.runId, runId)).orderBy(asc(toolExecution.startedAt)),
    db()
      .select({
        id: evidenceRecord.id,
        ref: evidenceRecord.ref,
        provider: evidenceRecord.provider,
        network: evidenceRecord.network,
        kind: evidenceRecord.kind,
        reference: evidenceRecord.reference,
        method: evidenceRecord.method,
        checkpoint: evidenceRecord.checkpoint,
        dataHash: evidenceRecord.dataHash,
        fetchedAt: evidenceRecord.fetchedAt,
        toolExecutionId: evidenceRecord.toolExecutionId,
      })
      .from(evidenceRecord)
      .where(eq(evidenceRecord.runId, runId))
      .orderBy(asc(evidenceRecord.fetchedAt)),
    db().select().from(verificationResult).where(eq(verificationResult.runId, runId)).orderBy(asc(verificationResult.claimRef)),
    db().select().from(agentFailure).where(eq(agentFailure.runId, runId)),
    db()
      .select({
        usage: memoryUsage,
        memory: {
          id: learningMemory.id,
          summary: learningMemory.summary,
          memoryType: learningMemory.memoryType,
          walrusBlobId: learningMemory.walrusBlobId,
          directive: learningMemory.directive,
        },
      })
      .from(memoryUsage)
      .leftJoin(learningMemory, eq(memoryUsage.memoryId, learningMemory.id))
      .where(eq(memoryUsage.runId, runId)),
    db().select().from(agentMessage).where(eq(agentMessage.runId, runId)).orderBy(asc(agentMessage.createdAt)),
    db()
      .select()
      .from(paymentIntent)
      .where(and(eq(paymentIntent.runId, runId), eq(paymentIntent.userId, userId)))
      .orderBy(asc(paymentIntent.createdAt)),
    db().select().from(runFeedback).where(eq(runFeedback.runId, runId)),
  ]);
  const intentIds = intents.map((i) => i.id);
  const [settlements, txs, auths] = intentIds.length
    ? await Promise.all([
        db().select().from(paymentSettlement).where(inArray(paymentSettlement.intentId, intentIds)),
        db().select().from(paymentTransaction).where(inArray(paymentTransaction.intentId, intentIds)),
        db()
          .select({
            intentId: paymentAuthorization.intentId,
            decision: paymentAuthorization.decision,
            walletAddress: paymentAuthorization.walletAddress,
            expectedDigest: paymentAuthorization.expectedDigest,
            createdAt: paymentAuthorization.createdAt,
          })
          .from(paymentAuthorization)
          .where(inArray(paymentAuthorization.intentId, intentIds)),
      ])
    : [[], [], []];
  const memoriesWritten = await db()
    .select({
      id: learningMemory.id,
      summary: learningMemory.summary,
      storageStatus: learningMemory.storageStatus,
      walrusBlobId: learningMemory.walrusBlobId,
      memoryType: learningMemory.memoryType,
      directive: learningMemory.directive,
      createdAt: learningMemory.createdAt,
    })
    .from(learningMemory)
    .where(eq(learningMemory.sourceRunId, runId));
  const { checkpoint, ...safeRun } = run;
  void checkpoint; // model message history stays server-side
  return {
    run: safeRun,
    steps,
    tools,
    evidence,
    verifications,
    failures,
    memoryUsage: usage,
    memoriesWritten,
    messages,
    payments: intents.map((i) => ({
      intent: i,
      authorization: auths.find((a) => a.intentId === i.id) ?? null,
      transactions: txs.filter((t) => t.intentId === i.id),
      settlement: settlements.find((s) => s.intentId === i.id) ?? null,
    })),
    feedback,
  };
}

export async function getEvidenceData(userId: string, runId: string, ref: string) {
  const [row] = await db()
    .select()
    .from(evidenceRecord)
    .where(and(eq(evidenceRecord.runId, runId), eq(evidenceRecord.userId, userId), eq(evidenceRecord.ref, ref)))
    .limit(1);
  return row ?? null;
}

export async function stepsAfter(userId: string, runId: string, afterId: number) {
  return db()
    .select()
    .from(agentExecutionStep)
    .where(and(eq(agentExecutionStep.runId, runId), eq(agentExecutionStep.userId, userId), gt(agentExecutionStep.id, afterId)))
    .orderBy(asc(agentExecutionStep.id))
    .limit(200);
}

/* ───────────── Feedback: "this is wrong" ───────────── */

export const feedbackSchema = z.object({
  claimRef: z
    .string()
    .regex(/^C\d{1,3}$/)
    .optional(),
  note: z.string().trim().min(3).max(1000),
  evidence: z.string().trim().max(500).optional(),
});

/**
 * User feedback is never accepted as fact. If the disputed claim carries a
 * machine-checkable assertion it is re-verified on fresh chain data; only a
 * chain-confirmed error becomes a verified correction (and a lesson).
 */
export async function submitFeedback(userId: string, runId: string, input: z.infer<typeof feedbackSchema>) {
  const [run] = await db()
    .select()
    .from(agentRun)
    .where(and(eq(agentRun.id, runId), eq(agentRun.userId, userId)))
    .limit(1);
  if (!run) return null;
  let verificationStatus: "verified" | "unverified" | "contradicted" = "unverified";
  let detail = "No machine-checkable assertion for this claim; kept as unverified feedback.";
  let failureId: string | null = null;

  if (input.claimRef) {
    const [claim] = await db()
      .select()
      .from(verificationResult)
      .where(and(eq(verificationResult.runId, runId), eq(verificationResult.claimRef, input.claimRef)))
      .limit(1);
    const parsed = claim?.assertion ? assertionSchema.safeParse(claim.assertion) : null;
    if (parsed?.success) {
      const outcome = await verifyAssertion(new VerificationContext(chain()), parsed.data);
      if (outcome.status === "CONTRADICTED") {
        verificationStatus = "verified";
        detail = `Confirmed by fresh chain data: ${outcome.detail}`;
        failureId = newId();
        await db().insert(agentFailure).values({
          id: failureId,
          runId,
          userId,
          category: "user_reported_error",
          taskCategory: run.taskCategory,
          expectation: claim!.claim,
          observed: outcome.detail,
          objectivelyVerified: true,
          confirmedCause: outcome.detail,
          hypotheses: [],
          correctiveStrategy: "Re-verify claims of this kind with evidence_cross_checker before reporting",
          correctionValidated: true,
          evidenceRefs: claim!.citedEvidenceRefs,
          verificationResultId: claim!.id,
          status: "open",
        });
        if (!run.isEvaluation) {
          const res = await proposeLesson({
            userId,
            scope: "user",
            memoryType: "correction",
            taskCategory: run.taskCategory,
            relatedToolId: "evidence_cross_checker",
            directive: "cite_evidence_for_every_fact",
            summary: "User-reported error confirmed on chain",
            lesson:
              "A user reported an incorrect claim and fresh chain data confirmed the error. Re-check claims of this kind with evidence_cross_checker and cite evidence before reporting them.",
            evidenceText: `run ${runId}; claim ${input.claimRef}; ${outcome.detail}`,
            evidenceReferences: [
              { kind: "run", id: runId },
              { kind: "verification", id: claim!.id, label: input.claimRef },
            ],
            verificationStatus: "verified",
            sourceRunId: runId,
            sourceFailureId: failureId,
          });
          await db()
            .update(agentFailure)
            .set({ status: res.status === "rejected" ? "no_lesson" : "lesson_recorded" })
            .where(eq(agentFailure.id, failureId));
        }
      } else if (outcome.status === "VERIFIED") {
        verificationStatus = "contradicted";
        detail = `Fresh chain data still supports the original claim (${outcome.detail}). Kept as unconfirmed feedback.`;
      } else {
        detail = `Re-verification was ${outcome.status}: ${outcome.detail}`;
      }
    }
  }
  const id = newId();
  await db()
    .insert(runFeedback)
    .values({
      id,
      runId,
      userId,
      claimRef: input.claimRef ?? null,
      note: input.note,
      evidence: input.evidence ?? null,
      verificationStatus,
      verificationDetail: detail,
      failureId,
    });
  return { id, verificationStatus, detail };
}
