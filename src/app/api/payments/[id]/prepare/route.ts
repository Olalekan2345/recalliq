import { z } from "zod";
import { ApiError, handle, json, readJson, requireApiUser } from "@/server/http";
import { preparePaymentTransaction } from "@/server/services/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ walletAddress: z.string().regex(/^0x[0-9a-fA-F]{1,64}$/) });

export const POST = handle(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser(req);
  if (user.isGuest) throw new ApiError(403, "Guest sessions cannot authorize payments", "guest");
  const { id } = await ctx.params;
  const { walletAddress } = await readJson(req, bodySchema, 2 * 1024);
  return json(await preparePaymentTransaction(user.id, id, walletAddress));
});
