"use client";

import Image from "next/image";
import Link from "next/link";
import { Fragment, useRef } from "react";
import { m, useScroll, useSpring, useTransform, type MotionValue } from "motion/react";
import { ArrowRight, BrainCircuit, History, ShieldCheck, Workflow } from "lucide-react";
import { SPRING_SOFT } from "@/lib/motion";
import { useAmbientMotion } from "@/components/motion/primitives";
import { cn } from "@/lib/utils";
import { Aurora, Scene, ScrollLink } from "./scene";

/**
 * What the agent does, as conceptual interface cards around the emblem. Words
 * only: no counts or values, because nothing here comes from a real run.
 */
const CARDS = [
  {
    icon: History,
    title: "Persistent memory",
    text: "Lessons kept on Walrus and recalled when they apply.",
    tag: "Recalled",
    pos: "left-[-12%] top-[2%]",
    depth: 1.3,
    float: "0s",
  },
  {
    icon: ShieldCheck,
    title: "Verified intelligence",
    text: "Every claim checked against Sui Mainnet evidence.",
    tag: "Verified",
    pos: "right-[-14%] top-[20%]",
    depth: 1,
    float: "-2.6s",
  },
  {
    icon: BrainCircuit,
    title: "Learning from mistakes",
    text: "A failed run gets an autopsy and becomes a lesson.",
    tag: "Lesson",
    pos: "left-[-16%] bottom-[20%]",
    depth: 0.8,
    float: "-4.1s",
  },
  {
    icon: Workflow,
    title: "Smart tool selection",
    text: "Pays for specialist analysis only when it is worth it.",
    tag: "WorthIt",
    pos: "right-[-8%] bottom-[-1%]",
    depth: 1.5,
    float: "-1.4s",
  },
] as const;

/** Inline style for the CSS entrance delay of the n-th element. */
const delay = (ms: number) => ({ "--d": `${ms}ms` }) as React.CSSProperties;

export function Hero() {
  const sectionRef = useRef<HTMLDivElement>(null);
  // Static until hydrated (matches the server HTML), then follows the user's motion preference.
  const reduced = !useAmbientMotion();

  // Pointer parallax (mouse only): springs keep it soft.
  const px = useSpring(0, SPRING_SOFT);
  const py = useSpring(0, SPRING_SOFT);
  const onPointerMove = (e: React.PointerEvent) => {
    if (reduced || e.pointerType !== "mouse") return;
    px.set(e.clientX / window.innerWidth - 0.5);
    py.set(e.clientY / window.innerHeight - 0.5);
  };
  const tiltY = useTransform(px, (v) => v * 16);
  const tiltX = useTransform(py, (v) => v * -10);
  const layersX = useTransform(px, (v) => v * -22);
  const layersY = useTransform(py, (v) => v * -16);

  // Scrolling away: the stage drifts back and settles.
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end start"] });
  const stageScale = useTransform(scrollYProgress, [0, 1], reduced ? [1, 1] : [1, 0.9]);
  const stageY = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : [0, 70]);

  return (
    <Scene labelledBy="hero-title" tone="frost" className="isolate overflow-hidden">
      <div ref={sectionRef} onPointerMove={onPointerMove} className="relative">
        <Aurora variant="hero" />

        <div className="mx-auto grid min-h-[100svh] max-w-7xl items-center gap-10 px-4 pb-16 pt-28 md:px-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)] lg:gap-6 lg:pb-20 lg:pt-24">
          {/* Copy */}
          <div className="relative min-w-0 max-w-2xl">
            <p className="fade-up glass-scene inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium text-scene-muted" style={delay(250)}>
              <span className="size-1.5 rounded-full bg-brand-cyan shadow-[0_0_10px_var(--brand-cyan)]" aria-hidden />
              Sui Mainnet · memory on Walrus · chain data from Tatum
            </p>
            <h1
              id="hero-title"
              style={{ "--word-base": "320ms" } as React.CSSProperties}
              className="mt-6 font-display text-[2.7rem] leading-[1.04] tracking-[-0.035em] sm:text-6xl lg:text-[4.1rem] xl:text-[4.6rem]"
            >
              <Line>
                <Words words={["Your", "AI"]} from={0} className="font-light" /> <GlossPill />
                <Words words={["remembers."]} from={2} className="font-semibold" />
              </Line>{" "}
              <Line>
                <Words words={["Your"]} from={3} className="font-light" />{" "}
                <Words words={["intelligence", "evolves."]} from={4} className="brand-gradient-text font-semibold" />
              </Line>
            </h1>
            <p className="fade-up mt-6 max-w-xl text-base leading-7 text-scene-muted md:text-lg md:leading-8" style={delay(750)}>
              Meet RecallIQ, the AI agent that learns from experience, verifies its decisions, and gets smarter about the tools it uses.
            </p>
            <div className="fade-up mt-9 flex flex-wrap items-center gap-3" style={delay(850)}>
              <Link
                href="/sign-up"
                className="bg-brand-gradient group inline-flex h-12 items-center gap-2 rounded-full px-7 text-base font-semibold text-white shadow-[0_16px_36px_-14px_rgb(49_86_227/0.75)] transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_20px_40px_-14px_rgb(49_86_227/0.85)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none"
              >
                Launch RecallIQ
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
              </Link>
              <ScrollLink
                to="inside"
                className="glass-scene inline-flex h-12 items-center gap-2 rounded-full px-7 text-base font-medium text-scene-fg transition-colors hover:bg-scene-raise-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                See How It Works
              </ScrollLink>
            </div>
            <p className="fade-up mt-5 text-sm text-scene-muted" style={delay(950)}>
              No wallet needed for read-only investigations ·{" "}
              <Link href="/sign-in?guest=1" className="font-medium text-scene-accent underline-offset-4 hover:underline">
                try it as a guest
              </Link>
            </p>
          </div>

          {/* Visual: emblem, glossy memory layers and capability cards */}
          <m.div style={{ scale: stageScale, y: stageY }} className="relative mx-auto aspect-square w-full max-w-[300px] sm:max-w-[420px] lg:max-w-[560px]">
            <div
              className="hero-glow-in absolute inset-[-12%] rounded-full bg-[radial-gradient(closest-side,rgb(24_204_249/0.28),rgb(119_84_238/0.14)_55%,transparent)] blur-2xl"
              aria-hidden
            />
            <m.div style={{ x: layersX, y: layersY }} className="absolute inset-0" aria-hidden>
              <MemoryLayers />
            </m.div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="emblem-in w-[58%]">
                <div className="float-slow perspective-1200">
                  <m.div style={{ rotateX: tiltX, rotateY: tiltY }} className="preserve-3d">
                    <Image
                      src="/brand/recalliq-mark.png"
                      alt="RecallIQ emblem: the walrus inside a magnifying-glass Q"
                      width={512}
                      height={512}
                      preload
                      fetchPriority="high"
                      sizes="(min-width: 1024px) 350px, (min-width: 640px) 260px, 190px"
                      className="h-auto w-full drop-shadow-[0_34px_50px_rgb(20_90_200/0.28)]"
                    />
                  </m.div>
                </div>
              </div>
            </div>
            {CARDS.map((c, i) => (
              <FloatingCard key={c.title} card={c} index={i} px={px} py={py} />
            ))}
          </m.div>

          {/* Below xl the cards would not fit around the emblem: the same four ideas as a simple list. */}
          <ul className="grid gap-3 sm:grid-cols-2 lg:col-span-2 lg:grid-cols-4 xl:hidden" aria-label="What RecallIQ does">
            {CARDS.map((c) => (
              <li key={c.title}>
                <CardBody card={c} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Scene>
  );
}

/** One headline line; words rise out of their own mask. */
function Line({ children }: { children: React.ReactNode }) {
  return <span className="block">{children}</span>;
}

function Words({ words, from, className }: { words: string[]; from: number; className?: string }) {
  return (
    <>
      {words.map((w, i) => (
        <Fragment key={w}>
          <span className="-mb-[0.14em] inline-block overflow-hidden pb-[0.14em] align-bottom">
            <span className={cn("word-rise inline-block", className)} style={{ "--i": from + i } as React.CSSProperties}>
              {w}
            </span>
          </span>
          {i < words.length - 1 ? " " : null}
        </Fragment>
      ))}
    </>
  );
}

/** The glossy capsule set into the headline, after the reference's inline image pills. Decorative. */
function GlossPill() {
  return (
    <span
      className="pill-in gloss-iridescent gloss-sheen relative mr-[0.22em] inline-block h-[0.72em] w-[1.7em] translate-y-[-0.06em] overflow-hidden rounded-full align-middle"
      aria-hidden
    />
  );
}

/** Fanned translucent "memory layers" behind the emblem, with a glossy arc. */
function MemoryLayers() {
  return (
    <>
      <div className="depth-in absolute left-[14%] top-[8%] h-[46%] w-[64%]" style={delay(300)}>
        <div className="gloss-iridescent size-full -rotate-[16deg] rounded-[2rem] opacity-80" />
      </div>
      <div className="depth-in absolute right-[8%] top-[20%] h-[46%] w-[60%]" style={delay(380)}>
        <div className="gloss-glass size-full rotate-[11deg] rounded-[2rem]" />
      </div>
      <div className="depth-in absolute bottom-[8%] left-[20%] size-[34%]" style={delay(460)}>
        <div className="gloss-arc gloss-sheen size-full overflow-hidden rounded-full" />
      </div>
    </>
  );
}

function CardBody({ card, className }: { card: (typeof CARDS)[number]; className?: string }) {
  const Icon = card.icon;
  return (
    <div className={cn("glass-scene flex items-start gap-3 rounded-2xl p-3.5 pr-4", className)}>
      <span className="bg-brand-gradient flex size-9 shrink-0 items-center justify-center rounded-xl shadow-[0_8px_18px_-8px_rgb(49_86_227/0.8)]">
        <Icon className="size-4 text-white" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-scene-accent">{card.tag}</span>
        <span className="mt-0.5 block text-sm font-semibold text-scene-fg">{card.title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-scene-muted">{card.text}</span>
      </span>
    </div>
  );
}

function FloatingCard({ card, index, px, py }: { card: (typeof CARDS)[number]; index: number; px: MotionValue<number>; py: MotionValue<number> }) {
  const x = useTransform(px, (v) => v * 40 * card.depth);
  const y = useTransform(py, (v) => v * 30 * card.depth);
  return (
    <div className={cn("absolute hidden w-[15.5rem] xl:block", card.pos)} aria-hidden>
      <m.div style={{ x, y }}>
        <div className="depth-in" style={delay(950 + index * 120)}>
          <div className="float-slow" style={{ animationDelay: card.float }}>
            <CardBody card={card} />
          </div>
        </div>
      </m.div>
    </div>
  );
}
