"use client";

import { useRef } from "react";
import { m, useTransform, type MotionValue } from "motion/react";
import { Check, DatabaseZap, History, Inbox, MessageSquareText, Microscope, Search, ShieldCheck, Workflow } from "lucide-react";
import { Mascot } from "@/components/brand/mascot";
import { MaskedHeading, Reveal, useSceneProgress, useAmbientMotion } from "@/components/motion/primitives";
import { Aurora, Eyebrow, Scene } from "./scene";

/** The exact step titles recorded for every run (see lib/ai/orchestrator/run-agent.ts). */
const STEPS = [
  { title: "Investigation queued", icon: Inbox },
  { title: "Understanding the request", icon: MessageSquareText },
  { title: "Retrieving relevant memories from Walrus", icon: History },
  { title: "Selecting tools (WorthIt Intelligence)", icon: Workflow },
  { title: "Investigating", icon: Search },
  { title: "Verifying claims against fresh chain data", icon: ShieldCheck },
  { title: "Running agent autopsy", icon: Microscope },
  { title: "Saving useful lessons", icon: DatabaseZap },
];

const STAGES = [
  { title: "Your request", body: "Ask in plain language. Addresses and digests are extracted and validated before anything runs." },
  { title: "Memory recall", body: "Lessons from earlier sessions are recalled from Walrus by meaning, then checked for provenance." },
  { title: "Tool selection", body: "WorthIt ranks tools by relevance and measured reliability, and decides whether paid analysis may be offered." },
  { title: "Real execution", body: "The agent calls live Tatum Sui tools. Every record it reads is kept as evidence with its source." },
  { title: "Verification", body: "Each claim is re-checked against fresh chain reads, and every value in the answer must match the evidence." },
  { title: "Learning", body: "The autopsy turns proven mistakes, and proven strategies, into lessons stored on Walrus." },
];

/** Scene C: the agent's real pipeline, shown as a floating panel that straightens as you scroll. */
export function InsideAgent() {
  const ref = useRef<HTMLDivElement>(null);
  const progress = useSceneProgress(ref, ["start 0.95", "end 0.6"]);
  // Static until hydrated (matches the server HTML), then follows the user's motion preference.
  const reduced = !useAmbientMotion();
  const rotateX = useTransform(progress, [0, 0.45], reduced ? [0, 0] : [26, 0]);
  const rotateZ = useTransform(progress, [0, 0.45], reduced ? [0, 0] : [-5, 0]);
  const scale = useTransform(progress, [0, 0.45], reduced ? [1, 1] : [0.88, 1]);
  const y = useTransform(progress, [0, 0.45], reduced ? [0, 0] : [80, 0]);

  return (
    <Scene id="how" labelledBy="how-title" tone="white" from="lavender" className="isolate overflow-hidden">
      <Aurora variant="cyan" />
      <div className="mx-auto max-w-6xl px-4 py-28 md:px-6 md:py-36">
        <div className="grid items-end gap-10 lg:grid-cols-[minmax(0,1fr)_180px]">
          <div className="max-w-3xl">
            <Eyebrow>The pipeline</Eyebrow>
            <MaskedHeading
              id="how-title"
              lines={["Every run follows the", "same honest path."]}
              wordClassName={(l) => (l === 1 ? "brand-gradient-text" : undefined)}
              className="mt-5 font-display text-4xl font-semibold leading-[1.08] tracking-[-0.03em] md:text-6xl"
            />
            <Reveal>
              <p className="mt-6 max-w-2xl text-base leading-7 text-scene-muted md:text-lg">
                From your question to a lesson on Walrus. Every stage is recorded as it happens and streamed live into your Workspace.
              </p>
            </Reveal>
          </div>
          {/* The "IQ" walrus marks the AI part of the story. */}
          <Reveal className="hidden lg:block">
            <figure className="-rotate-3 overflow-hidden rounded-3xl border border-scene-line shadow-[0_30px_60px_-30px_rgb(16_28_68/0.45)]">
              <Mascot variant="developer" sizes="180px" className="h-auto w-full" />
            </figure>
          </Reveal>
        </div>

        <div ref={ref} className="mt-16 grid items-start gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-16">
          <div className="perspective-1200 lg:sticky lg:top-28">
            <m.figure style={{ rotateX, rotateZ, scale, y }} className="glass-scene preserve-3d relative rounded-3xl p-5 md:p-7">
              <div className="flex items-center gap-2 border-b border-scene-line pb-4">
                <span className="size-2.5 rounded-full bg-[#ff6b8b]/70" aria-hidden />
                <span className="size-2.5 rounded-full bg-[#ffd166]/70" aria-hidden />
                <span className="size-2.5 rounded-full bg-[#5fe0ff]/70" aria-hidden />
                <span className="ml-3 text-sm font-medium">Agent activity</span>
                <span className="ml-auto rounded-full border border-scene-line px-2 py-0.5 text-[11px] text-scene-muted">run lifecycle</span>
              </div>
              <ol className="relative mt-5 space-y-1">
                <span
                  className="absolute bottom-4 left-[17px] top-4 w-px bg-gradient-to-b from-brand-cyan/60 via-brand-blue/40 to-brand-violet/50"
                  aria-hidden
                />
                {STEPS.map((s, i) => (
                  <Step key={s.title} step={s} index={i} progress={progress} />
                ))}
              </ol>
              <figcaption className="mt-5 border-t border-scene-line pt-4 text-xs leading-5 text-scene-muted">
                Illustration: the stage names RecallIQ records for every run. Live runs stream these, with their evidence, in the Workspace.
              </figcaption>
            </m.figure>
          </div>

          <ol className="space-y-3">
            {STAGES.map((s, i) => (
              <Reveal
                as="li"
                key={s.title}
                delay={i * 0.05}
                className="rounded-2xl border border-scene-line bg-scene-raise p-5 transition-colors hover:bg-scene-raise-strong"
              >
                <div className="flex items-baseline gap-4">
                  <span className="font-mono text-xs text-scene-accent tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <h3 className="font-display text-lg font-semibold">{s.title}</h3>
                    <p className="mt-1.5 text-sm leading-6 text-scene-muted">{s.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </div>
    </Scene>
  );
}

function Step({ step, index, progress }: { step: (typeof STEPS)[number]; index: number; progress: MotionValue<number> }) {
  const at = 0.18 + index * 0.06;
  const opacity = useTransform(progress, [at - 0.05, at], [0.38, 1]);
  const done = useTransform(progress, [at, at + 0.02], [0, 1]);
  const Icon = step.icon;
  return (
    <m.li style={{ opacity }} className="relative flex items-center gap-3 rounded-xl px-1 py-2">
      <span className="relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full border border-scene-line bg-scene-raise-strong shadow-sm">
        <Icon className="size-4 text-scene-accent" aria-hidden />
        <m.span
          style={{ opacity: done, scale: done }}
          className="bg-brand-gradient absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full"
          aria-hidden
        >
          <Check className="size-2.5 text-white" strokeWidth={3} />
        </m.span>
      </span>
      <span className="text-sm md:text-[15px]">{step.title}</span>
    </m.li>
  );
}
