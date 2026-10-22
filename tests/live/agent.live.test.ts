/**
 * LIVE: a complete investigation with the real LLM provider and real Tatum
 * Mainnet data (PGlite database; Walrus Memory if configured, otherwise
 * memory is reported unconfigured). Requires an LLM API key.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { agentRun, investigation, toolExecution, verificationResult } from "@/lib/db/schema";
import { SuiChainClient } from "@/lib/blockchain/tatum/client";
import { executeRun } from "@/lib/ai/orchestrator/run-agent";
import { parseTask } from "@/lib/ai/planning/task";
import { resolveModel } from "@/lib/ai/providers";
import { newId } from "@/lib/security/ids";
import { createUser, setupTestDb } from "../helpers/db";
import type { Database } from "@/lib/db/client";

const llmConfigured = resolveModel().configured;

describe.skipIf(!llmConfigured)("LIVE agent investigation (real LLM + Tatum)", () => {
  let db: Database;
  let close: () => Promise<void>;
  beforeAll(async () => ({ db, close } = await setupTestDb()));
  afterAll(async () => close?.());

  it("investigates a real recent Mainnet transaction and verifies its claims", async () => {
    const host = (process.env.TATUM_SUI_GRPC_URL ?? "sui-mainnet-grpc.gateway.tatum.io:443").replace(/^https?:\/\//, "");
    const probe = new SuiChainClient({
      host: host.includes(":") ? host : `${host}:443`,
      apiKey: process.env.TATUM_API_KEY,
      timeoutMs: 25_000,
      network: "mainnet",
    });
    const cp = await probe.getCheckpoint(null, { includeContents: true });
    const batch = await probe.batchGetTransactions((cp.data.transactionDigests ?? []).slice(-12));
    const tx = batch.data.find((t) => "sender" in t && t.sender && !/^0x0+$/.test(t.sender)) as { digest: string } | undefined;
    expect(tx).toBeTruthy();

    const userId = await createUser(db);
    const task = `Did transaction ${tx!.digest} succeed, who sent it, and what balance changes did it cause?`;
    const parsed = parseTask(task);
    const invId = newId();
    const runId = newId();
    await db.insert(investigation).values({ id: invId, userId, title: task });
    await db.insert(agentRun).values({
      id: runId,
      investigationId: invId,
      userId,
      task,
      inputs: parsed.inputs,
      taskCategory: parsed.category,
      limits: { maxToolCalls: 8, maxIterations: 10, maxDurationMs: 240_000, maxOutputTokens: 8000 },
    });

    await executeRun(runId);
    const [run] = await db.select().from(agentRun).where(eq(agentRun.id, runId));
    console.info(`[live] run ${run!.status} · ${run!.toolCallCount} tool calls · ${run!.inputTokens}/${run!.outputTokens} tokens`);
    expect(["COMPLETED", "PARTIALLY_COMPLETED"]).toContain(run!.status);
    const tools = await db.select().from(toolExecution).where(eq(toolExecution.runId, runId));
    expect(tools.length).toBeGreaterThan(0);
    const ver = await db.select().from(verificationResult).where(eq(verificationResult.runId, runId));
    console.info(`[live] claims: ${ver.map((v) => `${v.claimRef}=${v.status}`).join(", ")}`);
    expect(ver.length).toBeGreaterThan(0);
  }, 300_000);
});
