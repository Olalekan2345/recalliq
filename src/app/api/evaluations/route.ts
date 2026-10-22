import { z } from "zod";
import { ApiError, handle, json, readJson, requireApiUser } from "@/server/http";
import { createEvaluation } from "@/lib/ai/evaluation/harness";
import { hitRateLimit } from "@/lib/security/rate-limit";
import { listEvaluations } from "@/server/services/learning";
import { scheduleDrain } from "@/server/jobs/drain";
import { getTool } from "@/lib/ai/tools/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Serverless hosting runs the queued work after the response (server/jobs/drain.ts).
export const maxDuration = 300;

const bodySchema = z.object({
  name: z.string().trim().min(3).max(120),
  tasks: z
    .array(z.object({ task: z.string().trim().min(3).max(2000), label: z.string().max(60).optional() }))
    .min(1)
    .max(12),
  faultInjection: z
    .object({ toolId: z.string(), mode: z.enum(["timeout", "error", "empty"]), label: z.string().trim().min(3).max(120) })
    .nullable()
    .optional(),
});

export const GET = handle(async (req) => {
  const user = await requireApiUser(req);
  return json({ evaluations: await listEvaluations(user.id) });
});

export const POST = handle(async (req) => {
  const user = await requireApiUser(req);
  if (user.isGuest) throw new ApiError(403, "Create an account to run evaluations", "guest");
  const rl = await hitRateLimit(`eval:${user.id}`, 4, 3600);
  if (!rl.allowed) throw new ApiError(429, "Evaluation limit reached for this hour", "rate_limited");
  const body = await readJson(req, bodySchema, 32 * 1024);
  if (body.faultInjection && (!getTool(body.faultInjection.toolId) || getTool(body.faultInjection.toolId)!.pricingType !== "free")) {
    throw new ApiError(400, "Fault injection must target a registered free tool", "invalid_fault");
  }
  const id = await createEvaluation(user.id, body);
  scheduleDrain();
  return json({ id }, 201);
});
