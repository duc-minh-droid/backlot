import { labelForNode } from '../graph/nodeIds'
import type { RunState, Segment } from './types'

const UNATTRIBUTED_FLOOR_MS = 20

/**
 * Decomposes a run into segments that tile [0, now] with no gaps.
 *
 * The long silence in a cold run is not one gap but two structurally different ones, and
 * both are precisely bounded by messages we already receive:
 *
 *   - loader nodes reading from disk: executing(n) -> executing(n+1)
 *   - weights moving into VRAM INSIDE the sampler: executing(sampler) -> progress(1)
 *
 * The second is the one a naive client gets wrong. Under --lowvram the GGUF loader returns
 * a CPU-resident model, so the GPU transfer happens inside KSampler -- after `executing`
 * and before the first `progress`. Labelling that window "sampling 0/25" would be exactly
 * the kind of lie this app exists to avoid, so it is emitted as its own silent segment.
 *
 * Anything left over becomes an explicit `unattributed` segment rather than being quietly
 * absorbed. That also makes this function a reducer-bug detector.
 */
export function deriveSegments(run: RunState, nowMs: number): Segment[] {
  const segments: Segment[] = []
  const end = run.tEnd ?? nowMs

  if (run.tPostAck !== undefined) {
    segments.push({
      kind: 'http',
      label: 'Submitting',
      tStart: 0,
      tEnd: run.tPostAck,
      hasProgressSignal: false,
    })
  }

  if (run.tExecStart !== undefined) {
    // On a warm server execution_start can land before the POST's own response, so the
    // queue window can invert. Clamp it rather than emit a negative duration.
    const queueStart = Math.min(run.tPostAck ?? 0, run.tExecStart)
    segments.push({
      kind: 'queue',
      label:
        run.queueRemainingAtSubmit && run.queueRemainingAtSubmit > 1
          ? `Waiting in the server queue (position ${run.queueRemainingAtSubmit})`
          : 'Waiting for the server to start',
      tStart: queueStart,
      tEnd: run.tExecStart,
      hasProgressSignal: false,
    })
  }

  run.order.forEach((nodeId, index) => {
    const node = run.nodes[nodeId]
    if (!node || node.tStart === undefined) return

    const nextId = run.order[index + 1]
    const next = nextId ? run.nodes[nextId] : undefined
    const nodeEnd = node.tEnd ?? next?.tStart ?? end
    const label = labelForNode(nodeId, node.classType)

    // The sampler splits: a silent VRAM-load prefix, then the stepped part.
    if (node.steps.length > 0 && node.tFirstProgress !== undefined) {
      if (node.tFirstProgress > node.tStart) {
        segments.push({
          kind: 'silent',
          label: 'Moving weights into VRAM',
          tStart: node.tStart,
          tEnd: node.tFirstProgress,
          nodeId,
          hasProgressSignal: false,
        })
      }
      segments.push({
        kind: 'stepped',
        label: label.title,
        tStart: node.tFirstProgress,
        tEnd: nodeEnd,
        nodeId,
        steps: node.steps,
        hasProgressSignal: true,
      })
      return
    }

    segments.push({
      kind: label.expectSubProgress ? 'silent' : 'measured',
      label: label.title,
      tStart: node.tStart,
      tEnd: nodeEnd,
      nodeId,
      hasProgressSignal: false,
    })
  })

  return fillGaps(segments, end)
}

function fillGaps(segments: Segment[], end: number): Segment[] {
  const sorted = [...segments].sort((a, b) => a.tStart - b.tStart)
  const tiled: Segment[] = []
  let cursor = 0

  for (const segment of sorted) {
    if (segment.tStart - cursor > UNATTRIBUTED_FLOOR_MS) {
      tiled.push({
        kind: 'unattributed',
        label: 'Unaccounted for',
        tStart: cursor,
        tEnd: segment.tStart,
        hasProgressSignal: false,
      })
    }
    tiled.push(segment)
    cursor = Math.max(cursor, segment.tEnd)
  }

  if (end - cursor > UNATTRIBUTED_FLOOR_MS) {
    tiled.push({
      kind: 'unattributed',
      label: 'Unaccounted for',
      tStart: cursor,
      tEnd: end,
      hasProgressSignal: false,
    })
  }

  return tiled
}

export interface StepRate {
  /** Median seconds per step, measured in THIS run only. */
  secondsPerStep: number
  stepsDone: number
  stepsTotal: number
  /** Undefined until 3 steps have elapsed -- one sample is not a rate. */
  etaSeconds?: number
}

export function stepRate(steps: { step: number; max: number; tMs: number }[]): StepRate | undefined {
  const last = steps.at(-1)
  if (!last) return undefined

  const deltas: number[] = []
  for (let i = 1; i < steps.length; i += 1) {
    deltas.push(steps[i]!.tMs - steps[i - 1]!.tMs)
  }
  if (deltas.length === 0) {
    return { secondsPerStep: 0, stepsDone: last.step, stepsTotal: last.max }
  }

  const sorted = [...deltas].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]! / 1000
  const remaining = last.max - last.step

  return {
    secondsPerStep: median,
    stepsDone: last.step,
    stepsTotal: last.max,
    // Step time moves with resolution and VRAM pressure, so this is always presented as
    // "at this rate" and withheld until there are enough samples to mean anything.
    etaSeconds: deltas.length >= 2 ? remaining * median : undefined,
  }
}

export interface RunReceipt {
  totalMs: number
  diskMs: number
  gpuMs: number
  otherMs: number
}

export function runReceipt(segments: Segment[]): RunReceipt {
  let disk = 0
  let gpu = 0
  let other = 0

  for (const segment of segments) {
    const duration = segment.tEnd - segment.tStart
    if (segment.kind === 'silent') disk += duration
    else if (segment.kind === 'stepped') gpu += duration
    else other += duration
  }

  return { totalMs: disk + gpu + other, diskMs: disk, gpuMs: gpu, otherMs: other }
}
