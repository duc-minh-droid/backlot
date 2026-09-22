import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_BINDING, type Subject, type SubjectImage, type SubjectKind, type SubjectsFile } from './types'

const KEY = 'qwen.subjects.v1'

function read(): Subject[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SubjectsFile
    if (parsed.version !== 1 || !Array.isArray(parsed.subjects)) return []
    return parsed.subjects
  } catch {
    // Blocked or corrupt storage: the app still works, the library is just empty.
    return []
  }
}

function write(subjects: Subject[]): void {
  try {
    const payload: SubjectsFile = { version: 1, subjects }
    localStorage.setItem(KEY, JSON.stringify(payload))
  } catch {
    /* private mode or quota: saving is best-effort */
  }
}

export function newSubject(kind: SubjectKind): Subject {
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    kind,
    name: '',
    description: '',
    notes: '',
    images: [],
    primaryImageId: null,
    bindingTemplate: DEFAULT_BINDING[kind],
    createdAt: now,
    updatedAt: now,
  }
}

export interface SubjectLibrary {
  subjects: Subject[]
  get: (id: string) => Subject | undefined
  save: (subject: Subject) => void
  remove: (id: string) => void
  addImages: (id: string, images: SubjectImage[]) => void
  removeImage: (id: string, imageId: string) => void
  setPrimary: (id: string, imageId: string) => void
}

/**
 * The library is pointers only. The image bytes live in ComfyUI's input/qwen-app directory
 * and persist there independently -- that is what makes a saved subject re-attachable
 * across sessions, and also why deleting a subject cannot delete its files.
 */
export function useSubjectLibrary(): SubjectLibrary {
  const [subjects, setSubjects] = useState<Subject[]>(read)

  useEffect(() => {
    // Keep two tabs of the app in step.
    const onStorage = (event: StorageEvent) => {
      if (event.key === KEY) setSubjects(read())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const commit = useCallback((next: Subject[]) => {
    setSubjects(next)
    write(next)
  }, [])

  const get = useCallback((id: string) => subjects.find((s) => s.id === id), [subjects])

  const save = useCallback(
    (subject: Subject) => {
      const stamped = { ...subject, updatedAt: Date.now() }
      const exists = subjects.some((s) => s.id === subject.id)
      commit(exists ? subjects.map((s) => (s.id === subject.id ? stamped : s)) : [...subjects, stamped])
    },
    [subjects, commit],
  )

  const remove = useCallback(
    (id: string) => commit(subjects.filter((s) => s.id !== id)),
    [subjects, commit],
  )

  const addImages = useCallback(
    (id: string, images: SubjectImage[]) => {
      commit(
        subjects.map((s) =>
          s.id === id
            ? {
                ...s,
                images: [...s.images, ...images],
                primaryImageId: s.primaryImageId ?? images[0]?.id ?? null,
                updatedAt: Date.now(),
              }
            : s,
        ),
      )
    },
    [subjects, commit],
  )

  const removeImage = useCallback(
    (id: string, imageId: string) => {
      commit(
        subjects.map((s) => {
          if (s.id !== id) return s
          const images = s.images.filter((image) => image.id !== imageId)
          return {
            ...s,
            images,
            primaryImageId: s.primaryImageId === imageId ? (images[0]?.id ?? null) : s.primaryImageId,
            updatedAt: Date.now(),
          }
        }),
      )
    },
    [subjects, commit],
  )

  const setPrimary = useCallback(
    (id: string, imageId: string) => {
      commit(
        subjects.map((s) => (s.id === id ? { ...s, primaryImageId: imageId, updatedAt: Date.now() } : s)),
      )
    },
    [subjects, commit],
  )

  return { subjects, get, save, remove, addImages, removeImage, setPrimary }
}
