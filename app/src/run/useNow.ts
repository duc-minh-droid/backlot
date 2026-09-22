import { useEffect, useState } from 'react'

/**
 * A coarse clock for anything that displays a live duration.
 *
 * Deliberately scoped to the components that need it. When this lived in App it
 * re-rendered the whole tree -- including the prompt textarea -- four times a second for
 * the length of a run. Everything higher-frequency than this is a MotionValue.
 */
export function useNow(active: boolean, intervalMs = 250): number {
  const [now, setNow] = useState(() => performance.now())

  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setNow(performance.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [active, intervalMs])

  return now
}
