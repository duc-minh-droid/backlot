import type { Variants } from 'motion/react'
import { dur, ease, spring, stagger } from './tokens'

export const stageChipVariants: Variants = {
  pending: {
    backgroundColor: 'var(--bg-2)',
    borderColor: 'var(--line-1)',
    opacity: 1,
    transition: { duration: dur.base, ease: ease.standard },
  },
  unreached: {
    backgroundColor: 'var(--bg-2)',
    borderColor: 'var(--line-1)',
    opacity: 0.35,
    transition: { duration: dur.base, ease: ease.standard },
  },
  loading: {
    backgroundColor: 'var(--load-bg)',
    borderColor: 'var(--load)',
    opacity: 1,
    transition: { duration: dur.fast, ease: ease.enter },
  },
  sampling: {
    backgroundColor: 'var(--accent-bg)',
    borderColor: 'var(--accent)',
    opacity: 1,
    transition: { duration: dur.fast, ease: ease.enter },
  },
  finished: {
    backgroundColor: 'var(--bg-2)',
    borderColor: 'var(--line-2)',
    opacity: 1,
    transition: { duration: dur.base, ease: ease.standard },
  },
  cached: {
    backgroundColor: 'var(--cache-bg)',
    borderColor: 'var(--cache)',
    opacity: 1,
    scale: [0.92, 1.04, 1],
    transition: { scale: spring.pop, default: { duration: dur.base } },
  },
  errored: {
    backgroundColor: 'var(--danger-bg)',
    borderColor: 'var(--danger)',
    opacity: 1,
    x: [0, -3, 3, -2, 2, 0],
    transition: { x: { duration: 0.3, ease: ease.standard }, default: { duration: dur.fast } },
  },
}

export const timelineVariants: Variants = {
  idle: {},
  active: { transition: { staggerChildren: stagger.base, delayChildren: stagger.lead } },
}

/**
 * The byte scanner. A highlight sweeps across a rail it never consumes: nothing
 * accumulates, there is no advancing left edge, so it cannot be misread as progress.
 */
export const scannerVariants: Variants = {
  idle: { x: '-30%', opacity: 0 },
  active: {
    x: ['-30%', '130%'],
    opacity: 0.65,
    transition: {
      x: { duration: 1.4, ease: ease.sweep, repeat: Infinity, repeatType: 'loop' },
      opacity: { duration: dur.fast },
    },
  },
  still: { x: '50%', opacity: 0.4, transition: { duration: 0 } },
}

export const canvasVariants: Variants = {
  hidden: { opacity: 0, scale: 0.985 },
  visible: { opacity: 1, scale: 1, transition: spring.settle },
  failed: { filter: 'grayscale(0.65) brightness(0.8)', transition: { duration: dur.slow } },
}

export const logLineVariants: Variants = {
  hidden: { opacity: 0, x: -6 },
  visible: { opacity: 1, x: 0, transition: { duration: dur.fast, ease: ease.enter } },
  // No exit: eviction from the ring buffer must be instant.
}

export const refThumbVariants: Variants = {
  hidden: { opacity: 0, scale: 0.86, y: 8 },
  visible: { opacity: 1, scale: 1, y: 0, transition: spring.snap },
  exit: { opacity: 0, scale: 0.9, transition: { duration: dur.instant, ease: ease.exit } },
}

export const dropzoneVariants: Variants = {
  rest: { scale: 1, backgroundColor: 'var(--bg-2)', borderColor: 'var(--line-1)', transition: spring.snap },
  over: { scale: 1.012, backgroundColor: 'var(--accent-bg)', borderColor: 'var(--accent)', transition: spring.snap },
  reject: {
    scale: 1,
    backgroundColor: 'var(--danger-bg)',
    borderColor: 'var(--danger)',
    x: [0, -4, 4, 0],
    transition: { x: { duration: 0.24 }, default: spring.snap },
  },
}

export const panelVariants: Variants = {
  hidden: { opacity: 0, y: -8 },
  visible: { opacity: 1, y: 0, transition: spring.snap },
  exit: { opacity: 0, y: -4, transition: { duration: dur.instant, ease: ease.exit } },
}
