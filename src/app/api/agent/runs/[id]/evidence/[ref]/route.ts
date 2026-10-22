import { ApiError, handle, json, requireApiUser } from "@/server/http";
import { getEvidenceData } from "@/server/services/investigations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async (req, ctx: { params: Promise<{ id: string; ref: string }> }) => {
  const user = await requireApiUser(req);
  const { id, ref } = await ctx.params;
  if (!/^E\d{1,4}$/.test(ref)) throw new ApiError(400, "Invalid evidence reference", "invalid_ref");
  const row = await getEvidenceData(user.id, id, ref);
  if (!row) throw new ApiError(404, "Evidence not found", "not_found");
  return json(row);
});
