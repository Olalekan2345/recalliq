/**
 * Drains the job queue when there is no worker process (WORKER_MODE=serverless,
 * on Vercel). Vercel Cron calls it once a day (GET: a backstop that also
 * records integration health), and a drain that ran out of time for an agent
 * run calls it to continue in a fresh function (POST). Both must present
 * CRON_SECRET as a bearer token; the work runs after the 202 response.
 */
import { after } from "next/server";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/security/ids";
import { logger } from "@/lib/logging/logger";
import { safeErrorMessage } from "@/lib/security/redact";
import { drainJobs } from "@/server/jobs/drain";
import { runHealthChecks } from "@/server/services/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const log = logger("drain-route");

function trigger(req: Request, recordHealth: boolean): Response {
  const secret = env().CRON_SECRET;
  if (!secret || !safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return Response.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 });
  }
  if (env().WORKER_MODE !== "serverless") {
    return Response.json({ error: "A worker process runs jobs on this deployment", code: "not_serverless" }, { status: 409 });
  }
  after(async () => {
    try {
      const res = await drainJobs();
      log.info("drain finished", { ...res });
      if (recordHealth) await runHealthChecks(true);
    } catch (err) {
      log.error("drain failed", { err: safeErrorMessage(err) });
    }
  });
  return Response.json({ accepted: true }, { status: 202 });
}

export const GET = (req: Request) => trigger(req, true);
export const POST = (req: Request) => trigger(req, false);
