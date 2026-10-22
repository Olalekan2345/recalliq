import { desc, eq, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { agentRun } from "@/lib/db/schema";
import { handle, json, readJson, requireApiUser } from "@/server/http";
import { createRun, createRunSchema } from "@/server/services/runs";
import { scheduleDrain } from "@/server/jobs/drain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Serverless hosting runs the queued work after the response (server/jobs/drain.ts).
export const maxDuration = 300;

export const POST = handle(async (req) => {
  const user = await requireApiUser(req);
  const input = await readJson(req, createRunSchema, 16 * 1024);
  const created = await createRun(user.id, input);
  scheduleDrain();
  return json(created, 201);
});

export const GET = handle(async (req) => {
  const user = await requireApiUser(req);
  const runs = await db()
    .select({
      id: agentRun.id,
      investigationId: agentRun.investigationId,
      task: agentRun.task,
      status: agentRun.status,
      taskCategory: agentRun.taskCategory,
      memoryMode: agentRun.memoryMode,
      toolCallCount: agentRun.toolCallCount,
      createdAt: agentRun.createdAt,
      completedAt: agentRun.completedAt,
    })
    .from(agentRun)
    .where(and(eq(agentRun.userId, user.id), eq(agentRun.isEvaluation, false)))
    .orderBy(desc(agentRun.createdAt))
    .limit(100);
  return json({ runs });
});
