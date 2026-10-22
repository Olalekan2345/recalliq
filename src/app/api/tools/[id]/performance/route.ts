import { ApiError, handle, json, requireApiUser } from "@/server/http";
import { getTool } from "@/lib/ai/tools/registry";
import { toolLessons, toolRecentObservations } from "@/server/services/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  if (!getTool(id)) throw new ApiError(404, "Unknown tool", "not_found");
  const [observations, lessons] = await Promise.all([toolRecentObservations(id), toolLessons(user.id, id)]);
  return json({ toolId: id, observations, lessons });
});
