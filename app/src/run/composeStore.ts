import { create } from 'zustand'
import { DEFAULT_PARAMS, type GenParams } from '../graph/buildGraph'
import { DEFAULT_SHOT, type Shot } from '../library/composeShot'
import type { ChainLink } from '../library/followUp'
import type { Attachment, Subject, ResolvedAttachment } from '../library/types'

const PARAMS_KEY = 'qwen.params.v1'
const ATTACH_KEY = 'qwen.attachments.v1'
const VIEW_KEY = 'qwen.view.v1'
// The shot lives under its own key, saved together with the mode. If the prompt came back on
// reload while the chips reset to defaults, the first chip touch would silently rewrite text
// the user thought was theirs.
const SHOT_KEY = 'qwen.shot.v1'

export type AppView = 'generate' | 'library'
export type PromptMode = 'guided' | 'text'

interface StoredShot {
  shot: Shot
  promptMode: PromptMode
}

/** Params the user actually authors. References are derived from `attachments`. */
type StoredParams = Omit<GenParams, 'references'>

function readParams(): StoredParams {
  try {
    const raw = localStorage.getItem(PARAMS_KEY)
    if (!raw) return DEFAULT_PARAMS
    // Spread over the defaults so a param added in a later version is never undefined.
    return { ...DEFAULT_PARAMS, ...(JSON.parse(raw) as Partial<StoredParams>) }
  } catch {
    return DEFAULT_PARAMS
  }
}

/**
 * Attachments are persisted alongside the prompt. They have to be: the prompt text holds
 * <imageN> labels, so a prompt that survives a reload while its attachments do not leaves
 * every label dangling.
 */
function readAttachments(): Attachment[] {
  try {
    const raw = localStorage.getItem(ATTACH_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Attachment[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function readShot(): StoredShot {
  try {
    const raw = localStorage.getItem(SHOT_KEY)
    if (!raw) return { shot: DEFAULT_SHOT, promptMode: 'guided' }
    const parsed = JSON.parse(raw) as Partial<StoredShot>
    return {
      shot: { ...DEFAULT_SHOT, ...(parsed.shot ?? {}) },
      promptMode: parsed.promptMode === 'text' ? 'text' : 'guided',
    }
  } catch {
    return { shot: DEFAULT_SHOT, promptMode: 'guided' }
  }
}

function readView(): AppView {
  try {
    return localStorage.getItem(VIEW_KEY) === 'library' ? 'library' : 'generate'
  } catch {
    return 'generate'
  }
}

function persist(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value))
  } catch {
    /* blocked storage: the app works, it just forgets */
  }
}

// The state updates on every keystroke; the write to disk does not need to.
const timers = new Map<string, number>()
function persistSoon(key: string, value: unknown, delay = 400): void {
  const pending = timers.get(key)
  if (pending !== undefined) clearTimeout(pending)
  timers.set(
    key,
    window.setTimeout(() => {
      timers.delete(key)
      persist(key, value)
    }, delay),
  )
}

interface ComposeStore {
  params: StoredParams
  attachments: Attachment[]
  view: AppView
  shot: Shot
  promptMode: PromptMode
  /** The finished image a follow-up would act on, and how deep the chain already is. */
  lastResult: (ChainLink & { chainDepth: number; origin: ChainLink | null }) | null
  setShot: (patch: Partial<Shot>) => void
  setPromptMode: (mode: PromptMode) => void
  setLastResult: (result: (ChainLink & { chainDepth: number; origin: ChainLink | null }) | null) => void
  setParams: (patch: Partial<StoredParams>) => void
  setAttachments: (attachments: Attachment[]) => void
  attach: (attachments: Attachment[]) => void
  detach: (index: number) => void
  move: (from: number, to: number) => void
  setView: (view: AppView) => void
}

/**
 * Lives outside React so switching to the Library tab cannot lose a half-written prompt,
 * and so the 250ms run tick does not re-render the textarea.
 */
export const useComposeStore = create<ComposeStore>((set, get) => ({
  params: readParams(),
  attachments: readAttachments(),
  view: readView(),
  shot: readShot().shot,
  promptMode: readShot().promptMode,
  lastResult: null,

  setShot: (patch) => {
    const shot = { ...get().shot, ...patch }
    set({ shot })
    persistSoon(SHOT_KEY, { shot, promptMode: get().promptMode })
  },

  setPromptMode: (promptMode) => {
    set({ promptMode })
    persist(SHOT_KEY, { shot: get().shot, promptMode })
  },

  setLastResult: (lastResult) => set({ lastResult }),

  setParams: (patch) => {
    const params = { ...get().params, ...patch }
    set({ params })
    persistSoon(PARAMS_KEY, params)
  },

  setAttachments: (attachments) => {
    set({ attachments })
    persist(ATTACH_KEY, attachments)
  },

  attach: (added) => get().setAttachments([...get().attachments, ...added]),

  detach: (index) => get().setAttachments(get().attachments.filter((_, i) => i !== index)),

  move: (from, to) => {
    const attachments = [...get().attachments]
    const [moved] = attachments.splice(from, 1)
    if (!moved) return
    attachments.splice(to, 0, moved)
    get().setAttachments(attachments)
  },

  setView: (view) => {
    set({ view })
    persist(VIEW_KEY, view)
  },
}))

/**
 * Turns the ordered attachment list into everything downstream needs. The index in this
 * array is the <imageN> number and the images.image_N key -- one ordering, no derivation.
 */
export function resolveAttachments(
  attachments: Attachment[],
  subjects: Subject[],
): ResolvedAttachment[] {
  const resolved: ResolvedAttachment[] = []

  attachments.forEach((attachment, index) => {
    if (attachment.kind === 'adhoc') {
      resolved.push({
        key: `adhoc:${attachment.subfolder}/${attachment.name}:${index}`,
        name: attachment.name,
        subfolder: attachment.subfolder,
        width: attachment.width,
        height: attachment.height,
      })
      return
    }

    const subject = subjects.find((s) => s.id === attachment.subjectId)
    const image = subject?.images.find((i) => i.id === attachment.imageId)
    // A subject or image deleted from the library while still attached: skip it rather
    // than emit a gap, because the encoder renumbers around gaps.
    if (!subject || !image) return

    resolved.push({
      key: `subject:${subject.id}:${image.id}`,
      name: image.name,
      subfolder: image.subfolder,
      width: image.width,
      height: image.height,
      subjectId: subject.id,
      subjectName: subject.name,
      subjectKind: subject.kind,
      imageId: image.id,
    })
  })

  return resolved
}
