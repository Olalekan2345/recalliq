/**
 * Next.js instrumentation hook. With WORKER_MODE=inline (default) the durable
 * job worker runs inside the Node.js server process — suitable for a single
 * long-running service. On Vercel set WORKER_MODE=serverless: requests drain
 * the queue themselves (server/jobs/drain.ts). Or set WORKER_MODE=external and
 * run `pnpm worker` as its own service.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const mode = process.env.WORKER_MODE ?? "inline";
  if (mode !== "inline" || !process.env.DATABASE_URL) return;
  const g = globalThis as unknown as { __recalliqWorkerStarted?: boolean };
  if (g.__recalliqWorkerStarted) return;
  g.__recalliqWorkerStarted = true;
  const { startWorker } = await import("./server/jobs/worker");
  startWorker();
}
