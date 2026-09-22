import { useRef, useState } from 'react'
import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { useReducedMotionPreference } from '../motion/useMotionPreference'
import { scannerVariants, stageChipVariants } from '../motion/variants'
import { gigabytes, seconds } from '../lib/format'
import type { StageState, StageView } from '../run/stageView'
import type { StepRate } from '../run/phases'

const GLYPH: Record<StageState, string> = {
  pending: '◻',
  loading: '⟳',
  sampling: '▸',
  finished: '✓',
  cached: '⤴',
  errored: '✕',
  unreached: '◻',
  cancelled: '⊘',
}

const WORD: Record<StageState, string> = {
  pending: 'waiting',
  loading: 'loading',
  sampling: 'sampling',
  finished: 'done',
  cached: 'cached',
  errored: 'failed',
  unreached: 'not reached',
  cancelled: 'stopped',
}

interface Props {
  stages: StageView[]
  rate?: StepRate
  history: Record<string, number>
}

export function PipelineTimeline({ stages, rate, history }: Props) {
  // Roving tabindex: the timeline is one tab stop, and the arrow keys move within it.
  const [focused, setFocused] = useState(0)
  const list = useRef<HTMLOListElement>(null)

  const move = (delta: number) => {
    const next = Math.min(stages.length - 1, Math.max(0, focused + delta))
    setFocused(next)
    const chips = list.current?.querySelectorAll<HTMLElement>('.chip')
    chips?.[next]?.focus()
  }

  return (
    <LayoutGroup id="timeline">
      <ol
        className="timeline"
        role="list"
        ref={list}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') { event.preventDefault(); move(1) }
          if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1) }
          if (event.key === 'Home') { event.preventDefault(); move(-stages.length) }
          if (event.key === 'End') { event.preventDefault(); move(stages.length) }
        }}
      >
        {stages.map((stage, index) => (
          <StageChip
            key={stage.key}
            stage={stage}
            index={index}
            rate={stage.state === 'sampling' ? rate : undefined}
            historyMs={history[stage.key]}
            tabbable={index === focused}
            onFocus={() => setFocused(index)}
          />
        ))}
      </ol>
      <p className="timeline-legend">
        every number here is wall-clock time measured on this machine
        <span className="unit"> · ~ means it came from a previous run</span>
      </p>
    </LayoutGroup>
  )
}

function StageChip({
  stage,
  index,
  rate,
  historyMs,
  tabbable,
  onFocus,
}: {
  stage: StageView
  index: number
  rate?: StepRate
  historyMs?: number
  tabbable: boolean
  onFocus: () => void
}) {
  const reduced = useReducedMotionPreference()
  const [expanded, setExpanded] = useState(false)
  // Two nodes summed into one number always offers the split.
  const foldable = stage.nodes.length > 1

  return (
    <motion.li
      layout
      className={`chip chip-${stage.state} ${foldable ? 'chip-foldable' : ''}`}
      variants={stageChipVariants}
      animate={stage.state}
      initial={false}
      transition={reduced ? { duration: 0 } : undefined}
      aria-label={ariaLabel(stage, index)}
      tabIndex={tabbable ? 0 : -1}
      onFocus={onFocus}
      onClick={() => foldable && setExpanded((value) => !value)}
      onKeyDown={(event) => {
        if (foldable && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          setExpanded((value) => !value)
        }
      }}
      aria-expanded={foldable ? expanded : undefined}
    >
      <div className="chip-head label-xs">
        <span aria-hidden="true">{GLYPH[stage.state]}</span>
        <span>
          {index + 1} · {stage.label}
        </span>
      </div>

      <Meter stage={stage} reduced={reduced} />

      <div className="chip-number num">{primaryNumber(stage, historyMs)}</div>
      <div className="chip-caption">{caption(stage, rate, historyMs)}</div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.dl
            className="chip-detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={reduced ? { duration: 0 } : undefined}
          >
            {stage.nodes.map((node) => (
              <div key={node.nodeId}>
                <dt>
                  {node.classType} <span className="unit">#{node.nodeId}</span>
                </dt>
                <dd className="num">
                  {node.durationMs === undefined
                    ? '—'
                    : node.durationMs < 1
                      ? '<1ms'
                      : `${seconds(node.durationMs)}s`}
                </dd>
              </div>
            ))}
          </motion.dl>
        )}
      </AnimatePresence>
    </motion.li>
  )
}

function Meter({ stage, reduced }: { stage: StageView; reduced: boolean }) {
  if (stage.state === 'sampling' && stage.step) {
    const fraction = stage.step.value / stage.step.max
    return (
      <div
        className="meter meter-step"
        role="progressbar"
        aria-valuenow={stage.step.value}
        aria-valuemin={0}
        aria-valuemax={stage.step.max}
      >
        <div className="meter-fill" style={{ transform: `scaleX(${fraction})` }} />
        <div className="meter-ticks" style={{ '--ticks': stage.step.max } as React.CSSProperties} />
      </div>
    )
  }

  if (stage.state === 'loading') {
    // Indeterminate, so role="status" rather than progressbar: telling assistive tech
    // there is a value here would be exactly the lie the design exists to avoid.
    return (
      <div
        className="meter meter-scan"
        role="status"
        aria-label={`${stage.label}. No progress information is available for this stage.`}
      >
        <motion.div
          className="scanner"
          variants={scannerVariants}
          animate={reduced ? 'still' : 'active'}
          initial="idle"
        />
      </div>
    )
  }

  const done = stage.state === 'finished' || stage.state === 'cancelled'
  return <div className={`meter ${done ? 'meter-done' : 'meter-idle'}`} />
}

function primaryNumber(stage: StageView, historyMs?: number): React.ReactNode {
  switch (stage.state) {
    case 'cached':
      return <span className="chip-word">cached</span>
    case 'sampling':
      return stage.step ? `${stage.step.value}/${stage.step.max}` : '—'
    case 'loading':
      return (
        <>
          {seconds(stage.elapsedMs ?? 0)}
          <span className="unit">s</span>
        </>
      )
    case 'finished':
    case 'cancelled':
    case 'errored':
      return (
        <>
          {seconds(stage.elapsedMs ?? 0)}
          <span className="unit">s</span>
        </>
      )
    default:
      // A pending chip shows history, never a forecast, and says so with the tilde.
      return historyMs ? (
        <span className="chip-history">~{seconds(historyMs)}s</span>
      ) : (
        <span className="chip-history">—</span>
      )
  }
}

function caption(stage: StageView, rate?: StepRate, historyMs?: number): string {
  switch (stage.state) {
    case 'pending':
      return historyMs ? `waiting · last run ${seconds(historyMs)}s` : 'waiting · never timed'
    case 'unreached':
      return 'not reached'
    case 'loading':
      return stage.bytes
        ? `reading ${gigabytes(stage.bytes)} GB from disk · no step signal exists here`
        : 'no step signal exists here'
    case 'sampling':
      if (!rate) return stage.caption
      if (rate.etaSeconds === undefined) {
        return `${rate.stepsDone} steps in · timing not yet reliable`
      }
      return `${rate.secondsPerStep.toFixed(2)} s/step measured · ~${rate.etaSeconds.toFixed(0)} s left at this rate`
    case 'cached':
      return stage.bytes
        ? `already in VRAM · ${gigabytes(stage.bytes)} GB not reloaded`
        : 'already in VRAM · not recomputed'
    case 'finished':
      // No derived MB/s here. ComfyUI's loader nodes return before the weights are
      // actually read -- the real transfer happens lazily inside the sampler, which is
      // why the sampler has a silent prefix. Dividing the file size by the node's
      // duration would invent a throughput of tens of GB/s and present it as measured.
      if (stage.bytes && stage.elapsedMs !== undefined) {
        return `done in ${seconds(stage.elapsedMs)}s · ${gigabytes(stage.bytes)} GB file, read lazily`
      }
      if (stage.step) {
        return `${stage.step.max} steps in ${seconds(stage.elapsedMs ?? 0)}s`
      }
      return stage.caption
    case 'cancelled':
      return stage.step ? `stopped by you at step ${stage.step.value}/${stage.step.max}` : 'stopped by you'
    case 'errored':
      return 'failed here'
  }
}

function ariaLabel(stage: StageView, index: number): string {
  const parts = [`Stage ${index + 1}`, stage.label.toLowerCase(), WORD[stage.state]]
  if (stage.elapsedMs !== undefined) parts.push(`${seconds(stage.elapsedMs)} seconds`)
  if (stage.state === 'loading') parts.push('no progress information is available')
  return parts.join(', ')
}
