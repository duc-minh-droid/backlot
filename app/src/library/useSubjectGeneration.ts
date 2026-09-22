import { useCallback, useState } from 'react'
import type { ComfyImageRef } from '../comfy/types'
import type { GenParams } from '../graph/buildGraph'
import { useRunStore } from '../run/runStore'
import { adoptOutputImage } from './portrait'
import type { SubjectImage } from './types'

export interface Candidate {
  ref: ComfyImageRef
  width: number
  height: number
  /** What produced it, so the editor can say "three-quarter view" rather than a filename. */
  label: string
}

export interface SubjectGeneration {
  /** The prompt id we are watching, or null when idle. */
  pendingId: string | null
  candidate: Candidate | null
  error: string | null
  busy: boolean
  start: (params: GenParams, label: string) => Promise<void>
  keep: () => Promise<SubjectImage | null>
  discard: () => void
}

/**
 * Drives a generation from the Library using the SAME run store as the Generate view, so a
 * portrait run shows up in the normal timeline, preview and log rather than getting its own
 * parallel progress UI that could disagree with it.
 */
export function useSubjectGeneration(): SubjectGeneration {
  const generate = useRunStore((state) => state.generate)
  const run = useRunStore((state) => state.run)

  const [pendingId, setPendingId] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adopting, setAdopting] = useState(false)

  const watching = pendingId !== null && run?.promptId === pendingId

  // Resolve the run we started into a candidate, without polling anything: the run store is
  // already fed by the websocket.
  if (watching && run) {
    if (run.status === 'success' && run.images[0] && candidate?.ref.filename !== run.images[0].filename) {
      setCandidate({
        ref: run.images[0],
        width: run.params.width,
        height: run.params.height,
        label,
      })
      setPendingId(null)
    } else if (run.status === 'error' && error === null) {
      setError(run.error?.exception_message?.trim() || 'the generation failed')
      setPendingId(null)
    } else if (run.status === 'interrupted' && error === null) {
      setError('stopped before it finished')
      setPendingId(null)
    }
  }

  const start = useCallback(
    async (params: GenParams, nextLabel: string) => {
      setError(null)
      setCandidate(null)
      setLabel(nextLabel)
      const id = await generate(params)
      if (id) setPendingId(id)
      else setError('could not submit the generation')
    },
    [generate],
  )

  const keep = useCallback(async () => {
    if (!candidate) return null
    setAdopting(true)
    try {
      // Generated images land in the output folder; references are read from input.
      const image = await adoptOutputImage(candidate.ref, candidate.width, candidate.height)
      setCandidate(null)
      return image
    } catch (adoptError) {
      setError(adoptError instanceof Error ? adoptError.message : 'could not save the photo')
      return null
    } finally {
      setAdopting(false)
    }
  }, [candidate])

  const discard = useCallback(() => {
    setCandidate(null)
    setError(null)
  }, [])

  return {
    pendingId,
    candidate,
    error,
    busy: pendingId !== null || adopting,
    start,
    keep,
    discard,
  }
}
