import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { panelVariants } from '../motion/variants'
import { mapError } from '../lib/errorMap'
import { seconds } from '../lib/format'
import type { ConnState } from '../comfy/socket'
import type { RunState } from '../run/types'

interface Props {
  run: RunState | null
  connection: ConnState
  submitError: string | null
}

/**
 * Error, cancelled and disconnected states. The copy says what happened, why the machine
 * did that, and what changes if you act -- no apologies, no "something went wrong".
 */
export function StatusPanel({ run, connection, submitError }: Props) {
  const [showTrace, setShowTrace] = useState(false)

  const offline = connection.phase === 'reconnecting' || connection.phase === 'connecting'

  return (
    <AnimatePresence initial={false}>
      {offline && (
        <motion.section
          key="offline"
          className="status status-warn"
          variants={panelVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <strong>No ComfyUI at 127.0.0.1:8188</strong>
          <p>
            Start it with <code>run-comfyui.bat</code>. This panel reconnects on its own.
          </p>
          {connection.phase === 'reconnecting' && (
            <p className="num">attempt {connection.attempt} · {connection.reason}</p>
          )}
        </motion.section>
      )}

      {submitError && (
        <motion.section
          key="submit"
          className="status status-error"
          variants={panelVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <strong>ComfyUI rejected the request</strong>
          <p>{submitError}</p>
        </motion.section>
      )}

      {run?.status === 'error' && run.error && (
        <motion.section
          key="error"
          className="status status-error"
          variants={panelVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <strong className="num">{run.error.exception_type}</strong>
          <p>{mapError(run.error.exception_type, run.error.exception_message).explanation}</p>
          <p className="status-detail">
            It failed {seconds(run.tEnd ?? 0)}s in, at node {run.error.node_id} ({run.error.node_type}).
            {run.preview ? ' The preview above is the last real step — unfinished, but real.' : ''}
          </p>
          <button type="button" className="mini-button" onClick={() => setShowTrace((v) => !v)}>
            {showTrace ? 'hide' : 'show'} traceback
          </button>
          {showTrace && <pre className="traceback">{run.error.traceback.join('')}</pre>}
        </motion.section>
      )}

      {run?.status === 'interrupted' && (
        <motion.section
          key="interrupted"
          className="status"
          variants={panelVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <strong>Stopped {seconds(run.tEnd ?? 0)}s in</strong>
          <p>
            The weights stay in VRAM, so the next run skips the load and starts sampling almost
            immediately. The image above is the last preview frame — a partial denoise, not a
            render, and it was not saved.
          </p>
        </motion.section>
      )}

      {run?.cancelRequestedAt !== undefined && run.status === 'running' && (
        <motion.section
          key="cancelling"
          className="status status-warn"
          variants={panelVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <strong>Cancel requested — waiting for the server to acknowledge</strong>
          <p>
            {run.activeNodeId && run.nodes[run.activeNodeId]?.steps.length
              ? 'It will stop at the next sampler step.'
              : 'Weight loading cannot be interrupted, so this takes effect at the next sampler step.'}
          </p>
        </motion.section>
      )}

      {run?.reconciledFromHistory && (
        <motion.section
          key="reconciled"
          className="status status-warn"
          variants={panelVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <strong>Recovered from the server's history</strong>
          <p>
            The websocket went quiet mid-run, so this result came from <code>/history</code>.
            Per-step timing for the missed window is genuinely unavailable.
          </p>
        </motion.section>
      )}
    </AnimatePresence>
  )
}
