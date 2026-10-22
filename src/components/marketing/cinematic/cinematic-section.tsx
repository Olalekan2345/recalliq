"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useInView } from "motion/react";
import { MaskedHeading, Reveal } from "@/components/motion/primitives";
import { Eyebrow, Scene } from "../scene";
import { FILM_VH } from "./chapters";
import { StackedChapters } from "./stacked";

/* The film is decorative and heavy (many 3D layers): it ships as its own chunk, outside first hydration. */
const Film = dynamic(() => import("./film").then((m) => m.Film), { ssr: false, loading: () => <FilmPlaceholder /> });

/** Same height as the film, so mounting it never shifts the page. */
function FilmPlaceholder() {
  return (
    <div className="relative" style={{ height: `${FILM_VH}vh` }}>
      <div className="cine-stage sticky top-0 h-screen" />
    </div>
  );
}

/** Mounts the film once the page is idle and the section is near the viewport. */
function LazyFilm() {
  const ref = useRef<HTMLDivElement>(null);
  const near = useInView(ref, { once: true, margin: "600px 0px" });
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    if (!near) return;
    const ric = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 300));
    const id = ric(() => setIdle(true), { timeout: 1500 });
    return () => (window.cancelIdleCallback ?? window.clearTimeout)(id);
  }, [near]);
  return <div ref={ref}>{near && idle ? <Film /> : <FilmPlaceholder />}</div>;
}

/**
 * "Inside RecallIQ": the product story as a six-chapter scroll film (desktop)
 * or stacked chapters (phones, reduced motion). Self-contained: remove this
 * component from the homepage and nothing else changes.
 */
export function CinematicSection() {
  return (
    <>
      <Scene id="inside" labelledBy="inside-title" tone="lavender" from="ice" className="isolate">
        <header className="mx-auto max-w-6xl px-4 pb-14 pt-24 md:px-6 md:pt-28">
          <Eyebrow>Inside RecallIQ</Eyebrow>
          <MaskedHeading
            id="inside-title"
            lines={["Intelligence That Learns."]}
            wordClassName={() => "brand-gradient-text"}
            className="mt-5 font-display text-4xl font-semibold leading-[1.06] tracking-[-0.03em] md:text-6xl"
          />
          <Reveal>
            <p className="mt-6 max-w-2xl text-base leading-7 text-scene-muted md:text-lg">
              See how RecallIQ investigates real blockchain activity, remembers what matters, verifies its decisions, and becomes more informed with every
              experience.
            </p>
          </Reveal>
        </header>
        {/* The scroll film runs only on large screens when the visitor allows motion (class names must stay literal for Tailwind). */}
        <div className="hidden [@media(min-width:64rem)_and_(prefers-reduced-motion:no-preference)]:block">
          <LazyFilm />
        </div>
        <div className="[@media(min-width:64rem)_and_(prefers-reduced-motion:no-preference)]:hidden">
          <StackedChapters />
        </div>
      </Scene>
      <div id="after-film" tabIndex={-1} className="scroll-mt-20 outline-none" />
    </>
  );
}
