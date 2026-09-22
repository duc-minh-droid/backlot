import { useEffect } from 'react'
import { useMotionValue, type MotionValue } from 'motion/react'

/**
 * Drives an elapsed clock as a MotionValue rather than React state.
 *
 * At 10 Hz through the reconciler this would cost a render every 100ms for the whole run,
 * competing with image decodes for the main thread. Consumers subscribe and write
 * textContent directly.
 */
export function useElapsed(t0: number | undefined, active: boolean): MotionValue<number> {
  const elapsed = useMotionValue(0)

  useEffect(() => {
    if (t0 === undefined || !active) return
    let frame = 0
    let last = 0

    const tick = () => {
      const now = performance.now() - t0
      if (now - last >= 100) {
        elapsed.set(now)
        last = now
      }
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [t0, active, elapsed])

  return elapsed
}
