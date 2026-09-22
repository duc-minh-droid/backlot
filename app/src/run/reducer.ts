import type { ComfyMessage, NodeId } from '../comfy/types'
import type { BuiltGraph } from '../graph/buildGraph'
import type { GenParams } from '../graph/buildGraph'
import type { NodePhase, RunState } from './types'

export function createRun(promptId: string, params: GenParams, graph: BuiltGraph): RunState {
  const nodes: Record<NodeId, NodePhase> = {}
  for (const nodeId of graph.reachable) {
    nodes[nodeId] = {
      nodeId,
      classType: graph.classTypes[nodeId] ?? '?',
      state: 'pending',
      steps: [],
      outputReplayedFromCache: false,
    }
  }

  return {
    promptId,
    params,
    graph: graph.prompt,
    mode: graph.mode,
    status: 'submitting',
    t0: performance.now(),
    t0Wall: Date.now(),
    reachableNodeIds: graph.reachable,
    cachedNodeIds: [],
    nodes,
    order: [],
    activeNodeId: null,
    preview: null,
    previewFramesReceived: 0,
    previewFramesDropped: 0,
    images: [],
    tLastWsMessage: performance.now(),
    reconciledFromHistory: false,
  }
}

/** Closes the currently active node. ComfyUI never says "node finished". */
function closeActive(run: RunState, tMs: number): void {
  const active = run.activeNodeId
  if (!active) return
  const node = run.nodes[active]
  if (node && node.tEnd === undefined) {
    node.tEnd = tMs
    node.state = 'finished'
  }
  run.activeNodeId = null
}

function ensureNode(run: RunState, nodeId: NodeId): NodePhase {
  let node = run.nodes[nodeId]
  if (!node) {
    // An id we did not author (an ephemeral/subgraph node). Track it rather than drop it.
    node = {
      nodeId,
      classType: run.graph[nodeId]?.class_type ?? '?',
      state: 'pending',
      steps: [],
      outputReplayedFromCache: false,
    }
    run.nodes[nodeId] = node
  }
  return node
}

/**
 * Pure reducer over the websocket stream. Mutates a shallow clone so the store can hand
 * React a new reference without a deep copy on every one of the ~25 frames per run.
 */
export function reduceRun(previous: RunState, message: ComfyMessage): RunState {
  const run: RunState = { ...previous, nodes: { ...previous.nodes } }
  const tMs = message.tRecv - run.t0
  run.tLastWsMessage = message.tRecv

  if (message.channel === 'binary') {
    const binary = message.msg
    if (binary.kind !== 'preview') return run

    run.previewFramesReceived += 1
    const nodeId = binary.meta?.node_id ?? run.activeNodeId ?? ''
    const step = nodeId ? (run.nodes[nodeId]?.steps.at(-1)?.step ?? 0) : 0
    const blob = new Blob([binary.bytes as BlobPart], { type: binary.mime })

    // One live object URL at a time: 25 frames a run leaks fast otherwise.
    if (run.preview) URL.revokeObjectURL(run.preview.objectUrl)
    run.preview = { objectUrl: URL.createObjectURL(blob), nodeId, step, tMs }
    return run
  }

  const json = message.msg

  switch (json.type) {
    case 'status': {
      if (run.status === 'submitting' && run.queueRemainingAtSubmit === undefined) {
        run.queueRemainingAtSubmit = json.data.status.exec_info.queue_remaining
      }
      return run
    }

    case 'execution_start': {
      if (json.data.prompt_id !== run.promptId) return run
      run.tExecStart = tMs
      run.status = 'running'
      return run
    }

    case 'execution_cached': {
      if (json.data.prompt_id !== run.promptId) return run
      run.cachedNodeIds = json.data.nodes
      for (const nodeId of json.data.nodes) {
        const node = { ...ensureNode(run, nodeId), state: 'cached' as const }
        run.nodes[nodeId] = node
      }
      return run
    }

    case 'executing': {
      if (json.data.prompt_id && json.data.prompt_id !== run.promptId) return run

      closeActive(run, tMs)

      if (json.data.node === null) {
        // Terminal marker. The status stays `running` until success/error/interrupt says
        // which it was.
        run.tEnd = tMs
        return run
      }

      const node = { ...ensureNode(run, json.data.node), state: 'running' as const, tStart: tMs }
      run.nodes[json.data.node] = node
      run.order = [...run.order, json.data.node]
      run.activeNodeId = json.data.node
      return run
    }

    case 'progress': {
      if (json.data.prompt_id !== run.promptId || json.data.node === null) return run
      const existing = ensureNode(run, json.data.node)
      const node: NodePhase = {
        ...existing,
        steps: [...existing.steps, { step: json.data.value, max: json.data.max, tMs }],
      }
      // The first progress message is what ends the silent VRAM-load window inside the
      // sampler. Everything before it is time we can measure but not subdivide.
      if (node.tFirstProgress === undefined) node.tFirstProgress = tMs
      run.nodes[json.data.node] = node
      return run
    }

    case 'progress_state': {
      if (json.data.prompt_id !== run.promptId) return run
      // Authoritative reconciliation, not the primary driver: it does not fire during the
      // silent window, and pending entries are filtered out server-side.
      for (const [nodeId, entry] of Object.entries(json.data.nodes)) {
        const existing = run.nodes[nodeId]
        if (!existing || existing.state === 'cached') continue
        if (entry.state === 'finished' && existing.state === 'running' && nodeId !== run.activeNodeId) {
          run.nodes[nodeId] = { ...existing, state: 'finished', tEnd: existing.tEnd ?? tMs }
        }
      }
      return run
    }

    case 'executed': {
      if (json.data.prompt_id !== run.promptId) return run
      const existing = ensureNode(run, json.data.node)
      const replayed = run.cachedNodeIds.includes(json.data.node) && !run.order.includes(json.data.node)
      run.nodes[json.data.node] = {
        ...existing,
        outputs: json.data.output,
        outputReplayedFromCache: replayed,
      }
      const images = json.data.output?.images
      if (images?.length) run.images = [...run.images, ...images]
      return run
    }

    case 'execution_success': {
      if (json.data.prompt_id !== run.promptId) return run
      closeActive(run, tMs)
      run.tEnd = run.tEnd ?? tMs
      run.status = 'success'
      return run
    }

    case 'execution_error': {
      if (json.data.prompt_id !== run.promptId) return run
      const failed = run.nodes[json.data.node_id]
      if (failed) {
        run.nodes[json.data.node_id] = { ...failed, state: 'error', tEnd: tMs }
      }
      // Downstream nodes are `unreached`, never `error` -- blaming SaveImage for the
      // sampler's OOM would be a lie.
      for (const [nodeId, node] of Object.entries(run.nodes)) {
        if (node.state === 'pending' && nodeId !== json.data.node_id) {
          run.nodes[nodeId] = { ...node, state: 'unreached' }
        }
      }
      run.activeNodeId = null
      run.error = json.data
      run.tEnd = tMs
      run.status = 'error'
      return run
    }

    case 'execution_interrupted': {
      if (json.data.prompt_id !== run.promptId) return run
      const stopped = run.activeNodeId ? run.nodes[run.activeNodeId] : undefined
      if (stopped && run.activeNodeId) {
        // Freeze the partial progress where it stopped; do not reset it to zero.
        run.nodes[run.activeNodeId] = { ...stopped, state: 'finished', tEnd: tMs }
      }
      for (const [nodeId, node] of Object.entries(run.nodes)) {
        if (node.state === 'pending') run.nodes[nodeId] = { ...node, state: 'unreached' }
      }
      run.activeNodeId = null
      run.interrupted = json.data
      run.tEnd = tMs
      run.status = 'interrupted'
      return run
    }

    default:
      return run
  }
}
