import { handle, json, requireApiUser } from "@/server/http";
import { cancelRun } from "@/server/services/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handle(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  return json(await cancelRun(user.id, id));
});
