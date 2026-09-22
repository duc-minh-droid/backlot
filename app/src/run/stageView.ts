import { STAGES } from '../graph/nodeIds'
import type { NodeId } from '../comfy/types'
import type { NodePhase, RunState } from './types'

export type StageState =
  | 'pending'
  | 'loading' // running, and no step signal exists for this stage
  | 'sampling' // running, with a real numerator and denominator
  | 'finished'
  | 'cached'
  | 'errored'
  | 'unreached'
  | 'cancelled'

export interface StageView {
  key: string
  label: string
  caption: string
  state: StageState
  nodes: { nodeId: NodeId; classType: string; durationMs?: number }[]
  /** ms, live while running and final once finished. */
  elapsedMs?: number
  step?: { value: number; max: number }
  /** Bytes this stage reads from disk, where that is a known quantity. */
  bytes?: number
}

const STAGE_BYTES: Record<string, number> = {
  'load-unet': 4.2e9,
  'load-clip': 6.3e9,
  decode: 0.7e9,
}

function nodesFor(run: RunState, nodeIds: NodeId[]): NodePhase[] {
  return nodeIds.map((id) => run.nodes[id]).filter((node): node is NodePhase => node !== undefined)
}

export function stageViews(run: RunState | null, nowMs: number): StageView[] {
  return STAGES.map((stage) => {
    const base: StageView = {
      key: stage.key,
      label: stage.label,
      caption: stage.caption,
      state: 'pending',
      nodes: [],
      bytes: STAGE_BYTES[stage.key],
    }
    if (!run) return base

    // Reference image loaders fold into the encode stage.
    const extra =
      stage.key === 'encode'
        ? Object.keys(run.nodes).filter((id) => Number(id) >= 101)
        : []
    const phases = nodesFor(run, [...stage.nodes, ...extra])
    if (phases.length === 0) return base

    base.nodes = phases.map((phase) => ({
      nodeId: phase.nodeId,
      classType: phase.classType,
      durationMs:
        phase.tStart !== undefined && phase.tEnd !== undefined
          ? phase.tEnd - phase.tStart
          : undefined,
    }))

    const started = phases.filter((phase) => phase.tStart !== undefined)
    const running = phases.find((phase) => phase.state === 'running')
    const errored = phases.find((phase) => phase.state === 'error')

    if (started.length > 0) {
      // The SUM of each member's own duration, never the span from the first member's
      // start to the last one's end. A stage's nodes can execute far apart -- VAELoader
      // runs near the beginning while VAEDecode runs at the very end -- and the span
      // between them would sweep up the entire sampler's time and report it as decoding.
      // A cached member contributes nothing, because it did no work.
      base.elapsedMs = started.reduce((total, phase) => {
        const end = phase.tEnd ?? (phase.state === 'running' ? nowMs : phase.tStart!)
        return total + (end - phase.tStart!)
      }, 0)
    }

    if (errored) {
      base.state = 'errored'
      return base
    }

    if (running) {
      const latest = running.steps.at(-1)
      // The sampler is amber until the first progress message arrives: the window between
      // `executing` and step 1 is weights moving into VRAM, and calling that "sampling
      // 0/25" would invent a fraction that does not exist yet.
      if (latest) {
        base.state = 'sampling'
        base.step = { value: latest.step, max: latest.max }
      } else {
        base.state = 'loading'
      }
      return base
    }

    if (phases.every((phase) => phase.state === 'cached')) {
      base.state = 'cached'
      return base
    }
    if (phases.some((phase) => phase.state === 'unreached')) {
      base.state = run.status === 'interrupted' ? 'cancelled' : 'unreached'
      return base
    }
    if (started.length > 0) {
      base.state = run.status === 'interrupted' ? 'cancelled' : 'finished'
      const latest = phases.flatMap((phase) => phase.steps).at(-1)
      if (latest) base.step = { value: latest.step, max: latest.max }
      return base
    }

    return base
  })
}
