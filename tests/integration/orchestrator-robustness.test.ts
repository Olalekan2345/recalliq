/**
 * Regression: a provider that returns empty responses (as Gemini did with
 * MALFORMED_FUNCTION_CALL in a long investigation) must not leave the user
 * without an answer, and must not be mislabelled as "limit reached".
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4CallOptions, LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import { agentExecutionStep, agentFailure, agentRun, investigation } from "@/lib/db/schema";
import { setChainOverride } from "@/lib/blockchain/tatum/client";
import { setMemoryStoreOverride } from "@/lib/memory/memwal/store";
import { setModelOverride } from "@/lib/ai/providers";
import { executeRun } from "@/lib/ai/orchestrator/run-agent";
import { parseTask } from "@/lib/ai/planning/task";
import { newId } from "@/lib/security/ids";
import { createUser, setupTestDb } from "../helpers/db";
import { FakeChain, fixtureDigest, fixtureTx } from "../helpers/fake-chain";
import type { Database } from "@/lib/db/client";

const D = fixtureDigest("robustness");
const TASK = `Did transaction ${D} succeed?`;

let db: Database;
let close: () => Promise<void>;
let userId: string;

const usage = () => ({ inputTokens: { total: 50, noCache: 50, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } });
const empty = (): LanguageModelV4GenerateResult => ({
  content: [],
  finishReason: { unified: "other", raw: "MALFORMED_FUNCTION_CALL" },
  usage: usage(),
  warnings: [],
});
const report = (): LanguageModelV4GenerateResult => ({
  content: [
    {
      type: "tool-call",
      toolCallId: "call-report",
      toolName: "submit_final_report",
      input: JSON.stringify({
        answer: "The transaction succeeded according to the evidence gathered [E1].",
        claims: [
          {
            statement: "The transaction succeeded",
            kind: "verified_fact",
            evidenceRefs: ["E1"],
            assertion: { type: "tx_status", digest: D, expected: "success" },
          },
        ],
        limitations: [],
        toolRationale: [],
        memoriesApplied: [],
      }),
    },
  ],
  finishReason: { unified: "tool-calls", raw: "STOP" },
  usage: usage(),
  warnings: [],
});

/** Inspects once, then returns empty responses — unless only the report tool is offered (report-only pass). */
function flakyModel(opts: { recoverOnReportOnly: boolean }) {
  return async (o: LanguageModelV4CallOptions): Promise<LanguageModelV4GenerateResult> => {
    const toolNames = (o.tools ?? []).map((t) => t.name);
    const reportOnly = toolNames.length === 1 && toolNames[0] === "submit_final_report";
    if (reportOnly) return opts.recoverOnReportOnly ? report() : empty();
    if (o.prompt.some((m) => m.role === "tool")) return empty();
    return {
      content: [{ type: "tool-call", toolCallId: "call-inspect", toolName: "tatum_transaction_inspector", input: JSON.stringify({ digest: D }) }],
      finishReason: { unified: "tool-calls", raw: "STOP" },
      usage: usage(),
      warnings: [],
    };
  };
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
    memoryMode: "disabled",
    limits: { maxToolCalls: 8, maxIterations: 10, maxDurationMs: 60_000, maxOutputTokens: 2000 },
  });
  return runId;
}

function useModel(recoverOnReportOnly: boolean) {
  setModelOverride({
    configured: true,
    provider: "google",
    modelId: "scripted-flaky-model",
    model: new MockLanguageModelV4({ doGenerate: flakyModel({ recoverOnReportOnly }) }),
    pricing: null,
  });
}

beforeAll(async () => {
  ({ db, close } = await setupTestDb());
  userId = await createUser(db);
  setChainOverride(new FakeChain().addTx(fixtureTx({ digest: D })));
  setMemoryStoreOverride(null);
});
afterAll(async () => {
  setModelOverride(undefined);
  setMemoryStoreOverride(undefined);
  setChainOverride(undefined);
  await close();
});

describe("empty model responses", () => {
  it("the report-only pass rescues the investigation and the empty responses are recorded", async () => {
    useModel(true);
    const runId = await newRun();
    await executeRun(runId);
    const [run] = await db.select().from(agentRun).where(eq(agentRun.id, runId));
    expect(run!.status).toBe("COMPLETED");
    expect(run!.finalReport?.claims).toHaveLength(1);
    const steps = await db.select().from(agentExecutionStep).where(eq(agentExecutionStep.runId, runId));
    expect(steps.some((s) => s.title.includes("empty response (finish: MALFORMED_FUNCTION_CALL)"))).toBe(true);
    expect(steps.some((s) => s.title.includes("report-only"))).toBe(true);
  });

  it("a model that never reports is labelled honestly, not as a limit", async () => {
    useModel(false);
    const runId = await newRun();
    await executeRun(runId);
    const [run] = await db.select().from(agentRun).where(eq(agentRun.id, runId));
    expect(run!.error).toBeNull();
    expect(run!.status).toBe("PARTIALLY_COMPLETED");
    expect((run!.checkpoint as { endReason?: string }).endReason).toBe("no_report");
    const failures = await db.select().from(agentFailure).where(eq(agentFailure.runId, runId));
    expect(failures).toHaveLength(1);
    expect(failures[0]!.observed).toMatch(/without submitting a report/);
    expect(failures[0]!.observed).not.toMatch(/limit/i);
  });
});
