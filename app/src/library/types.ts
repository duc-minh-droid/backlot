export type SubjectKind = 'person' | 'scene'

export interface SubjectImage {
  /** Stable across reorder and rename. Never the array index. */
  id: string
  /** The name RETURNED by /upload/image -- the server renames on collision. */
  name: string
  subfolder: string
  /** Pixels on disk, from createImageBitmap at upload. Not the encode size. */
  width: number
  height: number
  bytes: number
  addedAt: number
}

export interface Subject {
  id: string
  kind: SubjectKind
  name: string
  /**
   * Goes INTO the prompt. Kept separate from `notes` because a field that silently
   * becomes model input must not look like a private scratchpad.
   */
  description: string
  /** Never sent to the model. */
  notes: string
  images: SubjectImage[]
  /** Which image is offered as image_1 when this subject is the anchor. */
  primaryImageId: string | null
  /** Placeholders: {refs} {name} {description}. Per-kind default, user-editable. */
  bindingTemplate: string
  createdAt: number
  updatedAt: number
}

export interface SubjectsFile {
  /** Inside the payload as well as the key, so a future reader can migrate. */
  version: 1
  subjects: Subject[]
}

/**
 * There is no public evidence that one wording beats another for this model, so the
 * template is editable data rather than a hardcoded string. The shape mirrors the official
 * template's idiom of using <imageN> as inline referring expressions.
 */
export const DEFAULT_BINDING: Record<SubjectKind, string> = {
  person: '{refs} {show} {name}. {description}',
  scene: '{refs} {show} {name}, the setting. {description}',
}

/** The defaults this app shipped before {show} existed, so they can be migrated safely. */
export const LEGACY_BINDINGS = [
  '{refs} show {name}. {description}',
  '{refs} show {name}, the setting. {description}',
]

export const KIND_GUIDANCE: Record<SubjectKind, string> = {
  person:
    'Several angles of the same face, evenly lit, no heavy shadow or sunglasses. Two or three beat one.',
  scene:
    'Wide shots of the same place, consistent time of day. The first one sets the look of the room.',
}

/** An ordered attachment on a run. The index in this list IS the <imageN> number. */
export type Attachment =
  | { kind: 'subject'; subjectId: string; imageId: string }
  | {
      kind: 'adhoc'
      name: string
      subfolder: string
      width: number
      height: number
    }

export type FileCheck = 'unknown' | 'checking' | 'present' | 'missing'

/** A resolved attachment: what the graph and the cost meter both work from. */
export interface ResolvedAttachment {
  key: string
  name: string
  subfolder: string
  width: number
  height: number
  subjectId?: string
  subjectName?: string
  subjectKind?: SubjectKind
  imageId?: string
}
