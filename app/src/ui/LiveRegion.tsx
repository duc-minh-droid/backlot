import { useEffect, useRef, useState } from 'react'
import { seconds } from '../lib/format'
import type { StageView } from '../run/stageView'
import type { RunState } from '../run/types'

const QUARTERS = [0.25, 0.5, 0.75, 1]

/**
 * Two live regions.
 *
 * Sampling announces at 25/50/75/100% only -- announcing all 25 steps would make the app
 * unusable with a screen reader. A stage with no step signal says so explicitly, because
 * silence from the app is indistinguishable from the app being broken.
 */
export function LiveRegion({ run, stages }: { run: RunState | null; stages: StageView[] }) {
  const [polite, setPolite] = useState('')
  const [assertive, setAssertive] = useState('')
  const lastStage = useRef<string | null>(null)
  const lastQuarter = useRef(-1)

  const active = stages.find((stage) => stage.state === 'loading' || stage.state === 'sampling')
  const activeKey = active?.key ?? null
  const step = active?.step

  useEffect(() => {
    if (!run) {
      lastStage.current = null
      lastQuarter.current = -1
      setPolite('')
      return
    }
    if (!active || activeKey === lastStage.current) return

    lastStage.current = activeKey
    lastQuarter.current = -1

    const index = stages.findIndex((stage) => stage.key === activeKey) + 1
    const detail =
      active.state === 'loading'
        ? 'No progress information is available for this stage.'
        : `${active.step?.max ?? 0} steps.`
    setPolite(`Stage ${index} of ${stages.length}. ${active.label.toLowerCase()}. ${detail}`)
  }, [run, active, activeKey, stages])

  useEffect(() => {
    if (!step || step.max === 0) return
    const fraction = step.value / step.max
    const quarter = QUARTERS.findIndex((mark) => fraction >= mark && fraction < mark + 0.25)
    const reached = fraction >= 1 ? 3 : quarter
    if (reached < 0 || reached <= lastQuarter.current) return
    lastQuarter.current = reached
    setPolite(`Sampling, ${Math.round(QUARTERS[reached]! * 100)} percent, step ${step.value} of ${step.max}.`)
  }, [step])

  useEffect(() => {
    if (run?.status === 'error' && run.error) {
      setAssertive(`Generation failed. ${run.error.exception_type}.`)
    } else if (run?.status === 'interrupted') {
      setAssertive(`Generation stopped after ${seconds(run.tEnd ?? 0)} seconds.`)
    } else if (run?.status === 'success') {
      setPolite(`Done in ${seconds(run.tEnd ?? 0)} seconds.`)
    }
  }, [run?.status, run?.error, run?.tEnd])

  return (
    <>
      <p className="visually-hidden" aria-live="polite" aria-atomic="true">
        {polite}
      </p>
      <p className="visually-hidden" aria-live="assertive" aria-atomic="true">
        {assertive}
      </p>
    </>
  )
}
