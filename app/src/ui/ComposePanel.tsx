import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { MAX_REFERENCES } from '../graph/buildGraph'
import { composeShot } from '../library/composeShot'
import { encodeCost } from '../library/cost'
import { describeProblem, isBlocking, lintPrompt } from '../library/composePrompt'
import { prepareAndUpload } from '../library/upload'
import type { FileCheck, Subject } from '../library/types'
import { aspectFor } from '../library/vocab'
import { resolveAttachments, useComposeStore } from '../run/composeStore'
import { dropzoneVariants } from '../motion/variants'
import { AttachmentList } from './AttachmentList'
import { CostMeter } from './CostMeter'
import { ShotForm } from './ShotForm'

interface Props {
  subjects: Subject[]
  checks: Record<string, FileCheck>
  busy: boolean
  onGenerate: () => void
  onCancel: () => void
  stepFraction: number
}

export function ComposePanel({ subjects, checks, busy, onGenerate, onCancel, stepFraction }: Props) {
  const [dragging, setDragging] = useState(false)
  const [advanced, setAdvanced] = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)
  const [showImages, setShowImages] = useState(false)
  const [confirmGuided, setConfirmGuided] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const params = useComposeStore((state) => state.params)
  const setParams = useComposeStore((state) => state.setParams)
  const attachments = useComposeStore((state) => state.attachments)
  const setAttachments = useComposeStore((state) => state.setAttachments)
  const attach = useComposeStore((state) => state.attach)
  const detach = useComposeStore((state) => state.detach)
  const move = useComposeStore((state) => state.move)
  const shot = useComposeStore((state) => state.shot)
  const setShot = useComposeStore((state) => state.setShot)
  const promptMode = useComposeStore((state) => state.promptMode)
  const setPromptMode = useComposeStore((state) => state.setPromptMode)

  const resolved = useMemo(() => resolveAttachments(attachments, subjects), [attachments, subjects])
  const composed = useMemo(() => composeShot(shot, resolved, subjects), [shot, resolved, subjects])

  // In guided mode the chips own the prompt, so there is exactly one source of truth and the
  // lints, the cost meter and the graph inspector all keep working unchanged.
  useEffect(() => {
    if (promptMode !== 'guided') return
    if (params.prompt !== composed.prompt) setParams({ prompt: composed.prompt })
  }, [promptMode, composed.prompt, params.prompt, setParams])

  // The aspect chip is a size control, not a prompt control, so it stays live in both modes.
  const aspect = aspectFor(shot.aspect)
  useEffect(() => {
    if (params.width !== aspect.width || params.height !== aspect.height) {
      setParams({ width: aspect.width, height: aspect.height })
    }
  }, [aspect.width, aspect.height, params.width, params.height, setParams])

  const missing = useMemo(
    () => new Set(resolved.filter((r) => checks[r.key] === 'missing').map((r) => r.key)),
    [resolved, checks],
  )
  const problems = useMemo(
    () => lintPrompt(params.prompt, resolved, missing, subjects),
    [params.prompt, resolved, missing, subjects],
  )
  const blocked = problems.some(isBlocking)

  const cost = useMemo(
    () => encodeCost(resolved, params.resolution, params.width, params.height),
    [resolved, params.resolution, params.width, params.height],
  )

  const toggleSubject = (subject: Subject, allViews: boolean) => {
    const already = resolved.some((r) => r.subjectId === subject.id)
    if (already) {
      // A real toggle. This used to append every image on every click, silently doubling.
      setAttachments(
        attachments.filter((a) => !(a.kind === 'subject' && a.subjectId === subject.id)),
      )
      return
    }
    const images = allViews
      ? subject.images
      : subject.images.filter((image) => image.id === (subject.primaryImageId ?? subject.images[0]?.id))
    attach(images.map((image) => ({ kind: 'subject' as const, subjectId: subject.id, imageId: image.id })))
  }

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setUploadError(null)
    const room = MAX_REFERENCES - attachments.length
    const accepted = [...files].filter((f) => f.type.startsWith('image/')).slice(0, room)
    if (accepted.length < [...files].length) {
      setUploadError(`Only ${room} more fit — the graph allows ${MAX_REFERENCES}.`)
    }
    const added = []
    for (const file of accepted) {
      try {
        const prepared = await prepareAndUpload(file)
        added.push({
          kind: 'adhoc' as const,
          name: prepared.image.name,
          subfolder: prepared.image.subfolder,
          width: prepared.image.width,
          height: prepared.image.height,
        })
      } catch {
        setUploadError(`Could not upload ${file.name}`)
      }
    }
    if (added.length) attach(added)
  }

  return (
    <section className={`panel compose ${busy ? 'compose-busy' : ''}`}>
      {subjects.length > 0 && (
        <div className="chiprow">
          <span className="label-xs">who or where</span>
          <div className="chiprow-chips">
            {subjects.map((subject) => {
              const on = resolved.some((r) => r.subjectId === subject.id)
              return (
                <span key={subject.id} className="subject-pick">
                  <button
                    type="button"
                    className={`chip-button ${on ? 'chip-button-on' : ''}`}
                    aria-pressed={on}
                    disabled={busy || subject.images.length === 0}
                    onClick={() => toggleSubject(subject, false)}
                  >
                    {subject.name || 'untitled'}
                    <span className="unit"> ·{subject.kind}</span>
                  </button>
                  {!on && subject.images.length > 1 && (
                    <button
                      type="button"
                      className="mini-button subject-allviews"
                      disabled={busy}
                      onClick={() => toggleSubject(subject, true)}
                    >
                      all {subject.images.length}
                    </button>
                  )}
                </span>
              )
            })}
          </div>
          <p className="chiprow-note">
            One photo is attached by default. More views cost about 2 GiB of cache each and make a
            duplicate of them likelier in wide shots.
          </p>
        </div>
      )}

      {promptMode === 'guided' ? (
        <ShotForm
          shot={shot}
          onChange={setShot}
          attachments={resolved}
          needsSubjectNoun={composed.needsSubjectNoun}
          disabled={busy}
        />
      ) : (
        <label className="field">
          <span className="label-xs">
            prompt <span className="unit">you are editing this by hand</span>
          </span>
          <textarea
            className="prompt-input"
            rows={8}
            value={params.prompt}
            disabled={busy}
            onChange={(event) => setParams({ prompt: event.target.value })}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !blocked) onGenerate()
            }}
          />
        </label>
      )}

      {problems.length > 0 && (
        <ul className="problems">
          {problems.map((problem, index) => (
            <li key={index} className={isBlocking(problem) ? 'problem-blocking' : ''}>
              {describeProblem(problem)}
            </li>
          ))}
        </ul>
      )}

      <motion.button
        type="button"
        layout
        className="generate"
        onClick={busy ? onCancel : onGenerate}
        disabled={!busy && (params.prompt.trim() === '' || blocked)}
        whileTap={{ scale: 0.97 }}
      >
        {busy && stepFraction > 0 && (
          <span className="generate-fill" style={{ transform: `scaleX(${stepFraction})` }} />
        )}
        <span className="generate-label">{busy ? 'Cancel' : 'Generate'}</span>
      </motion.button>

      {/* ---- disclosures ---- */}

      <button type="button" className="disclosure" onClick={() => setShowPrompt((v) => !v)} aria-expanded={showPrompt}>
        {showPrompt ? 'hide' : 'show'} what the model will read
      </button>
      <AnimatePresence initial={false}>
        {showPrompt && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden' }}
          >
            {/* Rendered from the string that is submitted, never re-composed from the chips --
                otherwise the preview and the graph could drift apart. */}
            <pre className="prompt-preview">{params.prompt || '(nothing yet)'}</pre>
            {promptMode === 'guided' ? (
              <button type="button" className="mini-button" disabled={busy} onClick={() => setPromptMode('text')}>
                edit as text
              </button>
            ) : confirmGuided ? (
              <div className="confirm">
                <p>Going back to the questions replaces what you typed with the chips&apos; version.</p>
                <div className="editor-actions">
                  <button
                    type="button"
                    className="mini-button danger"
                    onClick={() => {
                      setPromptMode('guided')
                      setParams({ prompt: composed.prompt })
                      setConfirmGuided(false)
                    }}
                  >
                    discard my text
                  </button>
                  <button type="button" className="mini-button" onClick={() => setConfirmGuided(false)}>
                    keep editing
                  </button>
                </div>
                <pre className="prompt-preview prompt-preview-alt">{composed.prompt}</pre>
              </div>
            ) : (
              <button type="button" className="mini-button" onClick={() => setConfirmGuided(true)}>
                back to the questions
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <button type="button" className="disclosure" onClick={() => setShowImages((v) => !v)} aria-expanded={showImages}>
        {showImages ? 'hide' : 'show'} attached images
        {resolved.length > 0 ? ` (${resolved.length})` : ''}
      </button>
      <AnimatePresence initial={false}>
        {showImages && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <AttachmentList
              attachments={resolved}
              resolution={params.resolution}
              targetWidth={params.width}
              targetHeight={params.height}
              checks={checks}
              onRemove={detach}
              onMove={move}
              disabled={busy}
            />
            <CostMeter cost={cost} referenceCount={resolved.length} />
            <motion.div
              className="dropzone"
              variants={dropzoneVariants}
              animate={dragging ? 'over' : 'rest'}
              initial="rest"
              onDragOver={(event) => {
                event.preventDefault()
                if (!busy) setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault()
                setDragging(false)
                if (!busy) void addFiles(event.dataTransfer.files)
              }}
              onClick={() => !busy && fileInput.current?.click()}
              role="button"
              tabIndex={busy ? -1 : 0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') fileInput.current?.click()
              }}
            >
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(event) => void addFiles(event.target.files)}
              />
              <p className="dropzone-hint">drop a one-off image for this run</p>
              {uploadError && <p className="dropzone-error">{uploadError}</p>}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <button type="button" className="disclosure" onClick={() => setAdvanced((v) => !v)} aria-expanded={advanced}>
        {advanced ? 'hide' : 'show'} advanced
      </button>
      <AnimatePresence initial={false}>
        {advanced && (
          <motion.div
            className="advanced"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            <NumberField label="steps" value={params.steps} onChange={(steps) => setParams({ steps })} />
            <NumberField label="cfg" value={params.cfg} step={0.1} onChange={(cfg) => setParams({ cfg })} />
            <label className="field">
              <span className="label-xs">
                seed <span className="unit">{params.seed === 0 ? '0 → random each run' : 'fixed'}</span>
              </span>
              <input
                type="number"
                value={params.seed}
                onChange={(event) => setParams({ seed: Number(event.target.value) })}
              />
            </label>
            <label className="field">
              <span className="label-xs">
                reference budget <span className="unit">total pixels, not width</span>
              </span>
              <input
                type="number"
                step={32}
                value={params.resolution}
                onChange={(event) => setParams({ resolution: Number(event.target.value) })}
              />
            </label>
            <label className="field">
              <span className="label-xs">kv cache</span>
              <select
                value={params.cacheDevice}
                onChange={(event) => setParams({ cacheDevice: event.target.value as typeof params.cacheDevice })}
              >
                <option value="auto">auto</option>
                <option value="cpu">cpu (RAM)</option>
                <option value="gpu">gpu</option>
                <option value="off">off</option>
              </select>
            </label>
            <label className="field">
              <span className="label-xs">cache precision</span>
              <select
                value={params.cacheDtype}
                onChange={(event) => setParams({ cacheDtype: event.target.value as typeof params.cacheDtype })}
              >
                <option value="default">default</option>
                <option value="int8">int8</option>
                <option value="int4">int4</option>
              </select>
            </label>
            {params.cfg <= 1.0001 && (
              <p className="advanced-note">
                At cfg 1.0 the sampler discards the negative conditioning, but it is still encoded —
                with references that is a second full pass of Qwen3-VL over every attached image.
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

function NumberField({
  label,
  value,
  step = 1,
  onChange,
}: {
  label: string
  value: number
  step?: number
  onChange: (value: number) => void
}) {
  return (
    <label className="field">
      <span className="label-xs">{label}</span>
      <input type="number" step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  )
}
