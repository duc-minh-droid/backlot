import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { viewUrl } from '../comfy/rest'
import { ANGLES, SCENE_ANGLES, anglePortraitParams, firstPortraitParams } from '../library/portrait'
import { useSubjectGeneration } from '../library/useSubjectGeneration'
import type { Subject, SubjectImage } from '../library/types'
import { useRunStore } from '../run/runStore'
import { panelVariants } from '../motion/variants'

interface Props {
  subject: Subject
  onAdd: (image: SubjectImage) => void
}

const randomSeed = () => Math.floor(Math.random() * 1e9)

/**
 * Builds a subject with no photographs to start from.
 *
 * The first shot comes from the description alone. Every later shot is generated FROM an
 * accepted photo with it attached as a reference -- re-rolling the description would just
 * produce a different person each time, which is the exact problem the library exists to
 * solve.
 */
export function SubjectStudio({ subject, onAdd }: Props) {
  const generation = useSubjectGeneration()
  const run = useRunStore((state) => state.run)
  const [sourceId, setSourceId] = useState<string | null>(null)

  const hasPhoto = subject.images.length > 0
  const source =
    subject.images.find((image) => image.id === sourceId) ??
    subject.images.find((image) => image.id === subject.primaryImageId) ??
    subject.images[0]

  const angles = subject.kind === 'person' ? ANGLES : SCENE_ANGLES
  const watching = generation.pendingId !== null && run?.promptId === generation.pendingId
  const describedEnough = subject.description.trim().length > 0 || subject.name.trim().length > 0

  return (
    <div className="studio">
      <div className="studio-head">
        <span className="label-xs">generate from the description</span>
        <span className="unit">no photo needed</span>
      </div>

      <div className="studio-actions">
        <button
          type="button"
          className="mini-button"
          disabled={generation.busy || !describedEnough}
          onClick={() =>
            void generation.start(
              firstPortraitParams(subject, randomSeed()),
              hasPhoto ? 'another take' : 'first photo',
            )
          }
        >
          {hasPhoto ? 'another take from the description' : 'generate the first photo'}
        </button>

        {hasPhoto &&
          angles.map((angle) => (
            <button
              key={angle.key}
              type="button"
              className="mini-button"
              disabled={generation.busy || !source}
              onClick={() =>
                source &&
                void generation.start(
                  anglePortraitParams(subject, source, angle.instruction, randomSeed()),
                  angle.label,
                )
              }
            >
              {angle.label}
            </button>
          ))}
      </div>

      {!describedEnough && (
        <p className="studio-note">
          Write a description first — that is the only thing the first photo has to go on.
        </p>
      )}

      {hasPhoto && (
        <p className="studio-note">
          Extra views are generated <strong>from</strong> the photo below, not from the text, so
          they stay the same {subject.kind === 'person' ? 'person' : 'place'}. Another take from
          the description will be someone else.
          {subject.images.length > 1 && (
            <>
              {' '}
              Building on:{' '}
              <select
                value={source?.id ?? ''}
                onChange={(event) => setSourceId(event.target.value)}
                className="studio-source"
              >
                {subject.images.map((image, index) => (
                  <option key={image.id} value={image.id}>
                    photo {index + 1}
                  </option>
                ))}
              </select>
            </>
          )}
        </p>
      )}

      <AnimatePresence>
        {watching && (
          <motion.p
            className="studio-note studio-live"
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            Generating {run?.status === 'running' ? 'now' : 'shortly'} — the full pipeline, timings and live
            preview are on the Generate tab.
          </motion.p>
        )}

        {generation.candidate && (
          <motion.div
            className="studio-candidate"
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <img src={viewUrl(generation.candidate.ref)} alt={generation.candidate.label} />
            <div className="studio-candidate-body">
              <strong>{generation.candidate.label}</strong>
              <span className="unit num">
                {generation.candidate.width}×{generation.candidate.height}
              </span>
              <div className="editor-actions">
                <button
                  type="button"
                  className="mini-button"
                  disabled={generation.busy}
                  onClick={() =>
                    void generation.keep().then((image) => {
                      if (image) onAdd(image)
                    })
                  }
                >
                  keep it
                </button>
                <button type="button" className="mini-button" onClick={generation.discard}>
                  discard
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {generation.error && (
          <motion.p
            className="studio-note studio-error"
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {generation.error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}
