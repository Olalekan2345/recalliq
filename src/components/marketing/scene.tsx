"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/** Section tones (globals.css --sec-*): light pastels by default, deep navy shades in dark mode. */
export type SectionTone = "white" | "frost" | "soft" | "ice" | "lavender" | "aqua";

/**
 * A homepage scene. Pauses its CSS animations (aurora, rings, floating chips)
 * while it is far off-screen so idle sections cost nothing. With `tone`, the
 * section fills with that tone and its top blends in from the previous
 * section's tone (`from`), so the page reads as one continuous surface.
 */
export function Scene({
  id,
  labelledBy,
  className,
  tone,
  from,
  children,
}: {
  id?: string;
  labelledBy?: string;
  className?: string;
  tone?: SectionTone;
  from?: SectionTone;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  // Unknown (null) until observed, so entrance animations in the server HTML start before hydration.
  const [inView, setInView] = useState<boolean | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setInView(Boolean(entry?.isIntersecting)), { rootMargin: "300px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <section
      ref={ref}
      id={id}
      tabIndex={id ? -1 : undefined}
      aria-labelledby={labelledBy}
      data-paused={inView === false ? "" : undefined}
      style={tone ? { background: `linear-gradient(180deg, var(--sec-${from ?? tone}) 0, var(--sec-${tone}) 14rem)` } : undefined}
      className={cn("relative scroll-mt-20 text-scene-fg outline-none", className)}
    >
      {children}
    </section>
  );
}

/** In-page link that scrolls smoothly unless the user prefers reduced motion. */
export function ScrollLink({ to, className, children }: { to: string; className?: string; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <a
      href={`#${to}`}
      className={className}
      onClick={(e) => {
        const el = document.getElementById(to);
        if (!el) return;
        e.preventDefault();
        el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
        history.replaceState(null, "", `#${to}`);
        el.focus({ preventScroll: true });
      }}
    >
      {children}
    </a>
  );
}

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-scene-accent", className)}>
      <span className="h-px w-6 bg-current opacity-60" aria-hidden />
      {children}
    </p>
  );
}

/**
 * Soft pastel lighting for a section: cyan, cobalt and lavender haze over the
 * section tone (a glow in dark mode). Decorative only.
 */
export function Aurora({ variant = "hero", grid = true }: { variant?: "hero" | "violet" | "cyan"; grid?: boolean }) {
  const blobs =
    variant === "hero"
      ? [
          "right-[-10%] top-[-15%] h-[70vh] w-[55vw] bg-[radial-gradient(closest-side,rgb(24_204_249/0.22),transparent)]",
          "right-[10%] top-[25%] h-[60vh] w-[45vw] bg-[radial-gradient(closest-side,rgb(119_84_238/0.16),transparent)]",
          "left-[-15%] bottom-[-25%] h-[60vh] w-[60vw] bg-[radial-gradient(closest-side,rgb(49_86_227/0.12),transparent)]",
        ]
      : variant === "violet"
        ? [
            "right-[-10%] top-[0%] h-[70vh] w-[60vw] bg-[radial-gradient(closest-side,rgb(119_84_238/0.16),transparent)]",
            "left-[-10%] bottom-[-20%] h-[60vh] w-[50vw] bg-[radial-gradient(closest-side,rgb(24_204_249/0.14),transparent)]",
          ]
        : [
            "left-[-10%] top-[10%] h-[60vh] w-[55vw] bg-[radial-gradient(closest-side,rgb(24_204_249/0.16),transparent)]",
            "right-[-10%] bottom-[-10%] h-[60vh] w-[50vw] bg-[radial-gradient(closest-side,rgb(119_84_238/0.13),transparent)]",
          ];
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
      {blobs.map((b) => (
        <div key={b} className={cn("aurora-drift absolute rounded-full blur-2xl", b)} />
      ))}
      {grid ? <div className="bg-grid-scene absolute inset-0 opacity-70" /> : null}
    </div>
  );
}
