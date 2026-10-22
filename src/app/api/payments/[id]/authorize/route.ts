/**
 * The user's explicit decision on one payment request. Approval carries the
 * transaction the user's own wallet signed (never a key). Trusted code
 * re-checks the spending policy and verifies the signed bytes before anything
 * is broadcast.
 */
import { z } from "zod";
import { ApiError, handle, json, readJson, requireApiUser } from "@/server/http";
import { authorizePayment } from "@/server/services/payments";
import { scheduleDrain } from "@/server/jobs/drain";
import { hitRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Serverless hosting runs the queued work after the response (server/jobs/drain.ts).
export const maxDuration = 300;

const bodySchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("rejected") }),
  z.object({
    decision: z.literal("approved"),
    walletAddress: z.string().regex(/^0x[0-9a-fA-F]{1,64}$/),
    transactionBytes: z.string().min(16).max(64_000),
    signature: z.string().min(16).max(16_000),
  }),
]);

export const POST = handle(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser(req);
  if (user.isGuest) throw new ApiError(403, "Guest sessions cannot authorize payments", "guest");
  const rl = await hitRateLimit(`pay-auth:${user.id}`, 20, 600);
  if (!rl.allowed) throw new ApiError(429, "Too many payment decisions; slow down", "rate_limited");
  const { id } = await ctx.params;
  const body = await readJson(req, bodySchema, 96 * 1024);
  const result = await authorizePayment(user.id, id, body);
  scheduleDrain();
  return json(result);
});
