"use client";

/**
 * Reusable motion primitives. Everything here is decorative: content is in the
 * DOM from the first render, nothing waits on an animation to become usable,
 * and reduced-motion users get static layouts.
 */
import { Fragment, useRef, useSyncExternalStore } from "react";
import { m, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from "motion/react";
import { cn } from "@/lib/utils";
import { DURATION, EASE_OUT, SPRING_SOFT, STAGGER } from "@/lib/motion";

const subscribeReducedMotion = (cb: () => void) => {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

/**
 * True only on the client, after hydration, when the user has not asked for
 * reduced motion. For purely decorative extras that should not exist in the
 * server HTML at all (so server and client markup always match).
 */
export function useAmbientMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

/** Fades and lifts children in once they enter the viewport. */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 24,
  as = "div",
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  as?: "div" | "li" | "section" | "p";
}) {
  const Comp = m[as];
  return (
    <Comp
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: DURATION.slow, ease: EASE_OUT, delay }}
    >
      {children}
    </Comp>
  );
}

/**
 * Heading whose words rise out of a mask, staggered, one block per line. The
 * text stays real text separated by ordinary spaces. Per-word classes (e.g. a
 * gradient) go on each word: background-clip text does not paint through
 * transformed children.
 */
export function MaskedHeading({
  lines,
  as = "h2",
  id,
  className,
  wordClassName,
  delay = 0,
  onMount = false,
}: {
  lines: string[];
  as?: "h1" | "h2" | "h3" | "p";
  id?: string;
  className?: string;
  wordClassName?: (lineIndex: number) => string | undefined;
  delay?: number;
  /** Animate on first paint (hero) instead of on entering the viewport. */
  onMount?: boolean;
}) {
  const Comp = m[as];
  const trigger = onMount ? { animate: "shown" } : { whileInView: "shown", viewport: { once: true, amount: 0.6 } };
  return (
    <Comp id={id} className={className} initial="hidden" {...trigger} transition={{ staggerChildren: STAGGER.base, delayChildren: delay }}>
      {lines.map((line, li) => (
        <Fragment key={li}>
          {li > 0 ? " " : null}
          <span className="block">
            {line.split(" ").map((w, i, words) => (
              <Fragment key={i}>
                <span className="-mb-[0.14em] inline-block overflow-hidden pb-[0.14em] align-bottom">
                  <m.span
                    className={cn("inline-block", wordClassName?.(li))}
                    variants={{ hidden: { y: "105%", opacity: 0 }, shown: { y: "0%", opacity: 1 } }}
                    transition={{ duration: DURATION.cinematic, ease: EASE_OUT }}
                  >
                    {w}
                  </m.span>
                </span>
                {i < words.length - 1 ? " " : null}
              </Fragment>
            ))}
          </span>
        </Fragment>
      ))}
    </Comp>
  );
}

/**
 * Scroll-progress for an element (0 when its top reaches 85% of the viewport,
 * 1 when its bottom passes 35%). Frozen at 1 for reduced-motion users.
 */
export function useSceneProgress(ref: React.RefObject<HTMLElement | null>, offset: [string, string] = ["start 0.85", "end 0.35"]): MotionValue<number> {
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: offset as never });
  const done = useMotionValue(1);
  return reduced ? done : scrollYProgress;
}

/** Words light up one by one as the paragraph scrolls through the viewport. */
export function ScrollWords({
  text,
  className,
  highlight,
  as: Comp = "p",
  id,
}: {
  text: string;
  className?: string;
  highlight?: (word: string) => boolean;
  as?: "p" | "h2";
  id?: string;
}) {
  const ref = useRef<HTMLHeadingElement & HTMLParagraphElement>(null);
  const progress = useSceneProgress(ref, ["start 0.8", "end 0.45"]);
  const words = text.split(" ");
  return (
    <Comp ref={ref} id={id} className={className}>
      {words.map((w, i) => (
        <Word
          key={`${w}-${i}`}
          progress={progress}
          range={[i / words.length, (i + 1) / words.length]}
          className={highlight?.(w) ? "brand-gradient-text" : undefined}
        >
          {w}
          {i < words.length - 1 ? " " : ""}
        </Word>
      ))}
    </Comp>
  );
}

function Word({
  children,
  progress,
  range,
  className,
}: {
  children: React.ReactNode;
  progress: MotionValue<number>;
  range: [number, number];
  className?: string;
}) {
  const opacity = useTransform(progress, range, [0.18, 1]);
  return (
    <m.span style={{ opacity }} className={className}>
      {children}
    </m.span>
  );
}

/** Card that tilts toward the pointer (fine pointers only, never under reduced motion). */
export function TiltCard({ children, className, max = 7 }: { children: React.ReactNode; className?: string; max?: number }) {
  const reduced = useReducedMotion();
  const rx = useSpring(0, SPRING_SOFT);
  const ry = useSpring(0, SPRING_SOFT);
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduced || e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    ry.set(((e.clientX - r.left) / r.width - 0.5) * 2 * max);
    rx.set(-((e.clientY - r.top) / r.height - 0.5) * 2 * max);
  };
  const reset = () => {
    rx.set(0);
    ry.set(0);
  };
  return (
    <div className="perspective-1200">
      <m.div className={cn("preserve-3d", className)} style={{ rotateX: rx, rotateY: ry }} onPointerMove={onMove} onPointerLeave={reset}>
        {children}
      </m.div>
    </div>
  );
}

/** Vertical parallax for a decorative layer, tied to a scene's scroll position. */
export function Parallax({ children, className, distance = 60 }: { children: React.ReactNode; className?: string; distance?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const progress = useSceneProgress(ref, ["start end", "end start"]);
  const reduced = useReducedMotion();
  const y = useTransform(progress, [0, 1], reduced ? [0, 0] : [distance, -distance]);
  return (
    <m.div ref={ref} className={className} style={{ y }}>
      {children}
    </m.div>
  );
}
