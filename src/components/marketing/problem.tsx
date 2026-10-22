"use client";

import { Repeat2, ReceiptText, ShieldQuestion } from "lucide-react";
import { MaskedHeading, Reveal, ScrollWords } from "@/components/motion/primitives";
import { Eyebrow, Scene } from "./scene";

const CONTRASTS = [
  {
    icon: Repeat2,
    title: "Repeats the same mistake",
    problem: "A wrong decimal scaling today, the same one tomorrow. Nothing carries over between sessions.",
    answer: "RecallIQ pins the cause from chain data and keeps the lesson on Walrus.",
  },
  {
    icon: ReceiptText,
    title: "Pays twice for nothing",
    problem: "It buys the same expensive analysis again, even when it never helped.",
    answer: "RecallIQ remembers whether a paid tool produced verified value.",
  },
  {
    icon: ShieldQuestion,
    title: "Can’t show its work",
    problem: "Answers arrive without evidence you could check yourself.",
    answer: "RecallIQ re-checks every claim against fresh Mainnet data.",
  },
];

/** Scene B: the editorial sheet that slides up over the hero. */
export function Problem() {
  return (
    <div className="scene-midnight">
      <Scene labelledBy="problem-title" className="-mt-10 rounded-[2.5rem] bg-scene-light text-scene-light-foreground">
        <div className="mx-auto max-w-6xl px-4 pb-28 pt-24 md:px-6 md:pb-36 md:pt-32">
          <Eyebrow tone="light">The problem</Eyebrow>
          <ScrollWords
            as="h2"
            id="problem-title"
            text="Forgetful AI repeats what went wrong."
            className="mt-6 max-w-4xl font-display text-[2.6rem] font-semibold leading-[1.05] tracking-tight sm:text-6xl md:text-7xl"
          />
          <MaskedHeading
            as="p"
            lines={["RecallIQ learns from it."]}
            wordClassName={() => "brand-gradient-text"}
            className="mt-3 font-display text-[2.6rem] font-semibold leading-[1.05] tracking-tight sm:text-6xl md:text-7xl"
          />

          <ul className="mt-16 grid gap-4 md:mt-24 md:grid-cols-3">
            {CONTRASTS.map(({ icon: Icon, title, problem, answer }, i) => (
              <Reveal
                as="li"
                key={title}
                delay={i * 0.08}
                className="shadow-elevated rounded-2xl border border-black/5 bg-white/70 p-6 dark:border-white/10 dark:bg-white/5"
              >
                <span className="flex size-10 items-center justify-center rounded-xl bg-scene-light-2 text-primary">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-5 font-display text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-scene-light-muted">{problem}</p>
                <p className="mt-4 border-t pt-4 text-sm font-medium leading-6">{answer}</p>
              </Reveal>
            ))}
          </ul>
        </div>
      </Scene>
    </div>
  );
}
