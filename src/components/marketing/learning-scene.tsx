"use client";

import Link from "next/link";
import { m } from "motion/react";
import { ArrowRight } from "lucide-react";
import { MaskedHeading, Reveal } from "@/components/motion/primitives";
import { EASE_OUT } from "@/lib/motion";
import type { PublicStats } from "@/server/services/public-stats";
import { Eyebrow, Scene } from "./scene";

const CHAIN = ["Failure", "Verified lesson", "Memory write", "Memory retrieval", "Changed decision", "Measured outcome"];

/** Scene H: the learning loop as a clean white analytics sheet, with live deployment counts (never placeholders). */
export function LearningScene({ stats }: { stats: PublicStats | null }) {
  const tiles = stats
    ? [
        { label: "Investigations completed", value: stats.investigationsCompleted },
        { label: "Claims verified on chain", value: stats.claimsVerified },
        { label: "Contradictions caught", value: stats.claimsContradicted },
        { label: "Lessons stored on Walrus", value: stats.lessonsStored },
        { label: "Controlled evaluations", value: stats.evaluationsCompleted },
      ]
    : [];
  return (
    <Scene id="learning" labelledBy="learning-title" tone="white" from="soft">
      <div className="mx-auto max-w-6xl px-4 py-28 md:px-6 md:py-36">
        <div>
          <div className="max-w-3xl">
            <Eyebrow>Learning Lab</Eyebrow>
            <MaskedHeading
              id="learning-title"
              lines={["Learning you can measure,", "not just claim."]}
              wordClassName={(l) => (l === 1 ? "brand-gradient-text" : undefined)}
              className="mt-5 font-display text-4xl font-semibold leading-[1.08] tracking-[-0.03em] md:text-6xl"
            />
            <Reveal>
              <p className="mt-6 max-w-2xl text-base leading-7 text-scene-muted md:text-lg">
                Every link in the chain points at a real record: the run, the verification, the Walrus blob, the later investigation. Controlled evaluations
                compare runs with and without memory, and say “inconclusive” when the evidence is.
              </p>
            </Reveal>
          </div>
        </div>

        <ol className="relative mt-16 grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-6" aria-label="The learning chain">
          <m.span
            className="bg-brand-gradient absolute left-0 right-0 top-[22px] hidden h-px origin-left lg:block"
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true, amount: 0.8 }}
            transition={{ duration: 1.6, ease: EASE_OUT }}
            aria-hidden
          />
          {CHAIN.map((c, i) => (
            <Reveal as="li" key={c} delay={0.1 + i * 0.08} className="relative">
              <span className="relative flex size-11 items-center justify-center rounded-full border border-scene-line bg-scene-raise-strong font-mono text-sm font-semibold text-scene-accent shadow-sm">
                {i + 1}
              </span>
              <p className="mt-3 text-sm font-semibold">{c}</p>
            </Reveal>
          ))}
        </ol>

        <div className="mt-16">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-scene-muted">
            <span className="pulse-dot size-2 rounded-full bg-success" aria-hidden />
            Live from this deployment’s database · evaluation runs excluded
          </div>
          {stats ? (
            <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {tiles.map((t, i) => (
                <Reveal key={t.label} delay={i * 0.06} className="rounded-2xl border border-scene-line bg-sec-soft p-5">
                  <dt className="min-h-8 text-xs font-medium text-scene-muted">{t.label}</dt>
                  <dd className="mt-2 font-display text-3xl font-semibold tabular-nums">{t.value.toLocaleString("en-US")}</dd>
                </Reveal>
              ))}
            </dl>
          ) : (
            <p className="mt-4 rounded-2xl border border-dashed border-scene-line p-5 text-sm text-scene-muted">
              Live numbers are unavailable on this deployment right now.
            </p>
          )}
          <Link
            href="/learning"
            className="mt-8 inline-flex items-center gap-1.5 rounded text-sm font-semibold text-scene-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Open the Learning Lab <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </div>
    </Scene>
  );
}
