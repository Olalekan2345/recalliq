import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { userSettings } from "@/lib/db/schema";
import { ApiError, handle, json, readJson, requireApiUser } from "@/server/http";
import { getSettings } from "@/server/services/settings";
import { listWallets } from "@/server/services/payments-read";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const atomicOrNull = z
  .string()
  .regex(/^\d{1,30}$/, "Atomic units (integer)")
  .nullable()
  .optional();

const patchSchema = z.object({
  analysisDepth: z.enum(["standard", "deep"]).optional(),
  memoryEnabled: z.boolean().optional(),
  paidToolsEnabled: z.boolean().optional(),
  perPaymentLimitAtomic: atomicOrNull,
  perRunLimitAtomic: atomicOrNull,
  dailyLimitAtomic: atomicOrNull,
  notifyOnPaymentRequest: z.boolean().optional(),
});

export const GET = handle(async (req) => {
  const user = await requireApiUser(req);
  const [settings, wallets] = await Promise.all([getSettings(user.id), listWallets(user.id)]);
  return json({ user, settings, wallets });
});

export const PATCH = handle(async (req) => {
  const user = await requireApiUser(req);
  if (user.isGuest) throw new ApiError(403, "Create an account to change settings", "guest");
  const body = await readJson(req, patchSchema, 4 * 1024);
  await getSettings(user.id);
  const [updated] = await db()
    .update(userSettings)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(userSettings.userId, user.id))
    .returning();
  return json({ settings: updated });
});
