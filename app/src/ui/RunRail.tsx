import { percent, seconds } from '../lib/format'
import { runReceipt } from '../run/phases'
import type { Segment } from '../run/types'

const COLOUR: Record<Segment['kind'], string> = {
  http: 'var(--neutral)',
  queue: 'var(--neutral)',
  measured: 'var(--accent-dim)',
  silent: 'var(--load)',
  stepped: 'var(--accent)',
  unattributed: 'var(--text-3)',
}

/**
 * The receipt. Segment widths are actual measured durations, so a cold run and a warm run
 * are visibly different shapes rather than the same bar at different speeds.
 */
export function RunRail({ segments, done }: { segments: Segment[]; done: boolean }) {
  // The furthest end, not the last element's: segments are sorted by start, and a node
  // that began early can still finish after later ones.
  const total = segments.reduce((max, segment) => Math.max(max, segment.tEnd), 0)
  if (total <= 0) return null
  const receipt = runReceipt(segments)

  return (
    <div className="rail-wrap">
      <div className="rail" role="img" aria-label={summary(receipt)}>
        {segments.map((segment, index) => (
          <div
            key={`${segment.kind}-${segment.tStart}-${index}`}
            className="rail-seg"
            style={{
              width: `${((segment.tEnd - segment.tStart) / total) * 100}%`,
              background: COLOUR[segment.kind],
            }}
            title={`${segment.label} · ${seconds(segment.tEnd - segment.tStart)}s · ${percent((segment.tEnd - segment.tStart) / total)}%`}
          />
        ))}
      </div>
      {done && <p className="rail-receipt">{summary(receipt)}</p>}
    </div>
  )
}

/**
 * All three shares are named. Quoting only disk and GPU would leave the rest of the run
 * silently unaccounted for, which is the same failure as a bar that does not reach 100%.
 */
function summary(receipt: ReturnType<typeof runReceipt>): string {
  if (receipt.totalMs <= 0) return ''
  const disk = Math.round((receipt.diskMs / receipt.totalMs) * 100)
  const gpu = Math.round((receipt.gpuMs / receipt.totalMs) * 100)
  // The remainder, so the three shares always add to exactly 100 -- rounding each
  // independently can land on 96% or 104%, and a receipt that does not add up is the
  // same failure as a bar that never reaches its end.
  const other = 100 - disk - gpu
  return `${seconds(receipt.totalMs)}s total — ${disk}% waiting on disk and VRAM, ${gpu}% sampling on the GPU, ${other}% everything else (queue, prompt encode, decode, save).`
}
