/**
 * Live integration status (public: contains configuration state, never secrets).
 */
import { handle, json } from "@/server/http";
import { runHealthChecks } from "@/server/services/health";
import { clientIp, hitRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const rl = await hitRateLimit(`health:${clientIp(req.headers)}`, 30, 60).catch(() => ({ allowed: true }));
  if (!rl.allowed) return json({ error: "Too many requests" }, 429);
  const checks = await runHealthChecks(false);
  return json({ checkedAt: new Date().toISOString(), checks });
});
