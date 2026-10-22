/**
 * Apply version-controlled migrations from ./drizzle to DATABASE_URL.
 *   pnpm db:migrate
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import path from "node:path";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Start a local database with `pnpm dev:db` or point it at your PostgreSQL server.");
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  await migrate(drizzle(sql), { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  console.log("Migrations applied.");
} catch (err) {
  console.error("Migration failed:", (err as Error).message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
