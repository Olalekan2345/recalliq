"use client";

import Image from "next/image";
import Link from "next/link";
import { Fragment, useRef } from "react";
import { m, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from "motion/react";
import { ArrowDown, ArrowRight, BrainCircuit, History, ShieldCheck, Wallet, Workflow } from "lucide-react";
import { SPRING_SOFT } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Aurora, Scene, ScrollLink } from "./scene";

/** What the agent does, orbiting the emblem. Positions are relative to the stage. */
const CHIPS = [
  { icon: BrainCircuit, label: "Remembers its mistakes", pos: "left-[0%] top-[10%]", depth: 1.2, float: "0s" },
  { icon: History, label: "Recalls lessons from Walrus", pos: "left-[-3%] top-[60%]", depth: 0.8, float: "-2.5s" },
  { icon: ShieldCheck, label: "Verifies on-chain evidence", pos: "right-[1%] top-[6%]", depth: 1, float: "-4s" },
  { icon: Workflow, label: "Chooses the tool worth using", pos: "right-[-4%] top-[55%]", depth: 1.4, float: "-1.2s" },
  { icon: Wallet, label: "Settles payments on Sui", pos: "left-[40%] bottom-[-12%]", depth: 0.6, float: "-3.3s" },
];

const HEADLINE = ["AI that remembers.", "Intelligence that evolves."].map((line, li, all) => ({
  line,
  // Index of the line's first word across the whole headline (staggers the CSS entrance).
  offset: all.slice(0, li).reduce((n, l) => n + l.split(" ").length, 0),
}));

/** Inline style for the CSS entrance delay of the n-th element. */
const delay = (ms: number) => ({ "--d": `${ms}ms` }) as React.CSSProperties;

export function Hero() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  // Pointer parallax (mouse only): springs keep it soft.
  const px = useSpring(0, SPRING_SOFT);
  const py = useSpring(0, SPRING_SOFT);
  const onPointerMove = (e: React.PointerEvent) => {
    if (reduced || e.pointerType !== "mouse") return;
    px.set(e.clientX / window.innerWidth - 0.5);
    py.set(e.clientY / window.innerHeight - 0.5);
  };
  const tiltY = useTransform(px, (v) => v * 18);
  const tiltX = useTransform(py, (v) => v * -12);

  // Scrolling away: the stage settles back and dims.
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end start"] });
  const stageScale = useTransform(scrollYProgress, [0, 1], reduced ? [1, 1] : [1, 0.84]);
  const stageY = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : [0, 90]);
  const stageOpacity = useTransform(scrollYProgress, [0, 0.9], reduced ? [1, 1] : [1, 0.25]);

  return (
    <Scene labelledBy="hero-title" className="scene-midnight isolate overflow-hidden">
      <div ref={sectionRef} onPointerMove={onPointerMove} className="relative flex min-h-[100svh] flex-col items-center px-4 pb-24 pt-24 md:pb-28">
        <Aurora variant="hero" />

        {/* Stage: emblem, rings and orbiting capabilities */}
        <m.div style={{ scale: stageScale, y: stageY, opacity: stageOpacity }} className="relative h-[230px] w-full max-w-[780px] sm:h-[280px] md:h-[300px]">
          <Rings />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="fade-up" style={delay(0)}>
              <div className="float-slow perspective-1200">
                <m.div style={{ rotateX: tiltX, rotateY: tiltY }} className="preserve-3d relative">
                  <div className="bg-brand-glow absolute -inset-16 rounded-full blur-2xl" aria-hidden />
                  <Image
                    src="/brand/recalliq-mark.png"
                    alt="RecallIQ emblem: the walrus inside a magnifying-glass Q"
                    width={512}
                    height={512}
                    priority
                    sizes="(min-width: 768px) 240px, 180px"
                    className="relative h-auto w-[180px] drop-shadow-[0_30px_60px_rgb(24_204_249/0.35)] md:w-[240px]"
                  />
                </m.div>
              </div>
            </div>
          </div>
          {CHIPS.map((c, i) => (
            <Chip key={c.label} chip={c} index={i} px={px} py={py} />
          ))}
        </m.div>

        <div className="relative mt-8 max-w-4xl text-center md:mt-10">
          <p
            className="fade-up glass-dark mx-auto inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium text-on-dark-muted"
            style={delay(80)}
          >
            <span className="size-1.5 rounded-full bg-[#5fe0ff] shadow-[0_0_10px_#5fe0ff]" aria-hidden />
            Sui Mainnet · memory on Walrus · chain data from Tatum
          </p>
          <h1 id="hero-title" className="mt-6 font-display text-[2.6rem] font-semibold leading-[1.04] tracking-tight sm:text-6xl md:text-7xl">
            {HEADLINE.map(({ line, offset }, li) => (
              <Fragment key={line}>
                {/* A real space between lines keeps the accessible text "remembers. Intelligence". */}
                {li > 0 ? " " : null}
                <span className="block">
                  {line.split(" ").map((w, i, words) => (
                    <Fragment key={w}>
                      <span className="-mb-[0.14em] inline-block overflow-hidden pb-[0.14em] align-bottom">
                        <span
                          className={cn("word-rise inline-block", li === 1 && "brand-gradient-text-light")}
                          style={{ "--i": offset + i } as React.CSSProperties}
                        >
                          {w}
                        </span>
                      </span>
                      {i < words.length - 1 ? " " : null}
                    </Fragment>
                  ))}
                </span>
              </Fragment>
            ))}
          </h1>
          <p className="fade-up mx-auto mt-6 max-w-2xl text-base leading-7 text-on-dark-muted md:text-lg" style={delay(650)}>
            Meet the agent that learns from experience, verifies its decisions, and knows when better intelligence is worth paying for.
          </p>
          <div className="fade-up mt-9 flex flex-wrap items-center justify-center gap-3" style={delay(800)}>
            <Link
              href="/sign-up"
              className="bg-brand-gradient group inline-flex h-12 items-center gap-2 rounded-full px-7 text-base font-semibold text-white shadow-[0_14px_40px_-12px_rgb(50_84_228/0.9)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7fe3ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#050920] motion-reduce:transition-none"
            >
              Launch RecallIQ
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
            </Link>
            <ScrollLink
              to="how"
              className="glass-dark inline-flex h-12 items-center gap-2 rounded-full px-7 text-base font-medium text-on-dark transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7fe3ff]"
            >
              See How It Learns
            </ScrollLink>
          </div>
          <p className="fade-up mt-4 text-sm text-on-dark-muted" style={delay(950)}>
            No wallet needed for read-only investigations ·{" "}
            <Link href="/sign-in?guest=1" className="font-medium text-on-dark underline-offset-4 hover:underline">
              try it as a guest
            </Link>
          </p>
          <ul className="mx-auto mt-8 flex max-w-md flex-wrap justify-center gap-2 md:hidden" aria-label="What RecallIQ does">
            {CHIPS.map(({ icon: Icon, label }) => (
              <li key={label} className="glass-dark inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-on-dark">
                <Icon className="size-3.5 text-[#7fe3ff]" aria-hidden />
                {label}
              </li>
            ))}
          </ul>
        </div>

        <div className="absolute inset-x-0 bottom-6 hidden justify-center md:flex" aria-hidden>
          <span className="float-slower flex flex-col items-center gap-1 text-[11px] uppercase tracking-[0.2em] text-on-dark-muted">
            Scroll
            <ArrowDown className="size-3.5" />
          </span>
        </div>
      </div>
    </Scene>
  );
}

function Chip({ chip, index, px, py }: { chip: (typeof CHIPS)[number]; index: number; px: MotionValue<number>; py: MotionValue<number> }) {
  const x = useTransform(px, (v) => v * 46 * chip.depth);
  const y = useTransform(py, (v) => v * 34 * chip.depth);
  const Icon = chip.icon;
  return (
    <div className={cn("absolute hidden md:block", chip.pos)} aria-hidden>
      <m.div style={{ x, y }}>
        <div className="fade-up" style={delay(500 + index * 90)}>
          <div
            className="float-slow glass-dark flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-4 text-sm text-on-dark"
            style={{ animationDelay: chip.float }}
          >
            <span className="bg-brand-gradient flex size-7 items-center justify-center rounded-full">
              <Icon className="size-3.5 text-white" />
            </span>
            {chip.label}
          </div>
        </div>
      </m.div>
    </div>
  );
}

/** Concentric orbits behind the emblem; the dashed ones turn very slowly. */
function Rings() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
      <div className="relative size-[480px] shrink-0 md:size-[600px]">
        <svg viewBox="0 0 680 680" className="absolute inset-0 size-full">
          <circle cx="340" cy="340" r="190" fill="none" stroke="rgb(255 255 255 / 0.09)" />
          <circle cx="340" cy="340" r="335" fill="none" stroke="rgb(255 255 255 / 0.05)" />
        </svg>
        <svg viewBox="0 0 680 680" className="spin-slow absolute inset-0 size-full">
          <defs>
            <linearGradient id="ring-gradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#18ccf9" stopOpacity="0.7" />
              <stop offset="1" stopColor="#9976f9" stopOpacity="0.5" />
            </linearGradient>
          </defs>
          <circle cx="340" cy="340" r="260" fill="none" stroke="url(#ring-gradient)" strokeWidth="1.2" strokeDasharray="2 10" />
          <circle cx="340" cy="80" r="3" fill="#5fe0ff" />
        </svg>
        <svg viewBox="0 0 680 680" className="spin-slower absolute inset-0 size-full">
          <circle cx="340" cy="340" r="300" fill="none" stroke="rgb(153 118 249 / 0.22)" strokeDasharray="1 14" />
          <circle cx="40" cy="340" r="2.5" fill="#c4adff" />
        </svg>
        <div className="ring-pulse absolute inset-[28%] rounded-full border border-[#5fe0ff]/30" />
        <div className="ring-pulse absolute inset-[28%] rounded-full border border-[#9976f9]/30" style={{ animationDelay: "-2.4s" }} />
      </div>
    </div>
  );
}
