import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { ComfyPrompt } from '../comfy/types'

/**
 * The exact prompt that was POSTed, verbatim. Everything else on screen is an
 * interpretation of the run; this is the thing itself, so any disagreement between the
 * timeline and reality can be settled here rather than taken on trust.
 */
export function GraphInspector({ graph, promptId }: { graph: ComfyPrompt; promptId: string }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const json = JSON.stringify(graph, null, 2)

  return (
    <div className="inspector">
      <div className="inspector-head">
        <button
          type="button"
          className="mini-button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          {open ? 'hide' : 'show'} the graph that ran
        </button>
        {open && (
          <button
            type="button"
            className="mini-button"
            onClick={() => {
              void navigator.clipboard?.writeText(json).then(() => {
                setCopied(true)
                window.setTimeout(() => setCopied(false), 1100)
              })
            }}
          >
            {copied ? 'copied' : 'copy'}
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <p className="inspector-note">
              prompt_id <span className="num">{promptId}</span> — minted by this app before the
              request, so the run could be tracked from the first message.
            </p>
            <pre className="inspector-json">{json}</pre>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
