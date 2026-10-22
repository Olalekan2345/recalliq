/** Print the live state of every integration. `pnpm health` */
import "dotenv/config";
import { closeDb } from "@/lib/db/client";
import { runHealthChecks } from "@/server/services/health";

const checks = await runHealthChecks(Boolean(process.env.DATABASE_URL));
for (const c of checks) {
  console.log(`${c.integration.padEnd(9)} ${c.status.padEnd(13)} ${c.latencyMs !== null ? `${c.latencyMs}ms`.padEnd(8) : "".padEnd(8)} ${c.detail}`);
}
await closeDb();
process.exit(checks.some((c) => c.status === "down") ? 1 : 0);
