import { useCallback, useEffect, useState } from 'react'

export type Theme = 'dark' | 'light'

const KEY = 'qwen.theme.v1'

function initial(): Theme {
  try {
    const stored = localStorage.getItem(KEY)
    if (stored === 'dark' || stored === 'light') return stored
  } catch {
    /* blocked storage: fall through to the system preference */
  }
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(initial)

  useEffect(() => {
    document.documentElement.dataset['theme'] = theme
    try {
      localStorage.setItem(KEY, theme)
    } catch {
      /* a remembered theme is a convenience, not state the app depends on */
    }
  }, [theme])

  const toggle = useCallback(() => setTheme((value) => (value === 'dark' ? 'light' : 'dark')), [])

  return [theme, toggle]
}
