/**
 * The learning loop, end to end, through the real orchestrator, verification
 * engine, autopsy, memory service, policy enforcement and evaluation harness.
 *
 * Test doubles (clearly test-only): a SCRIPTED language model that naively
 * reports raw atomic units as whole coins unless something stops it, the
 * SDK's MemWalMock, and a recorded-fixture chain. This proves the mechanism;
 * it is not presented as real LLM behaviour.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { MemWalMock } from "@mysten-incubation/memwal";
import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4CallOptions, LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import { agentFailure, agentRun, evaluationRun, investigation, learningMemory, memoryUsage, toolExecution, verificationResult } from "@/lib/db/schema";
import { setChainOverride } from "@/lib/blockchain/tatum/client";
import { setMemoryStoreOverride, wrapClient } from "@/lib/memory/memwal/store";
import { confirmMemory, submitMemory } from "@/lib/memory/service";
import { setModelOverride } from "@/lib/ai/providers";
import { executeRun } from "@/lib/ai/orchestrator/run-agent";
import { createEvaluation, runEvaluation } from "@/lib/ai/evaluation/harness";
import { parseTask } from "@/lib/ai/planning/task";
import { newId } from "@/lib/security/ids";
import { createUser, setupTestDb } from "../helpers/db";
import { FakeChain, fixtureAddress, fixtureDigest, fixtureTx, SUI } from "../helpers/fake-chain";
import type { Database } from "@/lib/db/client";

const D = fixtureDigest("learning-transfer");
const BOB = fixtureAddress("bob");
const TASK = `How much SUI did ${BOB} receive in transaction ${D}?`;

let db: Database;
let close: () => Promise<void>;
let userId: string;

function usage() {
  return { inputTokens: { total: 120, noCache: 120, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 40, text: 40, reasoning: 0 } };
}

function toolCall(name: string, args: unknown): LanguageModelV4GenerateResult {
  return {
    content: [{ type: "tool-call", toolCallId: `call-${name}-${Math.random().toString(36).slice(2, 8)}`, toolName: name, input: JSON.stringify(args) }],
    finishReason: { unified: "tool-calls", raw: "tool_use" },
    usage: usage(),
    warnings: [],
  };
}

function report(amount: string) {
  return {
    answer: `The address received ${amount} SUI in this transaction [E1].`,
    claims: [
      {
        statement: `Bob received ${amount} SUI`,
        kind: "verified_fact",
        evidenceRefs: ["E1"],
        assertion: { type: "balance_change_display", digest: D, address: BOB, coinType: SUI, amount },
      },
      { statement: "The transaction succeeded", kind: "verified_fact", evidenceRefs: ["E1"], assertion: { type: "tx_status", digest: D, expected: "success" } },
    ],
    limitations: [],
    toolRationale: [{ tool: "tatum_transaction_inspector", why: "Read the transaction" }],
    memoriesApplied: [],
  };
}

/** Scripted policy: inspect → report raw atomic amount as SUI (the mistake) unless forced to analyse decimals. */
async function scripted(options: LanguageModelV4CallOptions): Promise<LanguageModelV4GenerateResult> {
  const results: Array<{ toolName: string; value: unknown }> = [];
  for (const m of options.prompt) {
    if (m.role !== "tool") continue;
    for (const p of m.content) if (p.type === "tool-result") results.push({ toolName: p.toolName, value: (p.output as { value?: unknown }).value });
  }
  const last = results.at(-1);
  if (!last) return toolCall("tatum_transaction_inspector", { digest: D });
  if (last.toolName === "tatum_transaction_inspector") return toolCall("submit_final_report", report("1500000000"));
  if (last.toolName === "submit_final_report") {
    const accepted = (last.value as { accepted?: boolean }).accepted;
    if (accepted)
      return { content: [{ type: "text", text: "Report submitted." }], finishReason: { unified: "stop", raw: "end_turn" }, usage: usage(), warnings: [] };
    return toolCall("balance_change_analyzer", { digest: D, address: BOB });
  }
  if (last.toolName === "balance_change_analyzer") {
    const change = (last.value as { changes: Array<{ displayAmount: string }> }).changes[0]!;
    return toolCall("submit_final_report", report(change.displayAmount));
  }
  return { content: [{ type: "text", text: "Done." }], finishReason: { unified: "stop", raw: "end_turn" }, usage: usage(), warnings: [] };
}

async function newRun(memoryMode: "enabled" | "disabled") {
  const invId = newId();
  const runId = newId();
  const parsed = parseTask(TASK);
  await db.insert(investigation).values({ id: invId, userId, title: TASK });
  await db.insert(agentRun).values({
    id: runId,
    investigationId: invId,
    userId,
    task: TASK,
    inputs: parsed.inputs,
    taskCategory: parsed.category,
    memoryMode,
    limits: { maxToolCalls: 8, maxIterations: 10, maxDurationMs: 60_000, maxOutputTokens: 2000 },
  });
  return runId;
}

async function runOf(id: string) {
  const [r] = await db.select().from(agentRun).where(eq(agentRun.id, id));
  return r!;
}

beforeAll(async () => {
  ({ db, close } = await setupTestDb());
  userId = await createUser(db);
  setChainOverride(
    new FakeChain().addTx(
      fixtureTx({
        digest: D,
        balanceChanges: [
          { address: fixtureAddress("sender"), coinType: SUI, amountAtomic: "-1502000000" },
          { address: BOB, coinType: SUI, amountAtomic: "1500000000" },
        ],
      }),
    ),
  );
  setMemoryStoreOverride(wrapClient(MemWalMock.create({ namespace: "test" }), "test-mock", "test"));
  setModelOverride({
    configured: true,
    provider: "anthropic",
    modelId: "scripted-test-model",
    model: new MockLanguageModelV4({ doGenerate: scripted }),
    pricing: { inputUsdPerMTok: 4, outputUsdPerMTok: 20, source: "test" },
  });
});
afterAll(async () => {
  setModelOverride(undefined);
  setMemoryStoreOverride(undefined);
  setChainOverride(undefined);
  await close();
});

describe("learning loop", () => {
  let lessonId: string;

  it("1. a mistake is caught by independent verification and becomes a stored lesson", async () => {
    const runId = await newRun("enabled");
    await executeRun(runId);
    const run = await runOf(runId);
    expect(run.status).toBe("PARTIALLY_COMPLETED");
    expect(run.inputTokens).toBeGreaterThan(0);
    expect(run.modelCostMicroUsd).not.toBeNull();

    const ver = await db.select().from(verificationResult).where(eq(verificationResult.runId, runId));
    expect(ver.find((v) => v.claimRef === "C1")!.status).toBe("CONTRADICTED");
    expect(ver.find((v) => v.claimRef === "C2")!.status).toBe("VERIFIED");

    const [failure] = await db.select().from(agentFailure).where(eq(agentFailure.runId, runId));
    expect(failure).toMatchObject({ category: "decimal_scaling_error", objectivelyVerified: true, status: "lesson_recorded" });
    expect(failure!.confirmedCause).toContain("10^9");

    const [mem] = await db.select().from(learningMemory).where(eq(learningMemory.sourceRunId, runId));
    expect(mem).toMatchObject({ directive: "verify_coin_decimals", storageStatus: "queued", verificationStatus: "verified" });
    lessonId = mem!.id;

    // The worker's storage jobs: accepted → done with a real (mock) blob id.
    await submitMemory(lessonId);
    expect(await confirmMemory(lessonId)).toBe("stored");
    const [stored] = await db.select().from(learningMemory).where(eq(learningMemory.id, lessonId));
    expect(stored!.walrusBlobId).toBeTruthy();
  });

  it("2. a later, independent run recalls the lesson and the enforced policy changes its behaviour", async () => {
    const runId = await newRun("enabled");
    await executeRun(runId);
    const run = await runOf(runId);
    expect(run.status).toBe("COMPLETED");

    const tools = await db.select().from(toolExecution).where(eq(toolExecution.runId, runId));
    expect(tools.map((t) => t.toolId)).toContain("balance_change_analyzer");

    const ver = await db.select().from(verificationResult).where(eq(verificationResult.runId, runId));
    expect(ver.every((v) => v.status === "VERIFIED")).toBe(true);

    const [use] = await db
      .select()
      .from(memoryUsage)
      .where(and(eq(memoryUsage.runId, runId), eq(memoryUsage.memoryId, lessonId)));
    expect(use!.disposition).toBe("applied");
    expect(use!.decisionChanged).toMatch(/rejected until the agent complied/);

    // Validated strategy: the lesson worked, so a success memory is proposed.
    const success = await db
      .select()
      .from(learningMemory)
      .where(and(eq(learningMemory.sourceRunId, runId), eq(learningMemory.memoryType, "success")));
    expect(success).toHaveLength(1);
  });

  it("3. a baseline run without memory repeats the original mistake", async () => {
    const runId = await newRun("disabled");
    await executeRun(runId);
    expect((await runOf(runId)).status).toBe("PARTIALLY_COMPLETED");
    const usages = await db.select().from(memoryUsage).where(eq(memoryUsage.runId, runId));
    expect(usages).toHaveLength(0);
  });

  it("4. the paired evaluation measures the difference, writes no memories, and stays honest about n", async () => {
    const before = (await db.select().from(learningMemory)).length;
    const evalId = await createEvaluation(userId, { name: "decimals", tasks: [{ task: TASK }] });
    await runEvaluation(evalId);
    const [ev] = await db.select().from(evaluationRun).where(eq(evaluationRun.id, evalId));
    expect(ev!.status).toBe("completed");
    expect(ev!.summary!.modes.baseline!.contradictedClaims).toBe(1);
    expect(ev!.summary!.modes.memory!.contradictedClaims).toBe(0);
    expect(ev!.summary!.inconclusive).toBe(true);
    expect((await db.select().from(learningMemory)).length).toBe(before);
    const evalRuns = await db.select().from(agentRun).where(eq(agentRun.evaluationRunId, evalId));
    expect(evalRuns.every((r) => r.isEvaluation)).toBe(true);
  });
});
