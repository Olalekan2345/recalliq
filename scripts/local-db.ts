/**
 * Zero-install local PostgreSQL for development (real PostgreSQL binaries via
 * embedded-postgres; data persisted in .data/postgres).
 *
 *   pnpm dev:db
 *   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54330/recalliq
 *
 * Production uses any managed PostgreSQL 15+ (Neon, Supabase, RDS, Railway…).
 */
import EmbeddedPostgres from "embedded-postgres";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const port = Number(process.env.RECALLIQ_LOCAL_DB_PORT ?? 54330);
const dataDir = path.join(process.cwd(), ".data", "postgres");
const fresh = !existsSync(path.join(dataDir, "PG_VERSION"));
mkdirSync(path.dirname(dataDir), { recursive: true });

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "postgres",
  password: "postgres",
  port,
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: () => {},
  onError: (e) => console.error(String(e)),
});

if (fresh) {
  console.log("Initialising a new local PostgreSQL cluster…");
  await pg.initialise();
}
await pg.start();
if (fresh) {
  await pg.createDatabase("recalliq");
  await pg.createDatabase("recalliq_e2e");
}

console.log(`RecallIQ local PostgreSQL listening on 127.0.0.1:${port}`);
console.log(`DATABASE_URL=postgres://postgres:postgres@127.0.0.1:${port}/recalliq`);
if (fresh) console.log("Next: pnpm db:migrate");

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  await pg.stop();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
setInterval(() => {}, 1 << 30);
