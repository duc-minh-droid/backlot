import { AnimatePresence, motion } from 'motion/react'
import { viewUrl } from '../comfy/rest'
import { referenceTargetSize } from '../graph/buildGraph'
import type { FileCheck, ResolvedAttachment } from '../library/types'
import { refThumbVariants } from '../motion/variants'

interface Props {
  attachments: ResolvedAttachment[]
  resolution: number
  targetWidth: number
  targetHeight: number
  checks: Record<string, FileCheck>
  onRemove: (index: number) => void
  onMove: (from: number, to: number) => void
  disabled: boolean
}

/**
 * The index in this list IS the <imageN> number and the images.image_N key. Nothing is
 * derived, so reordering here is the only thing that changes the binding.
 */
export function AttachmentList({
  attachments,
  resolution,
  targetWidth,
  targetHeight,
  checks,
  onRemove,
  onMove,
  disabled,
}: Props) {
  if (attachments.length === 0) return null

  const anchor = attachments[0]
  const anchorSize = anchor ? referenceTargetSize(anchor, resolution) : null
  const anchorAspect = anchorSize ? anchorSize.width / anchorSize.height : 0
  const targetAspect = targetWidth / targetHeight
  const drift = anchorSize ? Math.abs(anchorAspect - targetAspect) : 0

  return (
    <div className="attachments">
      <span className="label-xs">
        attached <span className="unit">order sets the image numbers</span>
      </span>

      <ol className="attach-list">
        <AnimatePresence mode="popLayout">
          {attachments.map((attachment, index) => {
            const size = referenceTargetSize(attachment, resolution)
            const state = checks[attachment.key] ?? 'unknown'
            return (
              <motion.li
                key={attachment.key}
                layout
                className={`attach-item ${state === 'missing' ? 'attach-missing' : ''}`}
                variants={refThumbVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
              >
                <img
                  src={viewUrl({
                    filename: attachment.name,
                    subfolder: attachment.subfolder,
                    type: 'input',
                  })}
                  alt={attachment.subjectName ?? attachment.name}
                />
                <div className="attach-meta">
                  <span className="num">&lt;image{index + 1}&gt;</span>
                  <span className="unit">
                    {attachment.subjectName ?? 'ad-hoc'} · {size.width}×{size.height}
                    {state === 'missing' ? ' · file missing' : ''}
                  </span>
                </div>
                <div className="attach-buttons">
                  <button
                    type="button"
                    className="mini-button"
                    disabled={disabled || index === 0}
                    aria-label={`move image ${index + 1} earlier`}
                    onClick={() => onMove(index, index - 1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="mini-button"
                    disabled={disabled || index === attachments.length - 1}
                    aria-label={`move image ${index + 1} later`}
                    onClick={() => onMove(index, index + 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="mini-button"
                    disabled={disabled}
                    aria-label={`remove image ${index + 1}`}
                    onClick={() => onRemove(index)}
                  >
                    ×
                  </button>
                </div>
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ol>

      {anchorSize && (
        <p className={`attach-anchor ${drift > 0.25 ? 'attach-anchor-warn' : ''}`}>
          image_1 resizes to{' '}
          <span className="num">
            {anchorSize.width}×{anchorSize.height}
          </span>{' '}
          · your output is{' '}
          <span className="num">
            {targetWidth}×{targetHeight}
          </span>{' '}
          · aspect <span className="num">{anchorAspect.toFixed(2)}</span> vs{' '}
          <span className="num">{targetAspect.toFixed(2)}</span>
          {drift > 0.25
            ? ' — ComfyUI warns the edit can shift when these are far apart. Reorder so a closer-shaped image is first, or change the output size.'
            : ''}
        </p>
      )}
    </div>
  )
}
