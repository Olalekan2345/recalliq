import { handle, json, requireApiUser } from "@/server/http";
import { listPayments, listWallets, paymentTotals } from "@/server/services/payments-read";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const user = await requireApiUser(req);
  const [payments, totals, wallets] = await Promise.all([listPayments(user.id), paymentTotals(user.id), listWallets(user.id)]);
  return json({ payments, totals, wallets });
});
