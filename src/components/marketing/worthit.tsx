"use client";

import { m } from "motion/react";
import { BadgeCheck, Gauge, Scale, Target, Wallet } from "lucide-react";
import { MaskedHeading, Reveal, TiltCard } from "@/components/motion/primitives";
import { EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Eyebrow, Scene } from "./scene";

export interface PublicTool {
  id: string;
  name: string;
  summary: string;
  provider: string;
  paid: boolean;
}

const FLOW = [
  { icon: Target, title: "Relevance", body: "Does the tool fit this kind of question?" },
  { icon: Gauge, title: "Measured reliability", body: "Wilson lower bound of real outcomes, only once n ≥ 5." },
  { icon: Scale, title: "Your limits", body: "Per-payment, per-investigation and 24-hour caps, enforced in code." },
  { icon: Wallet, title: "Your approval", body: "You sign the exact asset, amount and recipient in your wallet." },
  { icon: BadgeCheck, title: "Verified settlement", body: "The payment is confirmed on Sui before the result is used." },
];

/** Scene F: WorthIt Intelligence, on a frosted light sheet. Tools come from the live registry. */
export function WorthIt({ tools }: { tools: PublicTool[] }) {
  return (
    <div className="scene-midnight">
      <Scene
        id="worthit"
        labelledBy="worthit-title"
        className="rounded-[2.5rem] bg-gradient-to-b from-scene-light-2 via-scene-light to-scene-light text-scene-light-foreground"
      >
        <div className="mx-auto max-w-6xl px-4 py-28 md:px-6 md:py-36">
          <div className="max-w-4xl">
            <Eyebrow tone="light">WorthIt Intelligence</Eyebrow>
            <MaskedHeading
              id="worthit-title"
              lines={["Knows when better intelligence", "is worth paying for."]}
              wordClassName={(l) => (l === 1 ? "brand-gradient-text" : undefined)}
              className="mt-5 font-display text-4xl font-semibold leading-[1.08] tracking-tight md:text-6xl"
            />
            <Reveal>
              <p className="mt-6 max-w-2xl text-base leading-7 text-scene-light-muted md:text-lg">
                Free Tatum tools come first. A paid specialist is only proposed when the evidence says it adds verified value, and never without your signature.
              </p>
            </Reveal>
          </div>

          <ul className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Tools the agent can use">
            {tools.map((t, i) => (
              <Reveal as="li" key={t.id} delay={(i % 5) * 0.05} className={cn(t.paid && "sm:col-span-2 lg:col-span-1")}>
                <TiltCard max={6} className="h-full">
                  <div
                    className={cn(
                      "shadow-elevated flex h-full flex-col rounded-2xl border bg-white/80 p-4 dark:bg-white/[0.04]",
                      t.paid ? "ring-brand border-transparent" : "border-black/5 dark:border-white/10",
                    )}
                  >
                    <span
                      className={cn(
                        "w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        t.paid ? "bg-brand-gradient text-white" : "bg-scene-light-2 text-primary dark:text-[#7fe3ff]",
                      )}
                    >
                      {t.paid ? "Paid · x402 on Sui" : "Free"}
                    </span>
                    <h3 className="mt-3 text-sm font-semibold">{t.name}</h3>
                    <p className="mt-1 flex-1 text-xs leading-5 text-scene-light-muted">{t.summary}</p>
                    <p className="mt-3 text-[11px] text-scene-light-muted">{t.provider}</p>
                  </div>
                </TiltCard>
              </Reveal>
            ))}
          </ul>

          <div className="relative mt-20">
            <m.div
              className="bg-brand-gradient absolute left-[10%] right-[10%] top-6 hidden h-px origin-left lg:block"
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true, amount: 0.6 }}
              transition={{ duration: 1.4, ease: EASE_OUT }}
              aria-hidden
            />
            <ol className="relative grid gap-6 sm:grid-cols-2 lg:grid-cols-5" aria-label="How a paid analysis is decided">
              {FLOW.map(({ icon: Icon, title, body }, i) => (
                <Reveal as="li" key={title} delay={0.15 + i * 0.1} className="flex flex-col items-start lg:items-center lg:text-center">
                  <span className="shadow-elevated flex size-12 items-center justify-center rounded-2xl border border-black/5 bg-white text-primary dark:border-white/10 dark:bg-[#141a52] dark:text-[#7fe3ff]">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 font-display text-base font-semibold">{title}</h3>
                  <p className="mt-1 text-sm leading-6 text-scene-light-muted">{body}</p>
                </Reveal>
              ))}
            </ol>
          </div>
          <Reveal>
            <p className="mt-12 text-sm text-scene-light-muted">
              Prices appear only where a deployment configures them. RecallIQ never shows a quote it cannot charge.
            </p>
          </Reveal>
        </div>
      </Scene>
    </div>
  );
}
