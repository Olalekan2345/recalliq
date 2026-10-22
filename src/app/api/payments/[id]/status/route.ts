import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { paymentIntent, paymentSettlement, paymentTransaction } from "@/lib/db/schema";
import { ApiError, handle, json, requireApiUser } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  const [intent] = await db()
    .select()
    .from(paymentIntent)
    .where(and(eq(paymentIntent.id, id), eq(paymentIntent.userId, user.id)))
    .limit(1);
  if (!intent) throw new ApiError(404, "Payment not found", "not_found");
  const [settlement] = await db().select().from(paymentSettlement).where(eq(paymentSettlement.intentId, id)).limit(1);
  const transactions = await db().select().from(paymentTransaction).where(eq(paymentTransaction.intentId, id));
  return json({ intent, settlement: settlement ?? null, transactions });
});
