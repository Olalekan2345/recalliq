/**
 * Authentication (Better Auth): email + password accounts and limited
 * anonymous guest sessions. Sessions are database-backed, httpOnly cookies.
 * A guest who signs up keeps their investigations (onLinkAccount).
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { anonymous } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { authSecret, env } from "@/lib/env";
import { logger } from "@/lib/logging/logger";

const log = logger("auth");

/** Tables whose rows move from a guest to the account they create. */
const OWNED_TABLES = [
  s.investigation,
  s.agentRun,
  s.agentMessage,
  s.agentExecutionStep,
  s.toolExecution,
  s.evidenceRecord,
  s.verificationResult,
  s.agentFailure,
  s.memoryUsage,
  s.toolPerformanceObservation,
  s.runFeedback,
] as const;

function createAuth() {
  const e = env();
  const secret = authSecret();
  if (!secret && e.NODE_ENV === "production") throw new Error("BETTER_AUTH_SECRET is required in production");
  return betterAuth({
    appName: "RecallIQ",
    baseURL: e.NEXT_PUBLIC_APP_URL,
    secret: secret ?? "dev-only-insecure-secret-change-me-0123456789",
    database: drizzleAdapter(db(), {
      provider: "pg",
      schema: { user: s.user, session: s.session, account: s.account, verification: s.verification },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      autoSignIn: true,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 14,
      updateAge: 60 * 60 * 24,
    },
    rateLimit: { enabled: true, window: 60, max: 30 },
    advanced: {
      useSecureCookies: e.NEXT_PUBLIC_APP_URL.startsWith("https://"),
      database: { generateId: () => crypto.randomUUID() },
    },
    plugins: [
      anonymous({
        emailDomainName: "guest.recalliq.local",
        onLinkAccount: async ({ anonymousUser, newUser }) => {
          const from = anonymousUser.user.id;
          const to = newUser.user.id;
          for (const table of OWNED_TABLES) {
            await db()
              .update(table)
              .set({ userId: to } as never)
              .where(eq(table.userId, from));
          }
          log.info("guest data linked to new account", { from, to });
        },
      }),
      nextCookies(),
    ],
  });
}

type Auth = ReturnType<typeof createAuth>;
const g = globalThis as unknown as { __recalliqAuth?: Auth };

export function auth(): Auth {
  if (!g.__recalliqAuth) g.__recalliqAuth = createAuth();
  return g.__recalliqAuth;
}
