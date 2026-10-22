import { handle, json, requireApiUser } from "@/server/http";
import { listMemories, memoryFilterSchema } from "@/server/services/memories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const user = await requireApiUser(req);
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const filter = memoryFilterSchema.parse(params);
  return json({ memories: await listMemories(user.id, filter) });
});
