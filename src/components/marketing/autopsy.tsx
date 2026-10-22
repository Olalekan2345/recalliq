"use client";

import { useRef } from "react";
import { m, useTransform, type MotionValue } from "motion/react";
import { ArrowRight, DatabaseZap, Microscope, ShieldCheck, ShieldX, Workflow } from "lucide-react";
import { MaskedHeading, Reveal, useSceneProgress, useAmbientMotion } from "@/components/motion/primitives";
import { Eyebrow, Scene } from "./scene";

/**
 * Scene E: a worked example of the autopsy. The values are illustrative (they
 * mirror the decimal-scaling diagnosis the verification engine performs); real
 * records live in each user's Learning Lab.
 */
export function Autopsy() {
  const ref = useRef<HTMLDivElement>(null);
  const progress = useSceneProgress(ref, ["start 0.9", "center 0.55"]);
  // Static until hydrated (matches the server HTML), then follows the user's motion preference.
  const reduced = !useAmbientMotion();
  // Rotation only: the panels stack on narrow screens, where a sideways slide would clip them.
  const leftRotate = useTransform(progress, [0, 1], reduced ? [0, 0] : [16, 0]);
  const rightRotate = useTransform(progress, [0, 1], reduced ? [0, 0] : [-16, 0]);
  const bridge = useTransform(progress, [0.45, 1], [0, 1]);

  return (
    <Scene id="autopsy" labelledBy="autopsy-title" className="isolate overflow-hidden bg-gradient-to-b from-[#050920] via-[#0a0f33] to-[#050920] text-on-dark">
      <div className="mx-auto max-w-6xl px-4 py-28 md:px-6 md:py-36">
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow className="justify-center">Agent Autopsy</Eyebrow>
          <MaskedHeading
            id="autopsy-title"
            lines={["Mistakes become", "verified lessons."]}
            wordClassName={(l) => (l === 1 ? "brand-gradient-text-light" : undefined)}
            className="mt-5 font-display text-4xl font-semibold leading-[1.08] tracking-tight md:text-6xl"
          />
          <Reveal>
            <p className="mt-6 text-base leading-7 text-on-dark-muted md:text-lg">
              When fresh chain data contradicts a claim, the autopsy finds the cause from evidence. Not from the model explaining itself. The lesson is stored,
              and a later run behaves differently.
            </p>
          </Reveal>
        </div>

        <div ref={ref} className="perspective-1200 mt-16 grid items-center gap-6 lg:grid-cols-[1fr_auto_1fr]">
          <m.article style={{ rotateY: leftRotate }} className="glass-dark rounded-3xl p-6">
            <p className="text-xs font-medium uppercase tracking-wider text-on-dark-muted">Earlier run</p>
            <h3 className="mt-2 font-display text-lg font-semibold">The answer overstated an amount</h3>
            <div className="mt-5 space-y-3 text-sm">
              <Row label="Claim">“The receiver got 1,500,000,000 SUI”</Row>
              <Row label="Chain says">1.5 SUI (the coin has 9 decimals)</Row>
              <div className="flex items-center gap-2 rounded-xl border border-[#ff8fab]/30 bg-[#ff8fab]/10 px-3 py-2 text-[#ffb3c6]">
                <ShieldX className="size-4" aria-hidden />
                Contradicted: off by exactly 10⁹
              </div>
            </div>
          </m.article>

          <div className="flex flex-row items-center justify-center gap-3 lg:flex-col" aria-label="What the autopsy does">
            <Bridge icon={Microscope} label="Cause confirmed" progress={bridge} />
            <ArrowRight className="size-4 text-[#7fe3ff] lg:rotate-90" aria-hidden />
            <Bridge icon={DatabaseZap} label="Lesson on Walrus" progress={bridge} />
          </div>

          <m.article style={{ rotateY: rightRotate }} className="glass-dark ring-brand rounded-3xl p-6">
            <p className="text-xs font-medium uppercase tracking-wider text-on-dark-muted">Later run</p>
            <h3 className="mt-2 font-display text-lg font-semibold">The learned rule changes the plan</h3>
            <div className="mt-5 space-y-3 text-sm">
              <Row label="Rule">Read coin decimals before stating amounts</Row>
              <Row label="Tool">
                <span className="inline-flex items-center gap-1.5">
                  <Workflow className="size-3.5 text-[#7fe3ff]" aria-hidden /> Balance Change Analyzer
                </span>
              </Row>
              <div className="flex items-center gap-2 rounded-xl border border-[#7ef0c1]/30 bg-[#7ef0c1]/10 px-3 py-2 text-[#a6f5d6]">
                <ShieldCheck className="size-4" aria-hidden />
                “The receiver got 1.5 SUI”: verified
              </div>
            </div>
          </m.article>
        </div>
        <Reveal>
          <p className="mt-8 text-center text-xs text-on-dark-muted">
            Worked example with illustrative values. Your own runs show their real records in the Learning Lab.
          </p>
        </Reveal>
      </div>
    </Scene>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="w-20 shrink-0 text-on-dark-muted">{label}</span>
      <span>{children}</span>
    </div>
  );
}

function Bridge({ icon: Icon, label, progress }: { icon: typeof Microscope; label: string; progress: MotionValue<number> }) {
  const opacity = useTransform(progress, [0, 1], [0.35, 1]);
  return (
    <m.div style={{ opacity }} className="glass-dark flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium">
      <span className="bg-brand-gradient flex size-6 items-center justify-center rounded-full">
        <Icon className="size-3.5 text-white" aria-hidden />
      </span>
      {label}
    </m.div>
  );
}
