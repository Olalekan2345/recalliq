"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Mascot } from "@/components/brand/mascot";
import { MaskedHeading, Reveal, TiltCard } from "@/components/motion/primitives";
import { Aurora, Scene } from "./scene";

/** Scene I: the hero's identity returns, now with the mascot. */
export function FinalCta() {
  return (
    <Scene labelledBy="cta-title" className="scene-midnight isolate overflow-hidden">
      <Aurora variant="hero" />
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 py-28 md:px-6 md:py-36 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
        <div>
          <MaskedHeading
            id="cta-title"
            lines={["Your AI shouldn’t start", "from zero every time."]}
            wordClassName={(l) => (l === 1 ? "brand-gradient-text-light" : undefined)}
            className="font-display text-4xl font-semibold leading-[1.06] tracking-tight md:text-5xl xl:text-6xl"
          />
          <Reveal>
            <p className="mt-6 max-w-xl text-base leading-7 text-on-dark-muted md:text-lg">
              Start an investigation on Sui Mainnet. Every claim is verified, every lesson is kept, and nothing is spent without your signature.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href="/sign-up"
                className="bg-brand-gradient group inline-flex h-12 items-center gap-2 rounded-full px-7 text-base font-semibold text-white shadow-[0_14px_40px_-12px_rgb(50_84_228/0.9)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7fe3ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#050920] motion-reduce:transition-none"
              >
                Start Using RecallIQ
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
              </Link>
              <Link
                href="/sign-in?guest=1"
                className="glass-dark inline-flex h-12 items-center rounded-full px-7 text-base font-medium text-on-dark transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7fe3ff]"
              >
                Try as guest
              </Link>
            </div>
          </Reveal>
        </div>
        <Reveal className="mx-auto w-full max-w-md">
          <TiltCard>
            <figure className="float-slow ring-brand relative overflow-hidden rounded-[2rem] shadow-[0_40px_120px_-40px_rgb(24_204_249/0.6)]">
              <Mascot variant="hoodie" sizes="(min-width: 1024px) 440px, 90vw" className="h-auto w-full" />
            </figure>
          </TiltCard>
        </Reveal>
      </div>
    </Scene>
  );
}
