/**
 * API route helpers: authentication, same-origin protection for state-changing
 * requests, bounded JSON parsing and uniform, secret-free error responses.
 */
import "server-only";
import { ZodError, type z } from "zod";
import { DatabaseNotConfiguredError } from "@/lib/db/client";
import { env } from "@/lib/env";
import { logger } from "@/lib/logging/logger";
import { safeErrorMessage } from "@/lib/security/redact";
import { getSessionUser, type SessionUser } from "@/lib/auth/session";
import { PaymentAuthorizationError } from "@/server/services/payments";
import { RunRequestError } from "@/server/services/runs";

const log = logger("api");

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code = "error",
  ) {
    super(message);
  }
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(
    JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
    {
      status,
      headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
    },
  );
}

export async function requireApiUser(req: Request): Promise<SessionUser> {
  const user = await getSessionUser(req.headers);
  if (!user) throw new ApiError(401, "Sign in required", "unauthenticated");
  return user;
}

/** Reject cross-site state-changing requests (defence in depth on top of SameSite cookies). */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  if (!origin) return; // non-browser clients (no ambient cookies across sites)
  const allowed = new URL(env().NEXT_PUBLIC_APP_URL).origin;
  const self = new URL(req.url).origin;
  if (origin !== allowed && origin !== self) throw new ApiError(403, "Cross-origin request rejected", "bad_origin");
}

export async function readJson<T>(req: Request, schema: z.ZodType<T>, maxBytes = 64 * 1024): Promise<T> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > maxBytes) throw new ApiError(413, "Request body too large", "too_large");
  const text = await req.text();
  if (text.length > maxBytes) throw new ApiError(413, "Request body too large", "too_large");
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(400, "Invalid JSON", "invalid_json");
  }
  return schema.parse(data);
}

export function handle<Ctx>(fn: (req: Request, ctx: Ctx) => Promise<Response>) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof ApiError) return json({ error: err.message, code: err.code }, err.status);
      if (err instanceof RunRequestError) return json({ error: err.message, code: err.code }, err.status);
      if (err instanceof PaymentAuthorizationError) return json({ error: err.message, code: "payment_error" }, err.status);
      if (err instanceof ZodError) {
        return json(
          { error: "Invalid request", code: "invalid_request", issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
          400,
        );
      }
      if (err instanceof DatabaseNotConfiguredError) return json({ error: "Database is not configured on this deployment", code: "db_unconfigured" }, 503);
      log.error("unhandled api error", { path: new URL(req.url).pathname, err: safeErrorMessage(err) });
      return json({ error: "Internal error", code: "internal" }, 500);
    }
  };
}
