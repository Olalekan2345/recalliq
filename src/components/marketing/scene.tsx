"use client";

import { useRef } from "react";
import { useInView, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * A homepage scene. Pauses its CSS animations (aurora, rings, floating chips)
 * while it is far off-screen so idle sections cost nothing.
 */
export function Scene({ id, labelledBy, className, children }: { id?: string; labelledBy?: string; className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { margin: "300px 0px" });
  return (
    <section
      ref={ref}
      id={id}
      tabIndex={id ? -1 : undefined}
      aria-labelledby={labelledBy}
      data-paused={inView ? undefined : ""}
      className={cn("relative scroll-mt-20 outline-none", className)}
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

export function Eyebrow({ children, className, tone = "dark" }: { children: React.ReactNode; className?: string; tone?: "dark" | "light" }) {
  return (
    <p
      className={cn(
        "inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em]",
        tone === "dark" ? "text-[#7fe3ff]" : "text-primary",
        className,
      )}
    >
      <span className="h-px w-6 bg-current opacity-60" aria-hidden />
      {children}
    </p>
  );
}

/** Soft aurora lighting for midnight scenes. Decorative only. */
export function Aurora({ variant = "hero" }: { variant?: "hero" | "violet" | "cyan" }) {
  const blobs =
    variant === "hero"
      ? [
          "left-[-10%] top-[-20%] h-[60vh] w-[60vw] bg-[radial-gradient(closest-side,rgb(24_204_249/0.35),transparent)]",
          "right-[-15%] top-[10%] h-[70vh] w-[55vw] bg-[radial-gradient(closest-side,rgb(153_118_249/0.32),transparent)]",
          "left-[20%] bottom-[-30%] h-[60vh] w-[70vw] bg-[radial-gradient(closest-side,rgb(50_84_228/0.4),transparent)]",
        ]
      : variant === "violet"
        ? [
            "right-[-10%] top-[0%] h-[70vh] w-[60vw] bg-[radial-gradient(closest-side,rgb(153_118_249/0.3),transparent)]",
            "left-[-10%] bottom-[-20%] h-[60vh] w-[50vw] bg-[radial-gradient(closest-side,rgb(50_84_228/0.3),transparent)]",
          ]
        : [
            "left-[-10%] top-[10%] h-[60vh] w-[55vw] bg-[radial-gradient(closest-side,rgb(24_204_249/0.24),transparent)]",
            "right-[-10%] bottom-[-10%] h-[60vh] w-[50vw] bg-[radial-gradient(closest-side,rgb(153_118_249/0.24),transparent)]",
          ];
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
      {blobs.map((b) => (
        <div key={b} className={cn("aurora-drift absolute rounded-full blur-2xl", b)} />
      ))}
      <div className="bg-grid-dark absolute inset-0 opacity-60" />
    </div>
  );
}
