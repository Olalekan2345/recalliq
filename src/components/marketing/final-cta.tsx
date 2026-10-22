"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MaskedHeading, Reveal, TiltCard } from "@/components/motion/primitives";
import { Scene } from "./scene";

/** Scene I: the hero's emblem returns on a pastel gradient, with the two ways in. */
export function FinalCta() {
  return (
    <Scene labelledBy="cta-title" tone="frost" from="frost" className="isolate overflow-hidden">
      <div className="mx-auto max-w-6xl px-4 py-20 md:px-6 md:py-28">
        <div className="relative overflow-hidden rounded-[2.5rem] border border-scene-line bg-[linear-gradient(125deg,var(--sec-ice),var(--sec-lavender)_55%,var(--sec-aqua))] px-6 py-16 shadow-[0_40px_90px_-50px_rgb(16_28_68/0.45)] md:px-14 md:py-20">
          <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
            <div className="absolute -right-24 -top-24 size-[28rem] rounded-full bg-[radial-gradient(closest-side,rgb(24_204_249/0.22),transparent)]" />
            <div className="absolute -bottom-32 left-[20%] size-[26rem] rounded-full bg-[radial-gradient(closest-side,rgb(119_84_238/0.16),transparent)]" />
          </div>
          <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
            <div>
              <MaskedHeading
                id="cta-title"
                lines={["Your AI shouldn’t start", "from zero every time."]}
                wordClassName={(l) => (l === 1 ? "brand-gradient-text" : undefined)}
                className="font-display text-4xl font-semibold leading-[1.06] tracking-[-0.03em] md:text-5xl xl:text-6xl"
              />
              <Reveal>
                <p className="mt-6 max-w-xl text-base leading-7 text-scene-muted md:text-lg">
                  Start an investigation on Sui Mainnet. Every claim is verified, every lesson is kept, and nothing is spent without your signature.
                </p>
                <div className="mt-9 flex flex-wrap gap-3">
                  <Link
                    href="/sign-up"
                    className="bg-brand-gradient group inline-flex h-12 items-center gap-2 rounded-full px-7 text-base font-semibold text-white shadow-[0_16px_36px_-14px_rgb(49_86_227/0.75)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none"
                  >
                    Start Using RecallIQ
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
                  </Link>
                  <Link
                    href="/sign-in?guest=1"
                    className="glass-scene inline-flex h-12 items-center rounded-full px-7 text-base font-medium text-scene-fg transition-colors hover:bg-scene-raise-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Try as guest
                  </Link>
                </div>
              </Reveal>
            </div>
            <Reveal className="relative mx-auto w-full max-w-[19rem]">
              <div className="absolute inset-[6%] -rotate-12 rounded-[2rem] opacity-70 gloss-iridescent" aria-hidden />
              <div className="gloss-glass absolute inset-[10%] rotate-6 rounded-[2rem]" aria-hidden />
              <TiltCard>
                <div className="float-slow relative">
                  <Image
                    src="/brand/recalliq-mark.png"
                    alt="RecallIQ emblem"
                    width={512}
                    height={512}
                    sizes="(min-width: 1024px) 300px, 70vw"
                    className="h-auto w-full drop-shadow-[0_30px_45px_rgb(20_90_200/0.3)]"
                  />
                </div>
              </TiltCard>
            </Reveal>
          </div>
        </div>
      </div>
    </Scene>
  );
}
