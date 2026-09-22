import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { MotionConfig, useReducedMotion } from 'motion/react'

export type MotionPreference = 'auto' | 'reduce' | 'full'

const KEY = 'qwen.motion.v1'

interface MotionPreferenceValue {
  preference: MotionPreference
  /** What the app should actually do, after folding in the OS setting. */
  reduced: boolean
  cycle: () => void
}

const Context = createContext<MotionPreferenceValue>({
  preference: 'auto',
  reduced: false,
  cycle: () => {},
})

/**
 * `useReducedMotion` only reads the OS media query, so components that branch on it cannot
 * be driven by MotionConfig alone. This wraps both: the OS preference is the default, and
 * an explicit choice overrides it. Every component reads `reduced` from here, so there is
 * one answer for the whole app.
 */
export function MotionPreferenceProvider({ children }: { children: React.ReactNode }) {
  const systemReduced = useReducedMotion() ?? false
  const [preference, setPreference] = useState<MotionPreference>(() => {
    try {
      const stored = localStorage.getItem(KEY)
      if (stored === 'auto' || stored === 'reduce' || stored === 'full') return stored
    } catch {
      /* blocked storage: the OS preference still applies */
    }
    return 'auto'
  })

  useEffect(() => {
    try {
      localStorage.setItem(KEY, preference)
    } catch {
      /* a remembered preference is a convenience, not required state */
    }
  }, [preference])

  const cycle = useCallback(() => {
    setPreference((value) => (value === 'auto' ? 'reduce' : value === 'reduce' ? 'full' : 'auto'))
  }, [])

  const reduced = preference === 'auto' ? systemReduced : preference === 'reduce'

  const value = useMemo<MotionPreferenceValue>(
    () => ({ preference, reduced, cycle }),
    [preference, reduced, cycle],
  )

  return (
    <Context.Provider value={value}>
      <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>{children}</MotionConfig>
    </Context.Provider>
  )
}

/** True when motion should be removed. Information never is. */
export function useReducedMotionPreference(): boolean {
  return useContext(Context).reduced
}

export function useMotionPreference(): MotionPreferenceValue {
  return useContext(Context)
}
