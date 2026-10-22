/**
 * Execution trail writer. Every UI activity event comes from a row written
 * here by the backend at the moment the operation actually happened.
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { agentExecutionStep, agentRun, investigation, type StepKind } from "@/lib/db/schema";
import { logger } from "@/lib/logging/logger";

const log = logger("steps");

export type RunStatus = (typeof agentRun.$inferSelect)["status"];

export async function recordStep(
  run: { id: string; userId: string },
  kind: StepKind,
  title: string,
  detail?: Record<string, unknown> | null,
  state?: RunStatus,
): Promise<void> {
  try {
    await db()
      .insert(agentExecutionStep)
      .values({
        runId: run.id,
        userId: run.userId,
        kind,
        title: title.slice(0, 300),
        detail: detail ?? null,
        state: state ?? null,
      });
  } catch (err) {
    // The trail must never break the run itself.
    log.error("failed to record step", { runId: run.id, kind, err });
  }
}

export const TERMINAL_STATES: ReadonlySet<RunStatus> = new Set(["COMPLETED", "PARTIALLY_COMPLETED", "FAILED", "CANCELLED"]);

/** Allowed state transitions — enforced on every status change. */
const TRANSITIONS: Record<RunStatus, RunStatus[]> = {
  CREATED: ["PLANNING", "CANCELLED", "FAILED"],
  PLANNING: ["RECALLING_MEMORY", "SELECTING_TOOLS", "CANCELLED", "FAILED"],
  RECALLING_MEMORY: ["SELECTING_TOOLS", "CANCELLED", "FAILED"],
  SELECTING_TOOLS: ["EXECUTING", "CANCELLED", "FAILED"],
  EXECUTING: ["AWAITING_APPROVAL", "VERIFYING", "PARTIALLY_COMPLETED", "CANCELLED", "FAILED"],
  AWAITING_APPROVAL: ["EXECUTING", "CANCELLED", "FAILED"],
  VERIFYING: ["REFLECTING", "COMPLETED", "PARTIALLY_COMPLETED", "CANCELLED", "FAILED"],
  REFLECTING: ["SAVING_MEMORY", "COMPLETED", "PARTIALLY_COMPLETED", "CANCELLED", "FAILED"],
  SAVING_MEMORY: ["COMPLETED", "PARTIALLY_COMPLETED", "CANCELLED", "FAILED"],
  COMPLETED: [],
  PARTIALLY_COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};

export function canTransition(from: RunStatus, to: RunStatus): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

export class InvalidTransitionError extends Error {
  constructor(from: RunStatus, to: RunStatus) {
    super(`Invalid run transition ${from} → ${to}`);
    this.name = "InvalidTransitionError";
  }
}

/** Persist a state transition (validated) and emit a state step. */
export async function transition(
  run: { id: string; userId: string; investigationId: string },
  from: RunStatus,
  to: RunStatus,
  title: string,
  detail?: Record<string, unknown>,
): Promise<RunStatus> {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
  const now = new Date();
  await db()
    .update(agentRun)
    .set({
      status: to,
      updatedAt: now,
      ...(TERMINAL_STATES.has(to) ? { completedAt: now } : {}),
      ...(from === "CREATED" ? { startedAt: now } : {}),
    })
    .where(eq(agentRun.id, run.id));
  await db().update(investigation).set({ lastStatus: to, updatedAt: now }).where(eq(investigation.id, run.investigationId));
  await recordStep(run, "state", title, detail ?? null, to);
  return to;
}
