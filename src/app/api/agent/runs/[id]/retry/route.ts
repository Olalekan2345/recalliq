import { handle, json, requireApiUser } from "@/server/http";
import { retryRun } from "@/server/services/runs";
import { scheduleDrain } from "@/server/jobs/drain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Serverless hosting runs the queued work after the response (server/jobs/drain.ts).
export const maxDuration = 300;

export const POST = handle(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  const created = await retryRun(user.id, id);
  scheduleDrain();
  return json(created, 201);
});
