/**
 * Database handle. Production/dev use postgres.js against a real PostgreSQL
 * server; integration tests inject a migrated PGlite instance via
 * `setDbOverride` (PGlite is PostgreSQL compiled to WASM, not a mock).
 */
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

const g = globalThis as unknown as {
  __recalliqDb?: Database;
  __recalliqSql?: postgres.Sql;
  __recalliqDbOverride?: Database;
};

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is not configured");
    this.name = "DatabaseNotConfiguredError";
  }
}

export function db(): Database {
  if (g.__recalliqDbOverride) return g.__recalliqDbOverride;
  if (g.__recalliqDb) return g.__recalliqDb;
  const url = env().DATABASE_URL;
  if (!url) throw new DatabaseNotConfiguredError();
  const sql = postgres(url, {
    max: env().DATABASE_POOL_MAX,
    idle_timeout: 30,
    connect_timeout: 15,
    prepare: false,
    onnotice: () => {},
  });
  g.__recalliqSql = sql;
  g.__recalliqDb = drizzle(sql, { schema });
  return g.__recalliqDb;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(g.__recalliqDbOverride || env().DATABASE_URL);
}

/** Tests only: route every query to an injected database. */
export function setDbOverride(database: Database | undefined): void {
  g.__recalliqDbOverride = database;
}

export async function closeDb(): Promise<void> {
  if (g.__recalliqSql) {
    await g.__recalliqSql.end({ timeout: 5 });
    g.__recalliqSql = undefined;
    g.__recalliqDb = undefined;
  }
}

/** Rows from `db.execute(sql)`: postgres.js returns an array, PGlite returns `{ rows }`. */
export function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: unknown } | null)?.rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

export { schema };
