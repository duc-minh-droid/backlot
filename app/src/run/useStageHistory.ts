import { useCallback, useEffect, useState } from 'react'
import type { StageView } from './stageView'

const KEY = 'qwen.stageHistory.v2'

/**
 * Timings are bucketed by how many reference images the run had. A run with references
 * spends far longer in ENCODE and SAMPLE, so without this five subject runs would replace
 * the plain-generation medians and a later t2i run would show a wildly inflated "~".
 */
export function bucket(referenceCount: number): string {
  if (referenceCount === 0) return 'r0'
  if (referenceCount <= 2) return 'r1-2'
  if (referenceCount <= 5) return 'r3-5'
  return 'r6+'
}
const KEEP = 5

type Store = Record<string, number[]>

function read(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Store
  } catch {
    return {}
  }
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

/**
 * Stage timings from this machine's last few runs. Used for the tilde figures on pending
 * chips -- which are labelled as history, never presented as a forecast.
 */
export function useStageHistory() {
  const [history, setHistory] = useState<Record<string, number>>({})

  const load = useCallback(() => {
    const store = read()
    const medians: Record<string, number> = {}
    for (const [key, values] of Object.entries(store)) {
      if (values.length > 0) medians[key] = median(values)
    }
    setHistory(medians)
  }, [])

  useEffect(load, [load])

  const record = useCallback(
    (stages: StageView[], referenceCount = 0) => {
      const store = read()
      const suffix = bucket(referenceCount)
      for (const stage of stages) {
        // Only real, completed timings. A cached stage took no time and would poison the
        // median for the next cold run.
        if (stage.state !== 'finished' || stage.elapsedMs === undefined) continue
        const key = `${stage.key}:${suffix}`
        store[key] = [...(store[key] ?? []), stage.elapsedMs].slice(-KEEP)
      }
      try {
        localStorage.setItem(KEY, JSON.stringify(store))
      } catch {
        /* private mode or blocked storage: the app works without history */
      }
      load()
    },
    [load],
  )

  return { history, record }
}

/** Medians for the bucket this run belongs to, keyed by plain stage key. */
export function historyFor(
  history: Record<string, number>,
  referenceCount: number,
): Record<string, number> {
  const suffix = `:${bucket(referenceCount)}`
  const out: Record<string, number> = {}
  for (const [key, value] of Object.entries(history)) {
    if (key.endsWith(suffix)) out[key.slice(0, -suffix.length)] = value
  }
  return out
}
