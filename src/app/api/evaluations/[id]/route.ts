import { ApiError, handle, json, requireApiUser } from "@/server/http";
import { getEvaluation } from "@/server/services/learning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  const ev = await getEvaluation(user.id, id);
  if (!ev) throw new ApiError(404, "Evaluation not found", "not_found");
  return json(ev);
});
