/** Upsert the static tool registry into tool_definition. `pnpm tools:sync` */
import "dotenv/config";
import { closeDb } from "@/lib/db/client";
import { syncToolDefinitions } from "@/lib/ai/tools/registry";

await syncToolDefinitions();
console.log("Tool definitions synced.");
await closeDb();
