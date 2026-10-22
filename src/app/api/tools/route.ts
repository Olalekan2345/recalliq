import { handle, json, requireApiUser } from "@/server/http";
import { listToolsWithStats } from "@/server/services/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const user = await requireApiUser(req);
  return json({ tools: await listToolsWithStats(user.id) });
});
