"use client";

import Image from "next/image";
import { m } from "motion/react";
import { ArrowRight } from "lucide-react";
import { Mascot } from "@/components/brand/mascot";
import { MaskedHeading, Reveal, useAmbientMotion } from "@/components/motion/primitives";
import { DURATION, EASE_OUT } from "@/lib/motion";
import { Aurora, Eyebrow, Scene } from "./scene";

/** Memory types as stored in RecallIQ's lesson header (lib/memory/codec.ts). */
const CAPSULES = [
  { label: "Verified corrections", type: "correction", angle: -90, color: "#5fe0ff" },
  { label: "Failure lessons", type: "failure", angle: -18, color: "#ff8fab" },
  { label: "Successful strategies", type: "strategy", angle: 54, color: "#7ef0c1" },
  { label: "Tool performance", type: "tool_reliability", angle: 126, color: "#8ea6ff" },
  { label: "Spending lessons", type: "cost_efficiency", angle: 198, color: "#c4adff" },
];

const SIZE = 520;
const C = SIZE / 2;
const R = 190;

const points = CAPSULES.map((cap) => {
  const a = (cap.angle * Math.PI) / 180;
  const x = (C + R * Math.cos(a)).toFixed(1);
  const y = (C + R * Math.sin(a)).toFixed(1);
  // Curved link: control point pushed sideways from the midpoint.
  const qx = ((C + Number(x)) / 2 - Math.sin(a) * 46).toFixed(1);
  const qy = ((C + Number(y)) / 2 + Math.cos(a) * 46).toFixed(1);
  return {
    ...cap,
    x: Number(x),
    y: Number(y),
    path: `M ${C} ${C} Q ${qx} ${qy} ${x} ${y}`,
    // The same curve, traversed from the lesson back to the agent (a recall).
    recall: `M ${x} ${y} Q ${qx} ${qy} ${C} ${C}`,
  };
});

const JOURNEY = [
  { when: "Session 1", title: "A claim is contradicted", body: "Fresh chain data disagrees with the agent. The autopsy pins the cause from evidence." },
  { when: "Stored", title: "The lesson lands on Walrus", body: "It is written to Walrus Mainnet and only counted once Walrus returns a blob ID." },
  { when: "Session 2", title: "A new question recalls it", body: "Days later, recall surfaces the lesson and its rule changes what the agent does." },
];

/** Scene D: Walrus Memory as a constellation of lesson types around the emblem, on frosted ice. */
export function MemoryUniverse() {
  const ambient = useAmbientMotion();
  return (
    <Scene id="memory" labelledBy="memory-title" tone="ice" from="white" className="isolate overflow-hidden">
      <Aurora variant="violet" />
      <div className="mx-auto max-w-6xl px-4 py-28 md:px-6 md:py-36">
        <div className="grid items-center gap-14 lg:grid-cols-2">
          <div>
            <Eyebrow>Walrus Memory</Eyebrow>
            <MaskedHeading
              id="memory-title"
              lines={["A memory that", "outlives the session."]}
              wordClassName={(l) => (l === 1 ? "brand-gradient-text" : undefined)}
              className="mt-5 font-display text-4xl font-semibold leading-[1.08] tracking-[-0.03em] md:text-5xl xl:text-[3.5rem]"
            />
            <Reveal>
              <p className="mt-6 text-base leading-7 text-scene-muted md:text-lg">
                Lessons are encrypted, stored on Walrus Mainnet, isolated per user, and recalled by meaning in later investigations. A lesson counts as stored
                only once Walrus returns a blob ID.
              </p>
            </Reveal>
            <Reveal className="mt-8 flex items-center gap-4">
              <figure className="w-[92px] shrink-0 overflow-hidden rounded-2xl border border-scene-line shadow-[0_20px_40px_-22px_rgb(16_28_68/0.5)]">
                <Mascot variant="walrus" decorative sizes="92px" className="h-auto w-full" />
              </figure>
              <p className="text-sm leading-6 text-scene-muted">
                <span className="font-semibold text-scene-fg">Memory that belongs to the agent, not the chat.</span> Each lesson keeps its evidence, so it can
                be checked before it is used.
              </p>
            </Reveal>
            <ul className="mt-8 flex flex-wrap gap-2 sm:hidden" aria-label="Kinds of lessons">
              {CAPSULES.map((c) => (
                <li key={c.type} className="glass-scene inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs">
                  <span className="size-2 rounded-full" style={{ background: c.color }} aria-hidden />
                  {c.label}
                </li>
              ))}
            </ul>
          </div>

          <figure className="relative mx-auto aspect-square w-full max-w-[520px]" aria-label="Kinds of lessons RecallIQ keeps on Walrus">
            <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="absolute inset-0 size-full" aria-hidden>
              <defs>
                <linearGradient id="link" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#18ccf9" />
                  <stop offset="1" stopColor="#9976f9" />
                </linearGradient>
              </defs>
              <circle cx={C} cy={C} r={R} fill="none" className="stroke-scene-line" strokeWidth={1.5} strokeDasharray="2 8" />
              <circle cx={C} cy={C} r={R * 0.62} fill="none" className="stroke-scene-line" />
              {points.map((p, i) => (
                <m.path
                  key={p.type}
                  d={p.path}
                  fill="none"
                  stroke="url(#link)"
                  strokeWidth={1.4}
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  whileInView={{ pathLength: 1, opacity: 0.8 }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{ duration: 1.2, ease: EASE_OUT, delay: 0.2 + i * 0.12 }}
                />
              ))}
              {/* Recall pulses travelling from each lesson to the agent (after hydration, motion allowed). */}
              {ambient &&
                points.map((p, i) => (
                  <circle key={`pulse-${p.type}`} r={3} fill={p.color} opacity={0.9}>
                    <animateMotion dur="5.5s" repeatCount="indefinite" begin={`${-i * 1.1}s`} path={p.recall} />
                  </circle>
                ))}
            </svg>

            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative">
                <div className="ring-pulse absolute -inset-6 rounded-full border border-brand-violet/30" aria-hidden />
                <div className="bg-brand-glow absolute -inset-10 rounded-full blur-2xl" aria-hidden />
                <Image
                  src="/brand/recalliq-mark.png"
                  alt=""
                  width={512}
                  height={512}
                  sizes="150px"
                  className="float-slow relative h-auto w-[110px] md:w-[150px]"
                />
              </div>
            </div>

            {points.map((p, i) => (
              <m.div
                key={p.type}
                className="absolute hidden -translate-x-1/2 -translate-y-1/2 sm:block"
                style={{ left: `${(p.x / SIZE) * 100}%`, top: `${(p.y / SIZE) * 100}%` }}
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: DURATION.slow, ease: EASE_OUT, delay: 0.5 + i * 0.1 }}
              >
                <div className="float-slow glass-scene w-max rounded-2xl px-3.5 py-2.5" style={{ animationDelay: `${-i * 1.4}s` }}>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span className="size-2 rounded-full" style={{ background: p.color, boxShadow: `0 0 10px ${p.color}` }} aria-hidden />
                    {p.label}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-scene-muted">type: {p.type}</div>
                </div>
              </m.div>
            ))}
          </figure>
        </div>

        <ol className="mt-20 grid gap-4 md:grid-cols-3" aria-label="How a lesson travels between sessions">
          {JOURNEY.map((j, i) => (
            <Reveal as="li" key={j.title} delay={i * 0.1} className="glass-scene relative rounded-3xl p-6">
              <span className="font-mono text-xs uppercase tracking-wider text-scene-accent">{j.when}</span>
              <h3 className="mt-2 font-display text-lg font-semibold">{j.title}</h3>
              <p className="mt-2 text-sm leading-6 text-scene-muted">{j.body}</p>
              {i < JOURNEY.length - 1 && (
                <ArrowRight className="absolute -right-3.5 top-1/2 hidden size-5 -translate-y-1/2 text-scene-accent md:block" aria-hidden />
              )}
            </Reveal>
          ))}
        </ol>
      </div>
    </Scene>
  );
}
