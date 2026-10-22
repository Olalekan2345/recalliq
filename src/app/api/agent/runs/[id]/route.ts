import { ApiError, handle, json, requireApiUser } from "@/server/http";
import { getRunDetail } from "@/server/services/investigations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  const detail = await getRunDetail(user.id, id);
  if (!detail) throw new ApiError(404, "Run not found", "not_found");
  return json(detail);
});
