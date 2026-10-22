/**
 * Answer grounding and proven-strategy memories through the real orchestrator,
 * verification engine, autopsy and memory service.
 *
 * Test doubles (test-only): a SCRIPTED language model, the SDK's MemWalMock and
 * a recorded-fixture chain. The script reproduces a mistake seen live (a date
 * written wrongly in the answer prose); it is not presented as real LLM output.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { MemWalMock } from "@mysten-incubation/memwal";
import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4CallOptions, LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import { agentExecutionStep, agentFailure, agentRun, investigation, learningMemory } from "@/lib/db/schema";
import { setChainOverride } from "@/lib/blockchain/tatum/client";
import { setMemoryStoreOverride, wrapClient } from "@/lib/memory/memwal/store";
import { setModelOverride } from "@/lib/ai/providers";
import { executeRun } from "@/lib/ai/orchestrator/run-agent";
import { parseTask } from "@/lib/ai/planning/task";
import { newId } from "@/lib/security/ids";
import { createUser, setupTestDb } from "../helpers/db";
import { FakeChain, fixtureDigest, fixtureTx } from "../helpers/fake-chain";
import type { Database } from "@/lib/db/client";

const D = fixtureDigest("grounding-tx"); // fixture timestamp 2026-10-21T17:10:58.273Z
const TASK = `Did transaction ${D} succeed, and when?`;

let db: Database;
let close: () => Promise<void>;
let userId: string;

const usage = () => ({ inputTokens: { total: 80, noCache: 80, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 20, text: 20, reasoning: 0 } });
const toolCall = (name: string, args: unknown): LanguageModelV4GenerateResult => ({
  content: [{ type: "tool-call", toolCallId: `call-${name}-${Math.random().toString(36).slice(2, 8)}`, toolName: name, input: JSON.stringify(args) }],
  finishReason: { unified: "tool-calls", raw: "tool_use" },
  usage: usage(),
  warnings: [],
});
const done = (): LanguageModelV4GenerateResult => ({
  content: [{ type: "text", text: "Report submitted." }],
  finishReason: { unified: "stop", raw: "end_turn" },
  usage: usage(),
  warnings: [],
});

const report = (when: string) => ({
  answer: `Transaction ${D} succeeded on ${when} UTC [E1].`,
  claims: [
    { statement: "The transaction succeeded", kind: "verified_fact", evidenceRefs: ["E1"], assertion: { type: "tx_status", digest: D, expected: "success" } },
    {
      statement: "It executed on 2026-10-21 (UTC)",
      kind: "verified_fact",
      evidenceRefs: ["E1"],
      assertion: { type: "tx_timestamp", digest: D, timestamp: "2026-10-21T17:10" },
    },
  ],
  limitations: [],
  toolRationale: [],
  memoriesApplied: [],
});

/** Inspect, then write the date wrongly; correct it after a rejection unless `stubborn`. */
function scripted(opts: { stubborn: boolean }) {
  return async (o: LanguageModelV4CallOptions): Promise<LanguageModelV4GenerateResult> => {
    const results: Array<{ toolName: string; value: unknown }> = [];
    for (const m of o.prompt) {
      if (m.role !== "tool") continue;
      for (const p of m.content) if (p.type === "tool-result") results.push({ toolName: p.toolName, value: (p.output as { value?: unknown }).value });
    }
    const last = results.at(-1);
    if (!last) return toolCall("tatum_transaction_inspector", { digest: D });
    if (last.toolName === "tatum_transaction_inspector") return toolCall("submit_final_report", report("2026-10-29T17:10"));
    if (last.toolName === "submit_final_report") {
      if ((last.value as { accepted?: boolean }).accepted) return done();
      return toolCall("submit_final_report", report(opts.stubborn ? "2026-10-29T17:10" : "2026-10-21T17:10"));
    }
    return done();
  };
}

function useModel(stubborn: boolean) {
  setModelOverride({
    configured: true,
    provider: "anthropic",
    modelId: "scripted-test-model",
    model: new MockLanguageModelV4({ doGenerate: scripted({ stubborn }) }),
    pricing: null,
  });
}

async function newRun() {
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
    memoryMode: "enabled",
    limits: { maxToolCalls: 8, maxIterations: 10, maxDurationMs: 60_000, maxOutputTokens: 2000 },
  });
  return runId;
}

const runOf = async (id: string) => (await db.select().from(agentRun).where(eq(agentRun.id, id)))[0]!;
const stepTitles = async (id: string) => (await db.select().from(agentExecutionStep).where(eq(agentExecutionStep.runId, id))).map((s) => s.title);
const strategies = () =>
  db
    .select()
    .from(learningMemory)
    .where(and(eq(learningMemory.userId, userId), eq(learningMemory.memoryType, "strategy")));

beforeAll(async () => {
  ({ db, close } = await setupTestDb());
  userId = await createUser(db);
  setChainOverride(new FakeChain().addTx(fixtureTx({ digest: D })));
  setMemoryStoreOverride(wrapClient(MemWalMock.create({ namespace: "test" }), "test-mock", "test"));
});
afterAll(async () => {
  setModelOverride(undefined);
  setMemoryStoreOverride(undefined);
  setChainOverride(undefined);
  await close();
});

describe("answer grounding", () => {
  it("rejects a date that is not in the evidence, accepts the corrected report and records the strategy once", async () => {
    useModel(false);
    const runId = await newRun();
    await executeRun(runId);
    const run = await runOf(runId);
    expect(run.status).toBe("COMPLETED");
    expect(run.finalReport?.answer).toContain("2026-10-21T17:10");
    expect(run.finalReport?.limitations).toEqual([]);
    const titles = await stepTitles(runId);
    expect(titles).toContain("Report rejected: 1 value(s) in the answer are not in this run's evidence");
    expect(titles.filter((t) => t.startsWith("C") && t.includes("VERIFIED"))).toHaveLength(2);

    const [strategy, ...more] = await strategies();
    expect(more).toHaveLength(0);
    expect(strategy).toMatchObject({
      scope: "user",
      directive: "prefer_tool_for_category",
      relatedToolId: "tatum_transaction_inspector",
      taskCategory: run.taskCategory,
      sourceRunId: runId,
    });
    // The text sent to Walrus carries the parseable header WorthIt reads back on recall.
    expect(strategy!.content.split("\n")).toEqual(
      expect.arrayContaining(["RECALLIQ-LESSON v1", "type: strategy", "tool: tatum_transaction_inspector", "directive: prefer_tool_for_category"]),
    );

    // A second clean run of the same category does not add another strategy.
    const second = await newRun();
    await executeRun(second);
    expect(await strategies()).toHaveLength(1);
    expect(await stepTitles(second)).toContain(`A verified strategy for ${run.taskCategory!.replace(/_/g, " ")} is already remembered`);
  });

  it("after repeated rejections, accepts the report with the values disclosed and records the mistake", async () => {
    useModel(true);
    const runId = await newRun();
    await executeRun(runId);
    const run = await runOf(runId);
    expect(run.status).toBe("PARTIALLY_COMPLETED");
    expect(run.finalReport?.limitations.at(-1)).toBe("Not found in this investigation's evidence, so unverified: date 2026-10-29T17:10");
    const titles = await stepTitles(runId);
    expect(titles.filter((t) => t.startsWith("Report rejected"))).toHaveLength(2);
    expect(titles).toContain("Report accepted with 1 unverified value(s) listed under limitations");
    const failures = await db.select().from(agentFailure).where(eq(agentFailure.runId, runId));
    expect(failures).toEqual([expect.objectContaining({ category: "unsupported_claim", objectivelyVerified: true })]);
    expect(failures[0]!.observed).toContain("date 2026-10-29T17:10");
  });
});
