import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RunStep } from "./types";

const PHASES: Array<{ label: string; states: string[] }> = [
  { label: "Plan", states: ["CREATED", "PLANNING"] },
  { label: "Recall", states: ["RECALLING_MEMORY"] },
  { label: "Select tools", states: ["SELECTING_TOOLS"] },
  { label: "Investigate", states: ["EXECUTING", "AWAITING_APPROVAL"] },
  { label: "Verify", states: ["VERIFYING"] },
  { label: "Learn", states: ["REFLECTING", "SAVING_MEMORY"] },
];

const phaseOf = (state: string | null | undefined) => PHASES.findIndex((p) => state && p.states.includes(state));

/**
 * Where the run is in its lifecycle, derived only from the real run status and
 * the state steps the backend recorded. A stopped run shows the phase it
 * stopped in.
 */
export function RunProgress({ status, steps }: { status: string; steps: RunStep[] }) {
  const finished = status === "COMPLETED" || status === "PARTIALLY_COMPLETED";
  const stopped = status === "FAILED" || status === "CANCELLED";
  const lastPhase = [...steps].reverse().find((s) => s.kind === "state" && phaseOf(s.state) >= 0);
  const current = finished ? PHASES.length : stopped ? Math.max(0, phaseOf(lastPhase?.state)) : Math.max(0, phaseOf(status));

  return (
    <ol className="grid grid-cols-6 gap-1" aria-label="Investigation progress">
      {PHASES.map((p, i) => {
        const done = i < current;
        const active = i === current && !finished;
        return (
          <li key={p.label} aria-current={active ? "step" : undefined} className="flex min-w-0 flex-col gap-2">
            <div className="flex items-center gap-1">
              <span
                className={cn(
                  "relative flex size-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold",
                  done && "bg-brand-gradient border-transparent text-white",
                  active && !stopped && "border-primary bg-accent text-accent-foreground",
                  active && stopped && "border-destructive bg-danger-soft text-destructive",
                  !done && !active && "bg-muted text-muted-foreground",
                )}
              >
                {done ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : active && stopped ? <X className="size-3.5" aria-hidden /> : i + 1}
                {active && !stopped && <span className="pulse-dot absolute inset-0 rounded-full ring-2 ring-primary/40" aria-hidden />}
              </span>
              {i < PHASES.length - 1 && <span className={cn("h-0.5 flex-1 rounded-full", done ? "bg-brand-gradient" : "bg-border")} aria-hidden />}
            </div>
            <span className={cn("truncate text-[11px] font-medium sm:text-xs", done || active ? "text-foreground" : "text-muted-foreground")}>
              {p.label}
              <span className="sr-only">{done ? " (done)" : active ? (stopped ? " (stopped here)" : " (in progress)") : " (pending)"}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
