import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { viewUrl } from '../comfy/rest'
import { KIND_GUIDANCE, type Subject, type SubjectImage, type SubjectKind } from '../library/types'
import { DEFAULT_BINDING } from '../library/types'
import { prepareAndUpload, warnsFor } from '../library/upload'
import { bindingClause } from '../library/composePrompt'
import { refThumbVariants } from '../motion/variants'
import { SubjectStudio } from './SubjectStudio'

interface Props {
  subject: Subject
  onChange: (subject: Subject) => void
  onDone: () => void
  onDelete: () => void
}

export function SubjectEditor({ subject, onChange, onDone, onDelete }: Props) {
  const [busy, setBusy] = useState(false)
  const [notices, setNotices] = useState<string[]>([])
  const fileInput = useRef<HTMLInputElement>(null)

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    const messages: string[] = []
    const added: SubjectImage[] = []

    for (const file of [...files].filter((f) => f.type.startsWith('image/'))) {
      try {
        const prepared = await prepareAndUpload(file)
        added.push(prepared.image)
        if (prepared.capped) {
          messages.push(
            `${file.name} was ${prepared.originalWidth}×${prepared.originalHeight}, downscaled to ${prepared.image.width}×${prepared.image.height} before upload — the model never uses more than about 2048 on the long edge.`,
          )
        }
        for (const warning of warnsFor(file)) messages.push(`${file.name}: ${warning}`)
      } catch {
        messages.push(`${file.name} could not be uploaded.`)
      }
    }

    if (added.length) {
      onChange({
        ...subject,
        images: [...subject.images, ...added],
        primaryImageId: subject.primaryImageId ?? added[0]!.id,
      })
    }
    setNotices(messages)
    setBusy(false)
  }

  const removeImage = (imageId: string) => {
    const images = subject.images.filter((image) => image.id !== imageId)
    onChange({
      ...subject,
      images,
      primaryImageId: subject.primaryImageId === imageId ? (images[0]?.id ?? null) : subject.primaryImageId,
    })
  }

  const preview = bindingClause(subject, subject.images.map((_, index) => index))

  return (
    <div className="editor">
      <div className="editor-row">
        <label className="field">
          <span className="label-xs">name</span>
          <input
            value={subject.name}
            placeholder={subject.kind === 'person' ? 'Ana' : 'the workshop'}
            onChange={(event) => onChange({ ...subject, name: event.target.value })}
          />
        </label>

        <label className="field">
          <span className="label-xs">kind</span>
          <select
            value={subject.kind}
            onChange={(event) => {
              const kind = event.target.value as SubjectKind
              const wasDefault = subject.bindingTemplate === DEFAULT_BINDING[subject.kind]
              onChange({
                ...subject,
                kind,
                // Only replace the template if the user had not customised it.
                bindingTemplate: wasDefault ? DEFAULT_BINDING[kind] : subject.bindingTemplate,
              })
            }}
          >
            <option value="person">person</option>
            <option value="scene">scene</option>
          </select>
        </label>
      </div>

      <label className="field">
        <span className="label-xs">
          description <span className="unit">goes into the prompt</span>
        </span>
        <textarea
          rows={2}
          value={subject.description}
          placeholder={
            subject.kind === 'person'
              ? 'a woman in her thirties with short dark hair'
              : 'a cluttered woodworking studio, sawdust in low light'
          }
          onChange={(event) => onChange({ ...subject, description: event.target.value })}
        />
      </label>

      <label className="field">
        <span className="label-xs">
          notes <span className="unit">never sent to the model</span>
        </span>
        <textarea
          rows={2}
          value={subject.notes}
          onChange={(event) => onChange({ ...subject, notes: event.target.value })}
        />
      </label>

      <div className="field">
        <span className="label-xs">
          reference photos <span className="unit">{KIND_GUIDANCE[subject.kind]}</span>
        </span>

        <div className="thumbs">
          <AnimatePresence mode="popLayout">
            {subject.images.map((image) => (
              <motion.figure
                key={image.id}
                layout
                className={`thumb ${subject.primaryImageId === image.id ? 'thumb-primary' : ''}`}
                variants={refThumbVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
              >
                <img
                  src={viewUrl({ filename: image.name, subfolder: image.subfolder, type: 'input' })}
                  alt={image.name}
                />
                <figcaption className="num">
                  {image.width}×{image.height}
                </figcaption>
                <button
                  type="button"
                  className="thumb-remove"
                  aria-label={`remove ${image.name}`}
                  onClick={() => removeImage(image.id)}
                >
                  ×
                </button>
                <button
                  type="button"
                  className="thumb-primary-toggle"
                  aria-pressed={subject.primaryImageId === image.id}
                  onClick={() => onChange({ ...subject, primaryImageId: image.id })}
                >
                  {subject.primaryImageId === image.id ? 'primary' : 'make primary'}
                </button>
              </motion.figure>
            ))}
          </AnimatePresence>
        </div>

        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => void addFiles(event.target.files)}
        />
        <button type="button" className="mini-button" disabled={busy} onClick={() => fileInput.current?.click()}>
          {busy ? 'uploading…' : 'add photos'}
        </button>
      </div>

      <SubjectStudio
        subject={subject}
        onAdd={(image) =>
          onChange({
            ...subject,
            images: [...subject.images, image],
            primaryImageId: subject.primaryImageId ?? image.id,
          })
        }
      />

      {notices.length > 0 && (
        <ul className="editor-notices">
          {notices.map((notice) => (
            <li key={notice}>{notice}</li>
          ))}
        </ul>
      )}

      <label className="field">
        <span className="label-xs">
          binding sentence <span className="unit">{'{refs} {name} {description}'}</span>
        </span>
        <input
          value={subject.bindingTemplate}
          onChange={(event) => onChange({ ...subject, bindingTemplate: event.target.value })}
        />
        <p className="editor-preview">
          {subject.images.length > 0 ? preview : 'add a photo to see how this reads'}
        </p>
      </label>

      <div className="editor-actions">
        <button type="button" className="mini-button" onClick={onDone}>
          done
        </button>
        <button type="button" className="mini-button danger" onClick={onDelete}>
          delete subject
        </button>
      </div>
    </div>
  )
}
