/**
 * Rebuild the relayer's vector index for a namespace from Walrus-backed data
 * (MemWal `restore`). Use when recall unexpectedly returns nothing.
 *   pnpm walrus:restore <namespace> [limit]
 */
import "dotenv/config";
import { memoryStore } from "@/lib/memory/memwal/store";

const [namespace, limitArg] = process.argv.slice(2);
if (!namespace) {
  console.error("Usage: pnpm walrus:restore <namespace> [limit]");
  process.exit(1);
}
const store = memoryStore();
if (!store) {
  console.error("Walrus Memory is not configured (MEMWAL_KEY / MEMWAL_ACCOUNT_ID).");
  process.exit(1);
}
const res = await store.restore(namespace, limitArg ? Number(limitArg) : 100);
console.log(JSON.stringify(res, null, 2));
