/**
 * Server-sent events for a run. Streams only rows the backend wrote to the
 * execution trail (agent_execution_step) plus status changes — the UI never
 * animates activity that did not happen. Works across processes (the worker
 * writes, the web server reads) and resumes from Last-Event-ID.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { agentRun } from "@/lib/db/schema";
import { ApiError, handle, requireApiUser } from "@/server/http";
import { stepsAfter } from "@/server/services/investigations";
import { TERMINAL_STATES } from "@/server/services/steps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POLL_MS = 800;
const MAX_STREAM_MS = 10 * 60_000;

export const GET = handle(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  const [owned] = await db()
    .select({ id: agentRun.id })
    .from(agentRun)
    .where(and(eq(agentRun.id, id), eq(agentRun.userId, user.id)))
    .limit(1);
  if (!owned) throw new ApiError(404, "Run not found", "not_found");

  let last = Number(new URL(req.url).searchParams.get("after") ?? req.headers.get("last-event-id") ?? 0) || 0;
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
        while (!closed && Date.now() - started < MAX_STREAM_MS) {
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
