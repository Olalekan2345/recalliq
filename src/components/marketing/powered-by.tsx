"use client";

import { ArrowUpRight } from "lucide-react";
import { Mascot, type MascotVariant } from "@/components/brand/mascot";
import { MaskedHeading, Reveal, TiltCard } from "@/components/motion/primitives";
import { Aurora, Eyebrow, Scene } from "./scene";

const STACK: Array<{ mascot: MascotVariant; role: string; name: string; body: string; href: string }> = [
  {
    mascot: "walrus",
    role: "Persistent memory",
    name: "Walrus Memory",
    body: "Lessons are encrypted and stored on Walrus Mainnet through MemWal, then recalled by meaning in later sessions.",
    href: "https://docs.wal.app/walrus-memory/",
  },
  {
    mascot: "tatum",
    role: "Real blockchain data",
    name: "Tatum Sui gRPC",
    body: "Transactions, balances, checkpoints and objects come from Tatum’s Sui Mainnet gateway, and are fetched again to verify claims.",
    href: "https://docs.tatum.io/",
  },
  {
    mascot: "business",
    role: "Settlement",
    name: "x402 payments on Sui",
    body: "Paid analysis settles on Sui Mainnet under the x402 standard. RecallIQ confirms the settlement on chain before using the result.",
    href: "https://docs.sui.io/",
  },
];

/** Scene G: the infrastructure RecallIQ is built with. Statements of use, not of partnership. */
export function PoweredBy() {
  return (
    <Scene labelledBy="stack-title" className="scene-midnight isolate overflow-hidden">
      <Aurora variant="cyan" />
      <div className="mx-auto max-w-6xl px-4 py-28 md:px-6 md:py-36">
        <div className="max-w-3xl">
          <Eyebrow>Built with</Eyebrow>
          <MaskedHeading
            id="stack-title"
            lines={["Infrastructure you", "can verify yourself."]}
            wordClassName={(l) => (l === 1 ? "brand-gradient-text-light" : undefined)}
            className="mt-5 font-display text-4xl font-semibold leading-[1.08] tracking-tight md:text-6xl"
          />
        </div>
        <ul className="mt-14 grid gap-5 md:grid-cols-3">
          {STACK.map((s, i) => (
            <Reveal as="li" key={s.name} delay={i * 0.08}>
              <TiltCard className="h-full">
                <article className="glass-dark flex h-full flex-col rounded-3xl p-6">
                  <div className="flex items-end gap-4">
                    <div className="w-[104px] shrink-0 overflow-hidden rounded-2xl border border-white/15 shadow-[0_18px_40px_-18px_rgb(24_204_249/0.6)]">
                      <Mascot variant={s.mascot} decorative sizes="104px" className="h-auto w-full" />
                    </div>
                    <div className="pb-1">
                      <p className="text-xs font-semibold uppercase tracking-wider text-[#7fe3ff]">{s.role}</p>
                      <h3 className="mt-1.5 font-display text-xl font-semibold leading-tight">{s.name}</h3>
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col">
                    <p className="mt-5 flex-1 text-sm leading-6 text-on-dark-muted">{s.body}</p>
                    <a
                      href={s.href}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-5 inline-flex w-fit items-center gap-1 rounded text-sm font-medium text-on-dark underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7fe3ff]"
                    >
                      Documentation <ArrowUpRight className="size-3.5" aria-hidden />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  </div>
                </article>
              </TiltCard>
            </Reveal>
          ))}
        </ul>
        <p className="mt-10 max-w-3xl text-sm text-on-dark-muted">
          RecallIQ is an independent project built with these services for the Walrus × Tatum Total Recall hackathon. Product names belong to their owners.
        </p>
      </div>
    </Scene>
  );
}
