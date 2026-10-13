import type { Transition, Variants } from 'motion/react';

/** Seconds. Mirrors --motion-fast / --motion-base / --motion-slow in index.css. */
export const DURATION = { fast: 0.12, base: 0.18, slow: 0.24 } as const;
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;
export const EASE_IN = [0.4, 0, 1, 1] as const;
export const EXIT_RATIO = 0.75;

export function enterTransition(duration: number): Transition {
  return { duration, ease: EASE_OUT };
}

export function exitTransition(duration: number): Transition {
  return { duration: duration * EXIT_RATIO, ease: EASE_IN };
}

type Pose = Record<string, number | string>;

function variants(hidden: Pose, shown: Pose, duration: number): Variants {
  return {
    initial: hidden,
    animate: { ...shown, transition: enterTransition(duration) },
    exit: { ...hidden, transition: exitTransition(duration) },
  };
}

export const fade = variants({ opacity: 0 }, { opacity: 1 }, DURATION.base);

export const scaleIn = variants(
  { opacity: 0, scale: 0.97 },
  { opacity: 1, scale: 1 },
  DURATION.base
);

export const slideInRight = variants(
  { opacity: 0, x: 24 },
  { opacity: 1, x: 0 },
  DURATION.slow
);

export const slideUp = variants({ opacity: 0, y: 8 }, { opacity: 1, y: 0 }, DURATION.base);

export const collapse = variants(
  { opacity: 0, height: 0 },
  { opacity: 1, height: 'auto' },
  DURATION.slow
);

/** Enter only: the outgoing view unmounts immediately. */
export const viewEnter: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: enterTransition(DURATION.fast) },
};

export type PopOrigin = 'top' | 'bottom' | 'left' | 'right';

const POP_OFFSET: Record<PopOrigin, Pose> = {
  top: { y: -4 },
  bottom: { y: 4 },
  left: { x: -4 },
  right: { x: 4 },
};

/** `origin` is the side of the popover that touches its trigger. */
export function popIn(origin: PopOrigin): Variants {
  const offset = POP_OFFSET[origin];
  const rest = Object.fromEntries(Object.keys(offset).map((axis) => [axis, 0]));
  return variants(
    { opacity: 0, scale: 0.96, ...offset },
    { opacity: 1, scale: 1, ...rest },
    DURATION.base
  );
}
