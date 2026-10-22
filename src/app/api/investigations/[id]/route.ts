import { ApiError, handle, json, requireApiUser } from "@/server/http";
import { getInvestigation } from "@/server/services/investigations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  const inv = await getInvestigation(user.id, id);
  if (!inv) throw new ApiError(404, "Investigation not found", "not_found");
  return json(inv);
});
