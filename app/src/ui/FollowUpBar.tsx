import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { adoptOutputImage } from '../library/portrait'
import {
  CHAIN_WARNING,
  FOLLOW_UPS,
  FREE_TEXT_KEEP,
  followUpParams,
  followUpPrompt,
  type FollowUpPreset,
} from '../library/followUp'
import { useComposeStore } from '../run/composeStore'
import { useRunStore } from '../run/runStore'
import { panelVariants } from '../motion/variants'

const FOLLOWUP_SUBFOLDER = 'qwen-app/followups'

/**
 * Changes the last result without the user editing prompt text.
 *
 * The previous image becomes the reference and the instruction is applied to it. The run store
 * holds exactly one run and generate() replaces it synchronously, so the source is read out of
 * the store into local state BEFORE anything async happens -- the output-to-input round trip
 * takes seconds, and the main Generate button is live for all of it.
 */
export function FollowUpBar({ busy }: { busy: boolean }) {
  const lastResult = useComposeStore((state) => state.lastResult)
  const setLastResult = useComposeStore((state) => state.setLastResult)
  const generate = useRunStore((state) => state.generate)

  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingPreset, setPendingPreset] = useState<FollowUpPreset | null>(null)
  const [text, setText] = useState('')

  if (!lastResult) return null

  const run = async (instruction: string, keep: string) => {
    // Captured before any await: generate() will replace the run slot the moment it is called.
    const source = { ...lastResult }
    setWorking(true)
    setError(null)
    try {
      const adopted = await adoptOutputImage(source.ref, source.width, source.height, FOLLOWUP_SUBFOLDER)
      const prompt = followUpPrompt(instruction, keep)
      const params = followUpParams(adopted, prompt, Math.floor(Math.random() * 1e9))
      const id = await generate(params)
      if (!id) setError('could not submit the follow-up')
      else {
        setLastResult({
          ...source,
          chainDepth: source.chainDepth + 1,
          origin: source.origin ?? { ref: source.ref, width: source.width, height: source.height },
        })
      }
    } catch (followError) {
      setError(followError instanceof Error ? followError.message : 'could not prepare the image')
    } finally {
      setWorking(false)
      setPendingPreset(null)
      setText('')
    }
  }

  const disabled = busy || working

  return (
    <section className="followup">
      <div className="followup-head">
        <span className="label-xs">change this image</span>
        {lastResult.chainDepth > 0 && (
          <span className="unit">follow-up {lastResult.chainDepth} of this chain</span>
        )}
      </div>

      <div className="followup-chips">
        {FOLLOW_UPS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            className="chip-button"
            disabled={disabled}
            onClick={() => {
              if (preset.needsText) setPendingPreset(preset)
              else void run(preset.instruction, preset.keep)
            }}
          >
            {preset.label}
          </button>
        ))}
        {lastResult.origin && (
          <button
            type="button"
            className="chip-button"
            disabled={disabled}
            onClick={() =>
              setLastResult({ ...lastResult.origin!, chainDepth: 0, origin: null })
            }
          >
            start over from the original
          </button>
        )}
      </div>

      <AnimatePresence>
        {pendingPreset && (
          <motion.div
            className="followup-text"
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <input
              autoFocus
              value={text}
              placeholder={pendingPreset.needsText}
              disabled={disabled}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && text.trim()) {
                  void run(pendingPreset.instruction.replace('{text}', text.trim()), pendingPreset.keep)
                }
                if (event.key === 'Escape') setPendingPreset(null)
              }}
            />
            <button
              type="button"
              className="mini-button"
              disabled={disabled || !text.trim()}
              onClick={() =>
                void run(pendingPreset.instruction.replace('{text}', text.trim()), pendingPreset.keep)
              }
            >
              go
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="followup-free">
        <input
          value={pendingPreset ? '' : text}
          placeholder="or describe the change…"
          disabled={disabled || pendingPreset !== null}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && text.trim()) void run(text.trim(), FREE_TEXT_KEEP)
          }}
        />
      </div>

      {working && <p className="followup-note">Copying the image into ComfyUI&apos;s input folder…</p>}
      {error && <p className="followup-note followup-error">{error}</p>}

      {lastResult.chainDepth >= 3 && <p className="followup-note followup-warn">{CHAIN_WARNING}</p>}
    </section>
  )
}
