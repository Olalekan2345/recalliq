/** Liveness/readiness probe for the hosting platform. */
import { checkDatabase } from "@/server/services/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const dbCheck = await checkDatabase();
  const ok = dbCheck.status === "ok";
  return new Response(JSON.stringify({ ok, database: dbCheck.status }), {
    status: ok ? 200 : 503,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
