import type {
  ComfyImageRef,
  ComfyPrompt,
  NodeId,
  NodeOutput,
  WsExecutionError,
  WsExecutionInterrupted,
} from '../comfy/types'
import type { GenParams } from '../graph/buildGraph'

export type RunStatus =
  | 'idle'
  | 'submitting'
  | 'queued'
  | 'running'
  | 'success'
  | 'error'
  | 'interrupted'

export type NodeState = 'pending' | 'cached' | 'running' | 'finished' | 'error' | 'unreached'

export interface StepSample {
  step: number
  max: number
  tMs: number
}

export interface NodePhase {
  nodeId: NodeId
  classType: string
  state: NodeState
  /** ms since t0, from `executing`. */
  tStart?: number
  /** ms since t0, first `progress` -- this is what closes the silent window. */
  tFirstProgress?: number
  /** ms since t0, from the NEXT `executing`; ComfyUI has no "node finished" message. */
  tEnd?: number
  steps: StepSample[]
  outputs?: NodeOutput
  /**
   * True when this node's `executed` arrived for a cached node that never ran. Without
   * this flag a repeat with a pinned seed would present the previous run's image as newly
   * generated (execution.py:446).
   */
  outputReplayedFromCache: boolean
}

export interface PreviewFrame {
  objectUrl: string
  nodeId: NodeId
  step: number
  tMs: number
}

export interface RunState {
  promptId: string
  params: GenParams
  graph: ComfyPrompt
  mode: 't2i' | 'edit'
  status: RunStatus

  /** performance.now() at submit. Every tMs is relative to this. */
  t0: number
  /** Date.now() at the same instant, used only to correlate server log timestamps. */
  t0Wall: number
  tPostAck?: number
  tExecStart?: number
  tEnd?: number

  queueRemainingAtSubmit?: number
  reachableNodeIds: NodeId[]
  cachedNodeIds: NodeId[]
  nodes: Record<NodeId, NodePhase>
  /** Observed execution order. Never pre-seeded: edit mode reorders the graph. */
  order: NodeId[]
  activeNodeId: NodeId | null

  preview: PreviewFrame | null
  previewFramesReceived: number
  previewFramesDropped: number

  images: ComfyImageRef[]
  error?: WsExecutionError['data']
  interrupted?: WsExecutionInterrupted['data']

  tLastWsMessage: number
  cancelRequestedAt?: number
  reconciledFromHistory: boolean
}

/** A fully attributed slice of the run. Segments must tile [t0, tEnd] with no gaps. */
export type SegmentKind =
  | 'http'
  | 'queue'
  | 'measured'
  | 'silent'
  | 'stepped'
  | 'unattributed'

export interface Segment {
  kind: SegmentKind
  label: string
  tStart: number
  tEnd: number
  nodeId?: NodeId
  steps?: StepSample[]
  /** False means no numerator/denominator exists -- the UI must not draw a fill. */
  hasProgressSignal: boolean
}
