import { viewUrl, uploadImage } from '../comfy/rest'
import type { ComfyImageRef } from '../comfy/types'
import { DEFAULT_PARAMS, type GenParams } from '../graph/buildGraph'
import { UPLOAD_SUBFOLDER } from './upload'
import type { Subject, SubjectImage, SubjectKind } from './types'

/**
 * Reference photos want to be boring: even light, plain background, sharp focus. The model
 * copies whatever is in the frame, so a dramatic portrait bakes that drama into every later
 * scene. These wrappers steer towards a neutral plate and are kept out of the user's own
 * description so they can be read and edited separately.
 */
const BASE: Record<SubjectKind, string> = {
  person:
    'studio reference photograph of {d}, neutral expression, looking straight at the camera, head and shoulders, plain light grey seamless background, soft even lighting, sharp focus, no props',
  scene:
    'wide establishing photograph of {d}, no people, natural even light, sharp focus, eye level',
}

export const PORTRAIT_SIZE: Record<SubjectKind, { width: number; height: number }> = {
  person: { width: 832, height: 1216 },
  scene: { width: 1344, height: 768 },
}

/** Extra views, generated FROM an accepted photo so they stay the same person. */
export const ANGLES: { key: string; label: string; instruction: string }[] = [
  {
    key: 'three-quarter',
    label: 'three-quarter view',
    instruction: 'turned about 45 degrees to one side, still looking towards the camera',
  },
  { key: 'profile', label: 'profile', instruction: 'in full side profile, looking to the left' },
  {
    key: 'looking-up',
    label: 'chin raised',
    instruction: 'with the chin slightly raised, looking just past the camera',
  },
  {
    key: 'warmer-light',
    label: 'warmer light',
    instruction: 'under warmer, slightly directional light, same neutral background',
  },
]

export const SCENE_ANGLES: { key: string; label: string; instruction: string }[] = [
  { key: 'closer', label: 'closer in', instruction: 'from closer in, same place, same light' },
  { key: 'other-side', label: 'other side', instruction: 'looking from the opposite side of the same place' },
]

export function firstPortraitParams(subject: Subject, seed: number): GenParams {
  const description = subject.description.trim() || subject.name.trim() || 'a person'
  return {
    ...DEFAULT_PARAMS,
    prompt: BASE[subject.kind].replace('{d}', description),
    ...PORTRAIT_SIZE[subject.kind],
    // Fewer steps than a final render: this is a plate, and you may discard several.
    steps: 20,
    seed,
    references: [],
    filenamePrefix: 'subject',
  }
}

/**
 * An additional view of an EXISTING photo. This is the whole point of generating angles
 * rather than re-rolling the description: without the reference attached each generation
 * would invent a different person.
 */
export function anglePortraitParams(
  subject: Subject,
  source: SubjectImage,
  instruction: string,
  seed: number,
): GenParams {
  const subjectWord = subject.kind === 'person' ? 'this person' : 'this place'
  return {
    ...DEFAULT_PARAMS,
    prompt: `<image1> shows ${subjectWord}. The same ${subject.kind === 'person' ? 'person' : 'place'}, ${instruction}. Plain light grey background, soft even lighting, sharp focus.`,
    ...PORTRAIT_SIZE[subject.kind],
    steps: 20,
    seed,
    resolution: 1024,
    references: [
      {
        name: source.name,
        subfolder: source.subfolder,
        width: source.width,
        height: source.height,
      },
    ],
    filenamePrefix: 'subject',
    cacheDevice: 'cpu',
    cacheDtype: 'default',
  }
}

/**
 * A generated image lands in ComfyUI's OUTPUT folder, but references are loaded from the
 * INPUT folder. ComfyUI exposes no server-side copy, so the bytes are fetched back through
 * /view and re-uploaded -- which also means the saved subject points at a file that cannot
 * be swept away by an output-folder cleanup.
 */
export async function adoptOutputImage(
  ref: ComfyImageRef,
  width: number,
  height: number,
  /** Follow-up chains go in their own subfolder so their orphans are sweepable by hand. */
  subfolder: string = UPLOAD_SUBFOLDER,
): Promise<SubjectImage> {
  const response = await fetch(viewUrl(ref))
  if (!response.ok) throw new Error(`could not read ${ref.filename} back from ComfyUI`)
  const blob = await response.blob()
  const file = new File([blob], ref.filename, { type: blob.type || 'image/png' })
  const uploaded = await uploadImage(file, subfolder)

  return {
    id: crypto.randomUUID(),
    name: uploaded.name,
    subfolder: uploaded.subfolder,
    width,
    height,
    bytes: file.size,
    addedAt: Date.now(),
  }
}
