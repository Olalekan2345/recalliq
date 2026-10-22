/**
 * Motion tokens. One vocabulary for every animated surface: a calm expo-out
 * for entrances, short durations in the app, longer ones only for cinematic
 * marketing scenes. Reduced-motion users get opacity-only transitions
 * (MotionConfig reducedMotion="user") and static scroll scenes.
 */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;
export const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const;

export const DURATION = {
  fast: 0.18,
  base: 0.32,
  slow: 0.6,
  cinematic: 0.9,
} as const;

export const STAGGER = { tight: 0.04, base: 0.07, loose: 0.12 } as const;

/** Springs for pointer-driven motion (tilt, parallax): soft, no overshoot. */
export const SPRING_SOFT = { stiffness: 120, damping: 20, mass: 0.6 } as const;
