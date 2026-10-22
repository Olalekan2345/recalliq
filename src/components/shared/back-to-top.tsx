"use client";

import { ArrowUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Mascot } from "@/components/brand/mascot";
import { cn } from "@/lib/utils";

const RADIUS = 23;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Floating "back to top" control for long pages: the walrus's head with an
 * arrow badge. It appears once the reader is
 * a screen and a half down, its gradient ring shows how far through the page
 * they are, and it steps aside while an element marked
 * `data-hide-back-to-top` covers its corner (the homepage film, which has its
 * own controls there). Activating it scrolls home and moves focus to the
 * page's main heading, so keyboard users land at the top too.
 */
export function BackToTop() {
  const ring = useRef<SVGCircleElement>(null);
  const [visible, setVisible] = useState(false);

  /*
   * Scrolling never reads layout here: on the homepage every scroll frame
   * already re-renders a heavy 3D film, and a forced layout per frame (from
   * scrollHeight or getBoundingClientRect) made it noticeably slower. The page
   * height comes from a ResizeObserver and "covered" from an IntersectionObserver.
   */
  useEffect(() => {
    let frame = 0;
    let max = 0;
    let covered = false;
    const covering = new Set<Element>();
    let observed = new WeakSet<Element>();
    let io: IntersectionObserver | undefined;

    const render = () => {
      frame = 0;
      const y = window.scrollY;
      // Written straight to the DOM: the ring follows every scroll frame without re-rendering.
      ring.current?.style.setProperty("stroke-dashoffset", String(CIRCUMFERENCE * (1 - (max > 0 ? Math.min(1, y / max) : 0))));
      const next = y > window.innerHeight * 1.5 && !covered;
      setVisible((v) => (v === next ? v : next));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(render);
    };

    // Elements that ask the button to step aside, watched within the bottom band of the viewport where it sits.
    const watchNew = () => {
      if (!io) return;
      for (const el of document.querySelectorAll("[data-hide-back-to-top]")) {
        if (!observed.has(el)) {
          observed.add(el);
          io.observe(el);
        }
      }
    };
    const createObserver = () => {
      io?.disconnect();
      covering.clear();
      covered = false;
      observed = new WeakSet();
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) covering.add(e.target);
            else covering.delete(e.target);
          }
          covered = covering.size > 0;
          schedule();
        },
        { rootMargin: `-${Math.max(0, window.innerHeight - 100)}px 0px 0px 0px` },
      );
      watchNew();
    };
    const measure = () => {
      max = document.documentElement.scrollHeight - window.innerHeight;
      schedule();
    };
    const onScroll = () => {
      watchNew(); // the film mounts lazily, after this component
      schedule();
    };
    const onResize = () => {
      createObserver();
      measure();
    };

    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    createObserver();
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      ro.disconnect();
      io?.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const toTop = () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const heading = document.querySelector<HTMLElement>("main h1") ?? document.querySelector<HTMLElement>("h1");
    if (heading) {
      if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }
    if (reduce) {
      window.scrollTo({ top: 0, behavior: "auto" });
      return;
    }
    // From far down, jump to a screen from the top and glide the rest: smooth-scrolling the whole
    // homepage would render every frame of the 3D film on the way and take seconds on slower devices.
    if (window.scrollY > window.innerHeight * 2) window.scrollTo({ top: window.innerHeight, behavior: "auto" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <button
      type="button"
      onClick={toTop}
      aria-label="Back to top"
      inert={!visible}
      className={cn(
        "glass-scene group fixed bottom-5 right-5 z-40 flex size-14 items-center justify-center rounded-full text-scene-fg md:bottom-8 md:right-8",
        "transition-[opacity,translate,scale,visibility,box-shadow] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
        "hover:shadow-[0_18px_40px_-14px_rgb(49_86_227/0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        visible
          ? "visible translate-y-0 scale-100 opacity-100"
          : "invisible pointer-events-none translate-y-3 scale-90 opacity-0 motion-reduce:translate-y-0 motion-reduce:scale-100",
      )}
    >
      {/* Reading progress: a hairline track and the brand gradient filling clockwise from the top. */}
      <svg viewBox="0 0 48 48" className="absolute inset-0 size-full -rotate-90" aria-hidden>
        <defs>
          <linearGradient id="back-to-top-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#18ccf9" />
            <stop offset="0.55" stopColor="#3254e4" />
            <stop offset="1" stopColor="#9976f9" />
          </linearGradient>
        </defs>
        <circle cx="24" cy="24" r={RADIUS} fill="none" className="stroke-scene-line" strokeWidth="2" />
        <circle
          ref={ring}
          cx="24"
          cy="24"
          r={RADIUS}
          fill="none"
          stroke="url(#back-to-top-ring)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE}
        />
      </svg>
      {/* The walrus peeks up on hover; the arrow badge says where it goes. */}
      <span className="relative size-11 transition-[translate,rotate,scale] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:-translate-y-0.5 group-hover:-rotate-6 group-active:scale-95 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0 motion-reduce:group-hover:rotate-0">
        <span className="block size-full overflow-hidden rounded-full shadow-[0_8px_18px_-8px_rgb(49_86_227/0.85)] ring-2 ring-white/90 dark:ring-white/20">
          <Mascot variant="head" decorative sizes="44px" className="size-full object-cover" />
        </span>
        <span className="bg-brand-gradient absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full text-white shadow-[0_4px_10px_-4px_rgb(49_86_227/0.9)] ring-2 ring-card transition-[translate] duration-300 group-hover:-translate-y-1 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0">
          <ArrowUp className="size-3" strokeWidth={3} aria-hidden />
        </span>
      </span>
      {/* Label for pointer users; the button's accessible name already says the same. */}
      <span
        className="glass-scene pointer-events-none absolute right-full mr-3 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium text-scene-fg opacity-0 transition-[opacity,translate] duration-200 translate-x-1 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 motion-reduce:transition-none"
        aria-hidden
      >
        Back to top
      </span>
    </button>
  );
}
