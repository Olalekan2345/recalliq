/**
 * Dedicated worker process: `pnpm worker`.
 * Use with WORKER_MODE=external on the web service.
 */
import "dotenv/config";
import { closeDb } from "@/lib/db/client";
import { logger } from "@/lib/logging/logger";
import { startWorker } from "./worker";

const log = logger("worker-main");

// protobuf-ts' grpc transport can throw "cannot resolve rejected" from an event
// callback after a call already failed. It is harmless (the call's promise has
// rejected and was handled); anything else is a real crash.
process.on("uncaughtException", (err) => {
  if (/cannot resolve rejected/.test(err?.message ?? "")) {
    log.warn("ignored late grpc deferred resolution", { msg: err.message });
    return;
  }
  log.error("uncaught exception — exiting", { err });
  process.exit(1);
});

const handle = startWorker();

async function shutdown(signal: string) {
  log.info("shutting down", { signal });
  await handle.stop();
  await closeDb();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
