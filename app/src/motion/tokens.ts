import type { Transition } from 'motion/react'

export const dur = {
  instant: 0.09,
  fast: 0.16,
  base: 0.24,
  slow: 0.42,
  reveal: 0.64,
} as const

export const ease = {
  standard: [0.2, 0, 0, 1],
  enter: [0, 0, 0.2, 1],
  exit: [0.4, 0, 1, 1],
  sweep: [0.4, 0, 0.6, 1],
} as const

// Damping ratios are deliberate: controls are critically damped because a control that
// wobbles reads as unreliable, while large surfaces get a little life.
export const spring = {
  snap: { type: 'spring', stiffness: 520, damping: 34, mass: 0.7 },
  glide: { type: 'spring', stiffness: 260, damping: 30, mass: 1 },
  settle: { type: 'spring', stiffness: 140, damping: 22, mass: 1.2 },
  counter: { type: 'spring', stiffness: 180, damping: 26, mass: 1 },
  pop: { type: 'spring', stiffness: 600, damping: 18, mass: 0.6 },
} satisfies Record<string, Transition>

export const stagger = {
  tight: 0.03,
  base: 0.055,
  loose: 0.09,
  lead: 0.04,
} as const

/**
 * Reduced motion may remove motion; it may never remove information. Anything that
 * carries meaning (a frame changing, a counter advancing) keeps a short transition rather
 * than snapping, because snapping is worse for motion sensitivity, not better.
 */
export const reduce = (transition: Transition, reduced: boolean): Transition =>
  reduced ? { duration: 0.12, ease: 'linear' } : transition
