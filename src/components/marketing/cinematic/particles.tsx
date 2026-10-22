"use client";

import { useEffect, useRef } from "react";
import type { MotionValue } from "motion/react";

interface Particle {
  angle: number;
  radius: number;
  speed: number;
  size: number;
  hue: number;
  phase: number;
}

/**
 * Light particles converging on the hologram as the memory chapter plays.
 * Additive glow on the dark stage; plain, deeper dots on the light one
 * (additive blending vanishes against a pale background).
 * Convergence follows scroll progress through [from, to]; the loop only runs
 * while that window is on screen and the canvas is visible.
 */
export function ConvergingParticles({ progress, from, to, count = 140 }: { progress: MotionValue<number>; from: number; to: number; count?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const particles: Particle[] = Array.from({ length: count }, () => ({
      angle: Math.random() * Math.PI * 2,
      radius: 0.35 + Math.random() * 0.65,
      speed: 0.15 + Math.random() * 0.5,
      size: 0.6 + Math.random() * 1.8,
      hue: Math.random() < 0.7 ? 192 : 258,
      phase: Math.random() * Math.PI * 2,
    }));

    let frame = 0;
    let visible = false;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = (t: number) => {
      frame = 0;
      const p = progress.get();
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      const local = (p - from) / (to - from);
      if (local <= 0 || local >= 1) return;
      // Fade in, converge, then hold as an orbiting halo; fade out at the end.
      const converge = Math.min(1, local / 0.45);
      const ease = 1 - Math.pow(1 - converge, 3);
      const alpha = Math.min(1, local / 0.08) * Math.min(1, (1 - local) / 0.12);
      const cx = w / 2;
      const cy = h * 0.46;
      const reach = Math.max(w, h) * 0.55;
      const dark = document.documentElement.classList.contains("dark");
      ctx.globalCompositeOperation = dark ? "lighter" : "source-over";
      for (const pt of particles) {
        const swirl = pt.angle + (t / 1000) * pt.speed * 0.6 + ease * 2.2;
        const r = reach * pt.radius * (1 - ease) + 90 * pt.radius * ease;
        const x = cx + Math.cos(swirl) * r;
        const y = cy + Math.sin(swirl) * r * 0.62;
        const twinkle = 0.6 + 0.4 * Math.sin(t / 400 + pt.phase);
        ctx.beginPath();
        ctx.fillStyle = dark ? `hsla(${pt.hue}, 95%, 72%, ${0.75 * alpha * twinkle})` : `hsla(${pt.hue}, 85%, 55%, ${0.6 * alpha * twinkle})`;
        ctx.arc(x, y, pt.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
      if (visible) frame = requestAnimationFrame(draw);
    };

    const start = () => {
      if (!frame && visible) frame = requestAnimationFrame(draw);
    };
    const unsubscribe = progress.on("change", start);
    const io = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
      if (visible) start();
    });
    io.observe(canvas);

    return () => {
      unsubscribe();
      io.disconnect();
      window.removeEventListener("resize", resize);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [progress, from, to, count]);

  return <canvas ref={ref} className="pointer-events-none absolute inset-0 size-full" aria-hidden />;
}
