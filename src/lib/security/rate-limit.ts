/**
 * Fixed-window rate limiting backed by PostgreSQL (works across instances,
 * no Redis needed).
 */
import { sql } from "drizzle-orm";
import { db, rowsOf } from "@/lib/db/client";

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  resetAt: Date;
}

export async function hitRateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const res = await db().execute(sql`
    insert into rate_limit_bucket (key, window_start, count)
    values (${key}, ${windowStart.toISOString()}::timestamptz, 1)
    on conflict (key, window_start) do update set count = rate_limit_bucket.count + 1
    returning count
  `);
  const count = Number(rowsOf<{ count: number }>(res)[0]?.count ?? 1);
  return { allowed: count <= limit, count, limit, resetAt: new Date(windowStart.getTime() + windowMs) };
}

export function clientIp(headers: Headers): string {
  return (headers.get("x-forwarded-for")?.split(",")[0] ?? headers.get("x-real-ip") ?? "unknown").trim().slice(0, 64);
}
