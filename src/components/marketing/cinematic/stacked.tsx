"use client";

/**
 * The film as stacked chapters: phones, small tablets and reduced-motion
 * users. Same story and the same real panels, no scroll choreography.
 */
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/motion/primitives";
import { CHAPTERS, FINAL } from "./chapters";
import { RECORDED_RUN } from "./recorded-run";
import {
  Capsule,
  ClaimsPanel,
  EvidencePanel,
  HoloEmblem,
  HoloRings,
  PaidDecisionNote,
  PlanPanel,
  RECORDED_LABEL,
  StepsPanel,
  ToolCard,
  WorkspaceScreen,
} from "./visuals";

const CAPSULES = [
  { label: "Lessons", type: "failure", color: "#ff8fab" },
  { label: "Corrections", type: "correction", color: "#18ccf9" },
  { label: "Strategies", type: "strategy", color: "#7ef0c1" },
  { label: "Tool experience", type: "tool_reliability", color: "#8ea6ff" },
];

function Visual({ id }: { id: string }) {
  switch (id) {
    case "investigate":
      return (
        <figure>
          <div className="cine-screen overflow-hidden rounded-xl border-[6px] border-[#151a2e] dark:border-[#0b0f26]">
            <WorkspaceScreen />
          </div>
          <div className="cine-deck mx-auto h-3 w-[104%] -translate-x-[2%] rounded-b-2xl" aria-hidden />
        </figure>
      );
    case "execute":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <PlanPanel limit={6} />
          <StepsPanel from={6} to={13} title="Blockchain queries" />
        </div>
      );
    case "remember":
      return (
        <div className="flex flex-col items-center">
          <div className="relative flex h-64 w-full items-center justify-center overflow-hidden" aria-hidden>
            <div className="absolute opacity-70">
              <HoloRings size={300} />
            </div>
            <HoloEmblem size={150} />
          </div>
          <ul className="flex flex-wrap justify-center gap-2" aria-label="Kinds of lessons">
            {CAPSULES.map((c) => (
              <li key={c.type}>
                <Capsule {...c} />
              </li>
            ))}
          </ul>
        </div>
      );
    case "verify":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <ClaimsPanel />
          <EvidencePanel />
        </div>
      );
    case "optimize": {
      const states = { network_status: "called", evidence_cross_checker: "called", paid_forensic_analyzer: "held" } as const;
      return (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {RECORDED_RUN.plan
              .filter((t) => t.used || t.toolId === "paid_forensic_analyzer" || t.toolId === "tatum_transaction_inspector")
              .map((t) => (
                <ToolCard key={t.toolId} name={t.name} state={states[t.toolId as keyof typeof states] ?? "offered"} />
              ))}
          </div>
          <PaidDecisionNote className="text-scene-muted" />
        </div>
      );
    }
    default:
      return (
        <div className="flex flex-col items-center text-center">
          <HoloEmblem size={140} />
          <Link
            href={FINAL.cta.href}
            className="bg-brand-gradient mt-8 inline-flex h-12 items-center gap-2 rounded-full px-7 text-base font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {FINAL.cta.label} <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      );
  }
}

export function StackedChapters() {
  return (
    <ol className="mx-auto max-w-3xl space-y-20 px-4 pb-28 md:px-6">
      {CHAPTERS.map((c, i) => {
        const heading = c.beats.length ? c.beats.map((b) => b.text).join(" ") : FINAL.headline;
        return (
          <Reveal as="li" key={c.id}>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-scene-accent">
              {String(i + 1).padStart(2, "0")} · {c.label}
            </p>
            <h3 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-[-0.03em] text-scene-fg">{heading}</h3>
            <p className="mt-3 text-base leading-7 text-scene-muted">{c.id === "evolve" ? FINAL.body : c.summary}</p>
            <div className="mt-6">
              <Visual id={c.id} />
            </div>
            {c.source === "recorded" && <p className="mt-3 text-xs text-scene-muted">{RECORDED_LABEL}</p>}
            {c.source === "concept" && <p className="mt-3 text-xs text-scene-muted">Concept illustration of how lessons are kept, not a storage event.</p>}
          </Reveal>
        );
      })}
    </ol>
  );
}
