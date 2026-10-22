import { ApiError, handle, json, requireApiUser } from "@/server/http";
import { getMemoryTrace } from "@/server/services/memories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  const trace = await getMemoryTrace(user.id, id);
  if (!trace) throw new ApiError(404, "Memory not found", "not_found");
  const { content, idempotencyKey, ...memory } = trace.memory;
  void idempotencyKey;
  return json({ ...trace, memory: { ...memory, content } });
});
