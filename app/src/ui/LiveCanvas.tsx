import { useEffect, useRef, useState } from 'react'
import { motion, useMotionTemplate, useSpring, useTransform } from 'motion/react'
import { useReducedMotionPreference } from '../motion/useMotionPreference'
import { spring } from '../motion/tokens'
import type { RunState } from '../run/types'

interface Props {
  run: RunState | null
  finalUrl: string | null
  stepFraction: number
  /**
   * Read from the sampler's progress messages, not from the preview frame. A binary frame
   * arrives just BEFORE the progress message for the same step, so deriving the badge from
   * the frame would show a number one behind the timeline chip.
   */
  step: number
  maxSteps: number
}

const BACKING = 768

/**
 * Two stacked canvases, never <img src=blobURL>.
 *
 * createImageBitmap decodes off the main thread and lets us choose exactly when pixels
 * appear: we paint the hidden canvas, then cross-fade. The visible canvas is never
 * cleared and never shows a partially drawn frame, which is what kills the one-frame
 * blank you get from assigning to img.src.
 */
export function LiveCanvas({ run, finalUrl, stepFraction, step, maxSteps }: Props) {
  const reduced = useReducedMotionPreference()
  const canvasA = useRef<HTMLCanvasElement>(null)
  const canvasB = useRef<HTMLCanvasElement>(null)
  const frontIsA = useRef(true)
  const decoding = useRef(false)
  const lastDrawn = useRef<string | null>(null)
  const [hasFrame, setHasFrame] = useState(false)

  const fraction = useSpring(stepFraction, spring.counter)
  useEffect(() => {
    fraction.set(stepFraction)
  }, [stepFraction, fraction])

  // The resolve ramp: early latents are 128px of noise, so blur makes them read as "not
  // yet resolved" rather than "broken image". All four land on one wrapper so the browser
  // composites a single layer.
  const blur = useTransform(fraction, [0, 0.35, 1], [5, 1.6, 0])
  const saturate = useTransform(fraction, [0, 0.4, 1], [0.82, 0.95, 1])
  const grade = useMotionTemplate`blur(${blur}px) saturate(${saturate})`

  const preview = run?.preview ?? null

  useEffect(() => {
    if (!preview || preview.objectUrl === lastDrawn.current) return
    // Newest wins: if a decode is in flight we drop this frame rather than queue it. The
    // step badge still shows the true step from the progress message.
    if (decoding.current) return

    decoding.current = true
    const url = preview.objectUrl
    lastDrawn.current = url

    void (async () => {
      try {
        const response = await fetch(url)
        const bitmap = await createImageBitmap(await response.blob())
        const back = frontIsA.current ? canvasB.current : canvasA.current
        if (back) {
          const scale = Math.min(BACKING / bitmap.width, BACKING / bitmap.height, 4)
          back.width = Math.round(bitmap.width * scale)
          back.height = Math.round(bitmap.height * scale)
          const ctx = back.getContext('2d')
          if (ctx) {
            ctx.imageSmoothingEnabled = true
            ctx.imageSmoothingQuality = 'high'
            ctx.drawImage(bitmap, 0, 0, back.width, back.height)
          }
        }
        bitmap.close()
        frontIsA.current = !frontIsA.current
        setHasFrame(true)
      } catch {
        /* a revoked url just means a newer frame already replaced it */
      } finally {
        decoding.current = false
      }
    })()
  }, [preview])

  useEffect(() => {
    if (!run) {
      setHasFrame(false)
      lastDrawn.current = null
    }
  }, [run])

  const fade = reduced ? 0.12 : 0.22
  const showFinal = finalUrl !== null
  const failed = run?.status === 'error'

  return (
    <div className="canvas-frame">
      <motion.div
        className="canvas-grade"
        style={{ filter: reduced || showFinal ? undefined : grade }}
        animate={failed ? { filter: 'grayscale(0.65) brightness(0.8)' } : undefined}
      >
        <canvas ref={canvasA} className="canvas-layer" style={{ opacity: frontIsA.current ? 1 : 0, transition: `opacity ${fade}s` }} />
        <canvas ref={canvasB} className="canvas-layer" style={{ opacity: frontIsA.current ? 0 : 1, transition: `opacity ${fade}s` }} />

        {showFinal && (
          <motion.img
            key={finalUrl}
            src={finalUrl}
            alt={run?.params.prompt ?? 'generated image'}
            className="canvas-final"
            initial={{ opacity: 0, filter: 'brightness(1.05)' }}
            animate={{ opacity: 1, filter: 'brightness(1)' }}
            transition={{ duration: reduced ? 0.2 : 0.42 }}
          />
        )}
      </motion.div>

      {!hasFrame && !showFinal && <CanvasPlate run={run} />}

      {hasFrame && !showFinal && run && (
        <div className="canvas-badge num">
          {step}/{maxSteps}
        </div>
      )}
    </div>
  )
}

function CanvasPlate({ run }: { run: RunState | null }) {
  // Deliberately no synthetic noise here: fake latent noise is a lie shaped exactly like
  // the truth we show 60 seconds later.
  if (!run) {
    return (
      <div className="canvas-plate">
        <strong>Nothing generated yet</strong>
        <p>
          Type a prompt and press Generate. A cold run reads 10.5 GB of weights off disk before
          sampling starts — around 60 seconds, with no step-level progress, because ComfyUI does
          not emit any during a load. You will see elapsed time and the server's own log instead.
        </p>
      </div>
    )
  }

  return (
    <div className="canvas-plate">
      <strong>No image exists yet</strong>
      <p>The sampler has not started. Weights are still loading from disk.</p>
    </div>
  )
}
