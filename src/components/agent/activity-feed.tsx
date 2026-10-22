"use client";

import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  CircleDollarSign,
  Cpu,
  Database,
  Flag,
  ListChecks,
  MessageSquareText,
  Microscope,
  Radio,
  Search,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { RunStep } from "./types";

const ICON: Record<string, typeof Search> = {
  state: Flag,
  plan: ListChecks,
  memory_recall: BrainCircuit,
  memory_filter: BrainCircuit,
  tool_selection: Wrench,
  tool_call: Search,
  tool_result: Database,
  model: MessageSquareText,
  payment: CircleDollarSign,
  verification: ShieldCheck,
  autopsy: Microscope,
  memory_write: BrainCircuit,
  notice: Radio,
  error: AlertTriangle,
};

function toneFor(step: RunStep): string {
  if (step.kind === "error") return "border-transparent bg-danger-soft text-destructive";
  if (step.kind === "verification") {
    if (step.title.includes("CONTRADICTED")) return "border-transparent bg-danger-soft text-destructive";
    if (step.title.includes("VERIFIED")) return "border-transparent bg-success-soft text-success";
  }
  if (step.kind === "payment") return "border-transparent bg-warning-soft text-warning";
  if (step.kind === "memory_recall" || step.kind === "memory_write") return "border-transparent bg-accent text-accent-foreground";
  if (step.kind === "state") return "border-transparent bg-info-soft text-primary";
  return "bg-card text-muted-foreground";
}

export function ActivityFeed({ steps, live }: { steps: RunStep[]; live: boolean }) {
  if (steps.length === 0) {
    return <p className="text-sm text-muted-foreground">{live ? "Waiting for the worker to pick up this investigation…" : "No activity recorded."}</p>;
  }
  return (
    <ol className="relative space-y-0.5" aria-live="polite" aria-relevant="additions">
      {steps.map((s, i) => {
        const Icon = s.kind === "state" && (s.state === "COMPLETED" || s.state === "PARTIALLY_COMPLETED") ? CheckCircle2 : (ICON[s.kind] ?? Cpu);
        const last = i === steps.length - 1;
        return (
          <li key={s.id} className="relative flex gap-3 pb-3 animate-in-fade">
            {!last && (
              <span className="absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-px bg-gradient-to-b from-brand-cyan/40 via-border to-border" aria-hidden />
            )}
            <span className={cn("relative mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border", toneFor(s))}>
              <Icon className="size-3.5" aria-hidden />
              {last && live && <span className="pulse-dot absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary" aria-hidden />}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className={cn("text-sm", s.kind === "state" ? "font-display font-semibold" : "")}>{s.title}</p>
              <p className="text-xs text-muted-foreground">
                <time dateTime={s.createdAt}>{new Date(s.createdAt).toLocaleTimeString()}</time>
                {s.kind !== "state" && <span> · {s.kind.replace(/_/g, " ")}</span>}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
