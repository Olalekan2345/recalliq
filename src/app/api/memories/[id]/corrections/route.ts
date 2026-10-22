import { ApiError, handle, json, readJson, requireApiUser } from "@/server/http";
import { applyMemoryAction, memoryActionSchema } from "@/server/services/memories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handle(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser(req);
  if (user.isGuest) throw new ApiError(403, "Create an account to manage memories", "guest");
  const { id } = await ctx.params;
  const input = await readJson(req, memoryActionSchema, 8 * 1024);
  const res = await applyMemoryAction(user.id, id, input);
  if (!res) throw new ApiError(404, "Memory not found or not yours", "not_found");
  return json(res, 201);
});
