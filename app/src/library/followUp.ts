import type { ComfyImageRef } from '../comfy/types'
import { DEFAULT_PARAMS, type GenParams } from '../graph/buildGraph'
import type { SubjectImage } from './types'

export interface FollowUpPreset {
  key: string
  label: string
  instruction: string
  /**
   * What must not change, enumerated. An abstract "keep everything else identical" gives the
   * model nothing to hold on to, and on an outfit change it flatly contradicts the request --
   * the official edit example names what to preserve too.
   */
  keep: string
  /** Whether re-attaching the subject's own plates is worth offering for this change. */
  offerSubjectRefs?: boolean
  /** Presets that need a word from the user, e.g. which outfit. */
  needsText?: string
}

const KEEP_FRAME = 'Same person, same face, same clothes, same pose, same place, same light.'
const KEEP_PLACE = 'Same person, same face, same clothes, same place, same light, same time of day.'

export const FOLLOW_UPS: FollowUpPreset[] = [
  {
    key: 'closer',
    label: 'closer',
    instruction: 're-frame the same moment closer in, so the subject fills more of the frame',
    keep: KEEP_FRAME,
  },
  {
    key: 'wider',
    label: 'wider',
    instruction: 're-frame the same moment wider, showing more of the surroundings',
    // The newly revealed area is invented, and inventing area next to a person is exactly
    // where a second copy of them shows up.
    keep: 'Same person, same face, same clothes, same light. Do not add any other people.',
    offerSubjectRefs: true,
  },
  {
    key: 'left',
    label: 'from the left',
    instruction: 'show the same moment from a camera position about 45 degrees to the left',
    keep: KEEP_PLACE,
  },
  {
    key: 'right',
    label: 'from the right',
    instruction: 'show the same moment from a camera position about 45 degrees to the right',
    keep: KEEP_PLACE,
  },
  {
    key: 'lower',
    label: 'from lower down',
    instruction: 'show the same moment from a lower camera position, looking up',
    keep: KEEP_PLACE,
  },
  {
    key: 'outfit',
    label: 'change the outfit',
    instruction: 'change only the clothing to {text}',
    keep: 'Same person, same face, same pose, same framing, same place, same light.',
    needsText: 'what should they wear?',
    offerSubjectRefs: true,
  },
  {
    key: 'night',
    label: 'make it night',
    instruction:
      'change the time of day to night, lit only by the light sources already visible in the scene',
    // Without the "already visible" clause the model invents a moon and re-lights the face,
    // which reads as a different person.
    keep: 'Same person, same face, same clothes, same pose, same framing, same place.',
  },
]

export const FREE_TEXT_KEEP = KEEP_FRAME

export function followUpPrompt(instruction: string, keep: string): string {
  return `In <image1>, ${instruction}. ${keep}`
}

/**
 * The previous result becomes the only reference by default.
 *
 * `resolution` is set so that referenceTargetSize() returns the source's own dimensions and the
 * image is never resampled on the way in. Today that happens to hold because every aspect preset
 * is about a megapixel and the budget is 1024; this pins it instead of relying on the
 * coincidence.
 */
export function followUpParams(
  source: SubjectImage,
  prompt: string,
  seed: number,
  extraReferences: SubjectImage[] = [],
): GenParams {
  const references = [source, ...extraReferences].map((image) => ({
    name: image.name,
    subfolder: image.subfolder,
    width: image.width,
    height: image.height,
  }))

  return {
    ...DEFAULT_PARAMS,
    prompt,
    // The edit keeps the source's shape, so the aspect-drift warning can never fire on it.
    width: source.width,
    height: source.height,
    resolution: Math.round(Math.sqrt(source.width * source.height)),
    seed,
    references,
    filenamePrefix: 'qwen',
    cacheDevice: 'cpu',
    cacheDtype: 'default',
  }
}

export interface ChainLink {
  ref: ComfyImageRef
  width: number
  height: number
}

export const CHAIN_WARNING =
  'Each follow-up is a full re-generation, not an edit of the pixels: the previous image goes back through the VAE and the model paints a new one. Small changes accumulate — after three or four in a row the face has usually moved.'
