"use client";

import { Repeat2, ReceiptText, ShieldQuestion } from "lucide-react";
import { MaskedHeading, Reveal, ScrollWords } from "@/components/motion/primitives";
import { Aurora, Eyebrow, Scene } from "./scene";

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

/** Scene B, "Why RecallIQ": what forgetful agents get wrong, on an ice-blue section. */
export function Problem() {
  return (
    <Scene id="why" labelledBy="problem-title" tone="ice" from="frost" className="isolate overflow-hidden">
      <Aurora variant="cyan" grid={false} />
      <div className="mx-auto max-w-6xl px-4 pb-28 pt-20 md:px-6 md:pb-36 md:pt-28">
        <Eyebrow>Why RecallIQ</Eyebrow>
        <ScrollWords
          as="h2"
          id="problem-title"
          text="Forgetful AI repeats what went wrong."
          className="mt-6 max-w-4xl font-display text-[2.6rem] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-6xl md:text-7xl"
        />
        <MaskedHeading
          as="p"
          lines={["RecallIQ learns from it."]}
          wordClassName={() => "brand-gradient-text"}
          className="mt-3 font-display text-[2.6rem] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-6xl md:text-7xl"
        />

        <ul className="mt-16 grid gap-4 md:mt-24 md:grid-cols-3">
          {CONTRASTS.map(({ icon: Icon, title, problem, answer }, i) => (
            <Reveal as="li" key={title} delay={i * 0.08} className="glass-scene rounded-3xl p-6">
              <span className="bg-brand-gradient flex size-11 items-center justify-center rounded-2xl shadow-[0_10px_22px_-10px_rgb(49_86_227/0.8)]">
                <Icon className="size-5 text-white" aria-hidden />
              </span>
              <h3 className="mt-5 font-display text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-scene-muted">{problem}</p>
              <p className="mt-4 border-t border-scene-line pt-4 text-sm font-medium leading-6">{answer}</p>
            </Reveal>
          ))}
        </ul>
      </div>
    </Scene>
  );
}
