import { handle, json, requireApiUser } from "@/server/http";
import { listInvestigations } from "@/server/services/investigations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const user = await requireApiUser(req);
  return json({ investigations: await listInvestigations(user.id) });
});
