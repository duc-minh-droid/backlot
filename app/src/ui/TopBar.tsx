import { useEffect, useRef } from 'react'
import { useMotionValueEvent, type MotionValue } from 'motion/react'
import type { ConnState } from '../comfy/socket'
import { clock } from '../lib/format'
import type { RunState } from '../run/types'
import type { Theme } from '../theme/useTheme'
import { LegendPopover } from './LegendPopover'
import { useMotionPreference, type MotionPreference } from '../motion/useMotionPreference'
import { useComposeStore } from '../run/composeStore'

const MOTION_LABEL: Record<MotionPreference, string> = {
  auto: 'auto',
  reduce: 'reduced',
  full: 'full',
}

interface Props {
  connection: ConnState
  run: RunState | null
  elapsed: MotionValue<number>
  theme: Theme
  onToggleTheme: () => void
}

export function TopBar({ connection, run, elapsed, theme, onToggleTheme }: Props) {
  const clockRef = useRef<HTMLSpanElement>(null)
  const motion = useMotionPreference()
  const view = useComposeStore((state) => state.view)
  const setView = useComposeStore((state) => state.setView)

  const finished = run?.tEnd !== undefined

  // Written straight to the DOM: at 10 Hz through React this would cost a render every
  // 100ms for the whole run, competing with the preview decodes. Once the run has ended,
  // late frames are ignored so the clock cannot drift off the measured total.
  useMotionValueEvent(elapsed, 'change', (value) => {
    if (finished) return
    if (clockRef.current) clockRef.current.textContent = clock(value)
  })

  useEffect(() => {
    if (!clockRef.current) return
    if (!run) {
      clockRef.current.textContent = '0:00.0'
      return
    }
    // Once the run ends, pin the clock to the measured end so it agrees with the run
    // rail's total. Two different totals on one screen would undercut the whole point.
    if (run.tEnd !== undefined) clockRef.current.textContent = clock(run.tEnd)
  }, [run])

  const active = run?.status === 'running' || run?.status === 'queued' || run?.status === 'submitting'

  return (
    <header className="topbar">
      <div className={`conn conn-${connection.phase}`}>
        <span className="dot" aria-hidden="true" />
        <span>{connectionLabel(connection)}</span>
      </div>

      <div className="views" role="tablist" aria-label="views">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'generate'}
          className={`view-tab ${view === 'generate' ? 'view-tab-on' : ''}`}
          onClick={() => setView('generate')}
        >
          Generate
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'library'}
          className={`view-tab ${view === 'library' ? 'view-tab-on' : ''}`}
          onClick={() => setView('library')}
        >
          Library
        </button>
      </div>

      <div className="run-chip">
        <span className="label-xs">{runLabel(run)}</span>
        <span ref={clockRef} className="num clock">
          0:00.0
        </span>
      </div>

      <div className="topbar-right">
        <span className="label-xs">
          {active && run?.mode === 'edit' ? 'edit mode' : run?.mode === 't2i' ? 'text to image' : ''}
        </span>
        <button type="button" className="mini-button" onClick={onToggleTheme} aria-label="switch theme">
          {theme === 'dark' ? 'light' : 'dark'}
        </button>
        <button
          type="button"
          className="mini-button"
          onClick={motion.cycle}
          aria-label={`motion: ${MOTION_LABEL[motion.preference]}. Click to change.`}
          title="Motion may be removed; the numbers never are."
        >
          motion: {MOTION_LABEL[motion.preference]}
        </button>
        <LegendPopover />
      </div>
    </header>
  )
}

function connectionLabel(state: ConnState): string {
  switch (state.phase) {
    case 'open':
      return 'connected · 127.0.0.1:8188'
    case 'connecting':
      return 'connecting…'
    case 'degraded':
      return `connected but silent for ${Math.round(state.silentMs / 1000)}s`
    case 'reconnecting':
      return `reconnecting · attempt ${state.attempt}`
    default:
      return 'not connected'
  }
}

function runLabel(run: RunState | null): string {
  if (!run) return 'idle'
  switch (run.status) {
    case 'submitting':
      return 'submitting'
    case 'queued':
      return 'queued'
    case 'running':
      return 'running'
    case 'success':
      return 'done'
    case 'error':
      return 'failed'
    case 'interrupted':
      return 'stopped'
    default:
      return 'idle'
  }
}
