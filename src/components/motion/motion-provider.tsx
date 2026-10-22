"use client";

import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import { DURATION, EASE_OUT } from "@/lib/motion";

/**
 * Loads only the DOM animation features (no drag/layout) and honours the OS
 * reduced-motion setting: transforms are dropped, opacity fades remain.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user" transition={{ duration: DURATION.base, ease: EASE_OUT }}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
