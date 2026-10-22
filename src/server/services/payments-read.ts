/**
 * Payment Center read model. Distinguishes authorized vs settled spending and
 * shows only real, verified settlement data.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { connectedWallet, paymentAuthorization, paymentIntent, paymentSettlement, paymentTransaction } from "@/lib/db/schema";

export async function listPayments(userId: string) {
  const intents = await db().select().from(paymentIntent).where(eq(paymentIntent.userId, userId)).orderBy(desc(paymentIntent.createdAt)).limit(200);
  const ids = intents.map((i) => i.id);
  const [settlements, txs, auths] = ids.length
    ? await Promise.all([
        db().select().from(paymentSettlement).where(inArray(paymentSettlement.intentId, ids)),
        db().select().from(paymentTransaction).where(inArray(paymentTransaction.intentId, ids)),
        db()
          .select({
            intentId: paymentAuthorization.intentId,
            decision: paymentAuthorization.decision,
            walletAddress: paymentAuthorization.walletAddress,
            expectedDigest: paymentAuthorization.expectedDigest,
            createdAt: paymentAuthorization.createdAt,
          })
          .from(paymentAuthorization)
          .where(inArray(paymentAuthorization.intentId, ids)),
      ])
    : [[], [], []];
  return intents.map((i) => ({
    intent: i,
    authorization: auths.find((a) => a.intentId === i.id) ?? null,
    transactions: txs.filter((t) => t.intentId === i.id),
    settlement: settlements.find((s) => s.intentId === i.id) ?? null,
  }));
}

/** Totals per asset: settled (verified on chain) vs authorized-but-not-settled. */
export async function paymentTotals(userId: string) {
  const rows = await db()
    .select({
      asset: paymentIntent.asset,
      status: paymentIntent.status,
      total: sql<string>`coalesce(sum(${paymentIntent.amountAtomic}), 0)::text`,
      n: sql<number>`count(*)::int`,
      decimals: sql<number | null>`max(${paymentIntent.assetDecimals})`,
      symbol: sql<string | null>`max(${paymentIntent.assetSymbol})`,
    })
    .from(paymentIntent)
    .where(eq(paymentIntent.userId, userId))
    .groupBy(paymentIntent.asset, paymentIntent.status);
  return rows;
}

export async function pendingApprovals(userId: string) {
  return db()
    .select()
    .from(paymentIntent)
    .where(and(eq(paymentIntent.userId, userId), eq(paymentIntent.status, "awaiting_approval")))
    .orderBy(desc(paymentIntent.createdAt));
}

export async function listWallets(userId: string) {
  return db()
    .select({
      id: connectedWallet.id,
      address: connectedWallet.address,
      network: connectedWallet.network,
      verifiedAt: connectedWallet.verifiedAt,
      createdAt: connectedWallet.createdAt,
    })
    .from(connectedWallet)
    .where(eq(connectedWallet.userId, userId));
}
