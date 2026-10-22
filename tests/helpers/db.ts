/**
 * Isolated, fully migrated PostgreSQL (PGlite = Postgres compiled to WASM) per
 * test suite. Applies the same SQL migrations as production.
 */
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { setDbOverride, type Database } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { newId } from "@/lib/security/ids";

export async function setupTestDb(): Promise<{ db: Database; close: () => Promise<void> }> {
  const pglite = new PGlite();
  await pglite.waitReady;
  const db = drizzle(pglite, { schema });
  await migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  setDbOverride(db as unknown as Database);
  return {
    db: db as unknown as Database,
    close: async () => {
      setDbOverride(undefined);
      await pglite.close();
    },
  };
}

export async function createUser(db: Database, opts: { guest?: boolean } = {}) {
  const id = newId();
  await db.insert(schema.user).values({ id, name: "Test User", email: `${id}@example.test`, emailVerified: false, isAnonymous: opts.guest ?? false });
  return id;
}
