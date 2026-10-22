/**
 * Server-sent events for a run. Streams only rows the backend wrote to the
 * execution trail (agent_execution_step) plus status changes — the UI never
 * animates activity that did not happen. Works across processes (the worker
 * writes, the web server reads) and resumes from Last-Event-ID.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { env } from "@/lib/env";
import { agentRun } from "@/lib/db/schema";
import { ApiError, handle, requireApiUser } from "@/server/http";
import { startDrainAlongside } from "@/server/jobs/drain";
import { stepsAfter } from "@/server/services/investigations";
import { TERMINAL_STATES } from "@/server/services/steps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Serverless functions stop at maxDuration: the stream closes before that and EventSource reconnects with Last-Event-ID.
export const maxDuration = 300;

const POLL_MS = 800;
const MAX_STREAM_MS = 10 * 60_000;
const SERVERLESS_STREAM_MS = 270_000;

export const GET = handle(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  const [owned] = await db()
    .select({ id: agentRun.id, status: agentRun.status })
    .from(agentRun)
    .where(and(eq(agentRun.id, id), eq(agentRun.userId, user.id)))
    .limit(1);
  if (!owned) throw new ApiError(404, "Run not found", "not_found");

  // EventSource reconnects with the original ?after= and a newer Last-Event-ID header: resume from the later one.
  let last = Math.max(Number(new URL(req.url).searchParams.get("after")) || 0, Number(req.headers.get("last-event-id")) || 0);
  const serverless = env().WORKER_MODE === "serverless";
  const maxStreamMs = serverless ? SERVERLESS_STREAM_MS : MAX_STREAM_MS;
  // Without a worker process, whoever watches an unfinished run also keeps its queued work moving.
  if (!TERMINAL_STATES.has(owned.status)) startDrainAlongside();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      req.signal.addEventListener("abort", () => {
        closed = true;
      });
      const send = (event: string, data: unknown, eventId?: number) => {
        if (closed) return;
        const payload = JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
        controller.enqueue(encoder.encode(`${eventId ? `id: ${eventId}\n` : ""}event: ${event}\ndata: ${payload}\n\n`));
      };
      const started = Date.now();
      let lastStatus = "";
      let lastPing = Date.now();
      try {
        while (!closed && Date.now() - started < maxStreamMs) {
          const steps = await stepsAfter(user.id, id, last);
          for (const s of steps) {
            send("step", s, s.id);
            last = s.id;
          }
          const [run] = await db()
            .select({ status: agentRun.status, toolCallCount: agentRun.toolCallCount, updatedAt: agentRun.updatedAt })
            .from(agentRun)
            .where(eq(agentRun.id, id))
            .limit(1);
          if (run && run.status !== lastStatus) {
            lastStatus = run.status;
            send("status", run);
          }
          if (run && TERMINAL_STATES.has(run.status) && steps.length === 0) {
            send("end", { status: run.status });
            break;
          }
          if (Date.now() - lastPing > 15_000) {
            controller.enqueue(encoder.encode(": ping\n\n"));
            lastPing = Date.now();
          }
          await new Promise((r) => setTimeout(r, POLL_MS));
        }
      } catch {
        send("error", { message: "Event stream interrupted; reconnecting resumes from the last event." });
      } finally {
        if (!closed) controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
});
