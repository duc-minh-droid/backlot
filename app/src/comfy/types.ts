// The ComfyUI wire contract. Every field here was read out of the installed server
// (ComfyUI 0.37.0 at C:\AI\ComfyUI), not inferred from docs.

export type NodeId = string

/* ---------- prompt / graph ---------- */

export type NodeInputValue = string | number | boolean | null | [NodeId, number]

export interface PromptNode {
  class_type: string
  inputs: Record<string, NodeInputValue>
}

export type ComfyPrompt = Record<NodeId, PromptNode>

export interface ComfyImageRef {
  filename: string
  subfolder: string
  type: 'output' | 'input' | 'temp'
}

export interface NodeOutput {
  images?: ComfyImageRef[]
  [key: string]: unknown
}

/* ---------- JSON websocket frames ---------- */

export interface WsStatus {
  type: 'status'
  // queue_remaining is broadcast to every socket, so it counts other clients' jobs too.
  data: { status: { exec_info: { queue_remaining: number } }; sid?: string }
}

export interface WsFeatureFlags {
  type: 'feature_flags'
  data: Record<string, unknown>
}

export interface WsExecutionStart {
  type: 'execution_start'
  data: { prompt_id: string; timestamp: number }
}

export interface WsExecutionCached {
  type: 'execution_cached'
  data: { nodes: NodeId[]; prompt_id: string; timestamp: number }
}

export interface WsExecuting {
  type: 'executing'
  // node === null is the terminal "this prompt is done" marker (main.py:374).
  // The reconnect replay variant (server.py:290) carries `node` alone.
  data: { node: NodeId | null; display_node?: NodeId; prompt_id?: string }
}

export interface WsProgress {
  type: 'progress'
  data: { value: number; max: number; prompt_id: string; node: NodeId | null }
}

export type NodeProgressState = 'pending' | 'running' | 'finished' | 'error'

export interface WsProgressStateNode {
  value: number
  max: number
  state: NodeProgressState
  node_id: NodeId
  prompt_id: string
  display_node_id: NodeId
  parent_node_id: NodeId | null
  real_node_id: NodeId
}

export interface WsProgressState {
  type: 'progress_state'
  // Nodes in the "pending" state are filtered out server-side (progress.py:179), so an
  // absent entry means "has not started", never "finished".
  data: { prompt_id: string; nodes: Record<NodeId, WsProgressStateNode> }
}

export interface WsExecuted {
  type: 'executed'
  // Cached nodes emit this WITHOUT ever emitting `executing` (execution.py:446), carrying
  // the previous run's images. See outputReplayedFromCache in run/types.ts.
  data: { node: NodeId; display_node: NodeId; output: NodeOutput; prompt_id: string }
}

export interface WsExecutionSuccess {
  type: 'execution_success'
  data: { prompt_id: string; timestamp: number }
}

export interface WsExecutionError {
  type: 'execution_error'
  data: {
    prompt_id: string
    node_id: NodeId
    node_type: string
    exception_message: string
    exception_type: string
    traceback: string[]
    executed?: NodeId[]
    current_inputs?: Record<string, unknown>
    current_outputs?: unknown[]
    timestamp?: number
  }
}

export interface WsExecutionInterrupted {
  type: 'execution_interrupted'
  data: {
    prompt_id: string
    node_id: NodeId
    node_type: string
    executed: NodeId[]
    timestamp?: number
  }
}

export interface WsLogEntry {
  t: string
  m: string
}

export interface WsLogs {
  type: 'logs'
  data: { entries: WsLogEntry[]; size: { cols: number; rows: number } }
}

export type ComfyJsonMessage =
  | WsStatus
  | WsFeatureFlags
  | WsExecutionStart
  | WsExecutionCached
  | WsExecuting
  | WsProgress
  | WsProgressState
  | WsExecuted
  | WsExecutionSuccess
  | WsExecutionError
  | WsExecutionInterrupted
  | WsLogs

/* ---------- binary websocket frames ---------- */

// Every binary frame is a 4-byte big-endian event id followed by a payload (server.py:1304).
export const BINARY_EVENT = {
  PREVIEW_IMAGE: 1,
  UNENCODED_PREVIEW_IMAGE: 2, // internal marker, re-emitted as 1; never seen on the wire
  TEXT: 3,
  PREVIEW_IMAGE_WITH_METADATA: 4,
} as const

export interface PreviewMeta {
  node_id: NodeId
  prompt_id: string
  display_node_id: NodeId
  parent_node_id: NodeId | null
  real_node_id: NodeId
  // A MIME string ("image/jpeg"), not the 1/2 enum used by the legacy event-1 frame.
  image_type: string
}

export type ComfyBinaryMessage =
  | { kind: 'preview'; meta: PreviewMeta | null; mime: string; bytes: Uint8Array }
  | { kind: 'progress_text'; nodeId: NodeId; text: string }
  | { kind: 'unknown'; eventId: number; bytes: Uint8Array }

/* ---------- what the app actually consumes ---------- */

export type ComfyMessage =
  | { channel: 'json'; msg: ComfyJsonMessage; tRecv: number }
  | { channel: 'binary'; msg: ComfyBinaryMessage; tRecv: number }

/* ---------- REST ---------- */

export type PreviewMethod = 'latent2rgb' | 'taesd' | 'auto' | 'none'

export interface SubmitResponse {
  prompt_id: string
  number: number
  node_errors: Record<string, unknown>
}

export interface SubmitErrorBody {
  error: { type: string; message: string; details: string; extra_info?: unknown }
  node_errors: Record<string, unknown>
}

export interface UploadResponse {
  name: string
  subfolder: string
  type: string
}

export interface SystemStatsDevice {
  name: string
  type: string
  index: number
  vram_total: number
  vram_free: number
  torch_vram_total: number
  torch_vram_free: number
}

export interface SystemStats {
  system: {
    os: string
    ram_total: number
    ram_free: number
    comfyui_version: string
    python_version: string
    pytorch_version: string
    argv?: string[]
  }
  devices: SystemStatsDevice[]
}

export interface HistoryEntry {
  prompt: unknown[]
  outputs: Record<NodeId, NodeOutput>
  status: {
    status_str: 'success' | 'error'
    completed: boolean
    messages: [string, Record<string, unknown>][]
  }
  meta?: Record<NodeId, unknown>
}
