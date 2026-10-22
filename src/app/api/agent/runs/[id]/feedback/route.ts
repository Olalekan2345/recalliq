import { ApiError, handle, json, readJson, requireApiUser } from "@/server/http";
import { feedbackSchema, submitFeedback } from "@/server/services/investigations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handle(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  const input = await readJson(req, feedbackSchema, 8 * 1024);
  const res = await submitFeedback(user.id, id, input);
  if (!res) throw new ApiError(404, "Run not found", "not_found");
  return json(res, 201);
});
