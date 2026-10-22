import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { user, userSettings } from "@/lib/db/schema";

export type UserSettingsRow = typeof userSettings.$inferSelect;

export async function getSettings(userId: string): Promise<UserSettingsRow> {
  const [row] = await db().select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  if (row) return row;
  const [created] = await db().insert(userSettings).values({ userId }).onConflictDoNothing().returning();
  if (created) return created;
  const [again] = await db().select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  return again!;
}

export async function isGuestUser(userId: string): Promise<boolean> {
  const [u] = await db().select({ isAnonymous: user.isAnonymous }).from(user).where(eq(user.id, userId)).limit(1);
  return Boolean(u?.isAnonymous);
}
