import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { imageExists, viewUrl } from '../comfy/rest'
import { newSubject, type SubjectLibrary } from '../library/useSubjectLibrary'
import type { FileCheck, Subject, SubjectKind } from '../library/types'
import { useComposeStore } from '../run/composeStore'
import { panelVariants } from '../motion/variants'
import { SubjectEditor } from './SubjectEditor'

interface Props {
  library: SubjectLibrary
  hidden?: boolean
}

export function LibraryView({ library, hidden = false }: Props) {
  const [editing, setEditing] = useState<Subject | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Subject | null>(null)
  const [checks, setChecks] = useState<Record<string, FileCheck>>({})

  const attach = useComposeStore((state) => state.attach)
  const setView = useComposeStore((state) => state.setView)

  // Verify every referenced file still exists. The bytes live in ComfyUI's input folder,
  // which this app does not own -- they can vanish between sessions.
  useEffect(() => {
    let cancelled = false
    const all = library.subjects.flatMap((subject) => subject.images)
    if (all.length === 0) return

    setChecks((current) => {
      const next = { ...current }
      for (const image of all) next[image.id] = next[image.id] ?? 'checking'
      return next
    })

    void (async () => {
      for (const image of all) {
        const ok = await imageExists(image.name, image.subfolder)
        if (cancelled) return
        setChecks((current) => ({ ...current, [image.id]: ok ? 'present' : 'missing' }))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [library.subjects])

  const create = (kind: SubjectKind) => setEditing(newSubject(kind))

  const save = (subject: Subject) => {
    library.save(subject)
    setEditing(subject)
  }

  const missingFor = useMemo(() => {
    const map: Record<string, number> = {}
    for (const subject of library.subjects) {
      map[subject.id] = subject.images.filter((image) => checks[image.id] === 'missing').length
    }
    return map
  }, [library.subjects, checks])

  return (
    <main className="library" hidden={hidden}>
      <header className="library-head">
        <div>
          <h1 className="library-title">Library</h1>
          <p className="library-sub">
            Saved people and scenes. Attach one to a generation and the same face or the same
            place comes back — at whatever angle and size you ask for.
          </p>
        </div>
        <div className="library-actions">
          <button type="button" className="mini-button" onClick={() => create('person')}>
            new person
          </button>
          <button type="button" className="mini-button" onClick={() => create('scene')}>
            new scene
          </button>
        </div>
      </header>

      {library.subjects.length === 0 && !editing && (
        <p className="library-empty">
          Nothing saved yet. A person needs two or three photos of the same face at different
          angles; a scene needs wide shots of the same place. The photos are uploaded to
          ComfyUI&apos;s input folder and stay there, so a subject keeps working across sessions.
        </p>
      )}

      <div className="subject-grid">
        {library.subjects.map((subject) => {
          const missing = missingFor[subject.id] ?? 0
          const primary =
            subject.images.find((image) => image.id === subject.primaryImageId) ?? subject.images[0]
          return (
            <article key={subject.id} className={`subject-card ${missing ? 'subject-broken' : ''}`}>
              <div className="subject-thumb">
                {primary ? (
                  <img
                    src={viewUrl({ filename: primary.name, subfolder: primary.subfolder, type: 'input' })}
                    alt={subject.name}
                  />
                ) : (
                  <span className="unit">no photos</span>
                )}
              </div>
              <div className="subject-body">
                <strong>{subject.name || 'untitled'}</strong>
                <span className="unit">
                  {subject.kind} · {subject.images.length} photo{subject.images.length === 1 ? '' : 's'}
                </span>
                {missing > 0 && (
                  <span className="subject-warn">
                    {missing} file{missing === 1 ? '' : 's'} missing from ComfyUI&apos;s input folder
                  </span>
                )}
                <div className="subject-card-actions">
                  <button type="button" className="mini-button" onClick={() => setEditing(subject)}>
                    edit
                  </button>
                  <button
                    type="button"
                    className="mini-button"
                    disabled={subject.images.length === 0 || missing > 0}
                    onClick={() => {
                      attach(
                        subject.images.map((image) => ({
                          kind: 'subject' as const,
                          subjectId: subject.id,
                          imageId: image.id,
                        })),
                      )
                      setView('generate')
                    }}
                  >
                    attach &amp; generate
                  </button>
                </div>
              </div>
            </article>
          )
        })}
      </div>

      <AnimatePresence>
        {editing && (
          <motion.section
            className="editor-panel"
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <SubjectEditor
              subject={editing}
              onChange={save}
              onDone={() => setEditing(null)}
              onDelete={() => {
                setConfirmDelete(editing)
                setEditing(null)
              }}
            />
          </motion.section>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmDelete && (
          <motion.section
            className="status status-warn"
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <strong>Remove {confirmDelete.name || 'this subject'}?</strong>
            <p>
              This deletes the app&apos;s record. The {confirmDelete.images.length} image file
              {confirmDelete.images.length === 1 ? '' : 's'} stay in{' '}
              <code>ComfyUI\input\qwen-app</code> — ComfyUI exposes no way to delete them, so
              remove them by hand if you want the space back:
            </p>
            <pre className="traceback">
              {confirmDelete.images.map((image) => `${image.subfolder}/${image.name}`).join('\n')}
            </pre>
            <div className="editor-actions">
              <button
                type="button"
                className="mini-button danger"
                onClick={() => {
                  library.remove(confirmDelete.id)
                  setConfirmDelete(null)
                }}
              >
                remove record
              </button>
              <button type="button" className="mini-button" onClick={() => setConfirmDelete(null)}>
                keep it
              </button>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </main>
  )
}
