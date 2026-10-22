import { handle, json, requireApiUser } from "@/server/http";
import { retryRun } from "@/server/services/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handle(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  return json(await retryRun(user.id, id), 201);
});
