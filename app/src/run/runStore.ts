import { create } from 'zustand'
import { comfySocket } from '../comfy/client'
import { cancelPrompt, getHistory, submitPrompt, ComfyRequestError } from '../comfy/rest'
import { buildGraph, type GenParams } from '../graph/buildGraph'
import { createRun, reduceRun } from './reducer'
import type { RunState } from './types'

const GAP_MS = 10_000
const RECONCILE_EVERY_MS = 2000

interface RunStore {
  run: RunState | null
  submitError: string | null
  generate: (params: GenParams) => Promise<string | null>
  cancel: () => Promise<void>
  clearError: () => void
}

export const useRunStore = create<RunStore>((set, get) => ({
  run: null,
  submitError: null,

  generate: async (params) => {
    const graph = buildGraph(params)
    // We mint the id so the run exists in the store before the POST resolves --
    // execution_start can then never arrive for a prompt we have not heard of.
    const promptId = crypto.randomUUID()
    set({ run: createRun(promptId, params, graph), submitError: null })

    try {
      await submitPrompt({
        promptId,
        prompt: graph.prompt,
        clientId: comfySocket.sid,
        previewMethod: params.previewMethod,
      })
      const run = get().run
      if (run?.promptId === promptId) {
        // On a warm server execution_start can arrive before this fetch resolves, so the
        // ack must not knock the run back from `running` to `queued`.
        const status = run.status === 'submitting' ? 'queued' : run.status
        set({ run: { ...run, tPostAck: performance.now() - run.t0, status } })
      }
      return promptId
    } catch (error) {
      const message =
        error instanceof ComfyRequestError
          ? [error.message, ...error.nodeErrors.map((e) => `node ${e.nodeId}: ${e.message}`)].join(' · ')
          : 'Could not reach ComfyUI'
      set({ run: null, submitError: message })
      return null
    }
  },

  cancel: async () => {
    const run = get().run
    if (!run) return
    // Not marked cancelled here: only execution_interrupted proves the server complied.
    set({ run: { ...run, cancelRequestedAt: performance.now() - run.t0 } })
    await cancelPrompt(run.promptId)
  },

  clearError: () => set({ submitError: null }),
}))

comfySocket.onMessage((message) => {
  const run = useRunStore.getState().run
  if (!run) return
  useRunStore.setState({ run: reduceRun(run, message) })
})

/**
 * Backstop only. Runs when a generation is in flight and the websocket has visibly failed,
 * so the app can recover a finished run rather than hanging. Per-step timing for the
 * missed window is genuinely gone, and the UI says so rather than inventing it.
 */
window.setInterval(() => {
  const run = useRunStore.getState().run
  if (!run || (run.status !== 'running' && run.status !== 'queued')) return

  const silentMs = performance.now() - run.tLastWsMessage
  if (silentMs < GAP_MS) return
  comfySocket.markDegraded(silentMs)

  void getHistory(run.promptId).then((entry) => {
    if (!entry?.status.completed) return
    const current = useRunStore.getState().run
    if (current?.promptId !== run.promptId) return

    const images = Object.values(entry.outputs).flatMap((output) => output.images ?? [])
    useRunStore.setState({
      run: {
        ...current,
        status: entry.status.status_str === 'success' ? 'success' : 'error',
        images: images.length > 0 ? images : current.images,
        tEnd: current.tEnd ?? performance.now() - current.t0,
        reconciledFromHistory: true,
      },
    })
  })
}, RECONCILE_EVERY_MS)
