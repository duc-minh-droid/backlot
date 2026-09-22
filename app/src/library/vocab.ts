import { ANGLES } from './portrait'

export interface Option {
  key: string
  label: string
  /** Words added to the prompt. Empty means this question contributes nothing. */
  fragment: string
  /** Shown under the chip row when this option is picked. */
  note?: string
}

/** Every question starts unanswered, and an unanswered question adds no words. */
const NONE: Option = { key: '', label: 'unspecified', fragment: '' }

/**
 * Fragments carry the CONSEQUENCE rather than the jargon. Millimetres mean nothing to this
 * model beyond caption correlation, so "85mm" alone is indistinguishable from "50mm" --
 * "the background compressed and softly out of focus" is the part that does work.
 */
export const SHOT_SIZES: Option[] = [
  NONE,
  { key: 'close-up', label: 'close-up', fragment: 'in close-up, the face filling the frame' },
  { key: 'head-shoulders', label: 'head & shoulders', fragment: 'as a head-and-shoulders portrait' },
  { key: 'waist-up', label: 'waist-up', fragment: 'from the waist up' },
  {
    key: 'full-body',
    label: 'full body',
    fragment: 'head to toe, the whole body in frame',
    note: 'Reference plates are head-and-shoulders, so the body is invented here.',
  },
  {
    key: 'wide',
    label: 'wide shot',
    fragment: 'as a wide shot, the figure small in a large space',
    note: 'The widest shots are where a second copy of the subject tends to appear. Keep "only one" on.',
  },
]

/** Camera HEIGHT only. Subject rotation is a separate question -- see FACING. */
export const CAMERA_ANGLES: Option[] = [
  NONE,
  { key: 'eye-level', label: 'eye level', fragment: 'seen from eye level' },
  {
    key: 'low',
    label: 'low angle',
    fragment: 'seen from a low angle, the camera below the eye line looking up',
  },
  {
    key: 'high',
    label: 'high angle',
    fragment: 'seen from a high angle, the camera above looking down',
  },
  { key: 'overhead', label: 'overhead', fragment: 'seen from directly overhead, looking straight down' },
]

/**
 * Which way the subject is turned. Reuses the Library's ANGLES verbatim so "three-quarter"
 * means the same thing in both places -- it is subject rotation, never camera position.
 */
export const FACING: Option[] = [
  NONE,
  ...ANGLES.map((angle) => ({ key: angle.key, label: angle.label, fragment: angle.instruction })),
]

export const LENSES: Option[] = [
  NONE,
  {
    key: '24',
    label: '24mm wide',
    fragment: 'as if shot on a 24mm wide lens, with visible wide-angle perspective and a deep, sharp background',
    note: 'A 24mm close-up distorts the face. That is correct, and surprising.',
  },
  {
    key: '35',
    label: '35mm',
    fragment: 'as if shot on a 35mm lens, natural perspective with the surroundings clearly visible',
  },
  { key: '50', label: '50mm', fragment: 'as if shot on a 50mm lens, perspective close to the human eye' },
  {
    key: '85',
    label: '85mm portrait',
    fragment: 'as if shot on an 85mm portrait lens, the background compressed and softly out of focus',
    note: 'This blurs the setting you described.',
  },
  {
    key: '135',
    label: '135mm tele',
    fragment: 'as if shot on a 135mm telephoto lens, the background strongly compressed and blurred',
    note: 'This blurs the setting you described.',
  },
]

/** Leads the scene sentence: the encoder is causal, so a trailing style reaches nothing. */
export const LOOKS: Option[] = [
  NONE,
  { key: 'photographic', label: 'photographic', fragment: 'A natural-light photograph, true colour, no stylisation' },
  {
    key: 'cinematic',
    label: 'cinematic',
    fragment: 'A cinematic film still, widescreen colour grade, directional key light, deep shadows',
  },
  {
    key: 'documentary',
    label: 'documentary',
    fragment: 'A documentary photograph, available light, unposed, slight grain',
  },
  {
    key: 'editorial',
    label: 'editorial',
    fragment: 'An editorial magazine photograph, controlled studio-quality light, clean colour',
  },
  {
    key: 'film',
    label: '35mm film',
    fragment: 'A 35mm film photograph, visible grain, halation in the highlights, slightly warm colour',
  },
]

export const EXPRESSIONS: Option[] = [
  NONE,
  { key: 'neutral', label: 'neutral', fragment: 'with a neutral expression' },
  { key: 'faint-smile', label: 'faint smile', fragment: 'with a faint, closed-mouth smile' },
  { key: 'smiling', label: 'smiling', fragment: 'smiling openly' },
  {
    key: 'laughing',
    label: 'laughing',
    fragment: 'laughing',
    note: 'Reference plates are deliberately neutral, so a big expression is where identity drifts most.',
  },
  { key: 'serious', label: 'serious', fragment: 'with a serious, level expression' },
  { key: 'thoughtful', label: 'thoughtful', fragment: 'looking thoughtful, eyes slightly downcast' },
]

/**
 * The reference plates bake in "looking straight at the camera", so without this question the
 * eyeline is inherited from the photo and the user has no control over it.
 */
export const GAZES: Option[] = [
  NONE,
  { key: 'camera', label: 'at the camera', fragment: 'looking straight at the camera' },
  { key: 'away', label: 'away', fragment: 'looking away from the camera' },
  { key: 'down', label: 'down', fragment: 'looking down' },
  { key: 'off-frame', label: 'off-frame', fragment: 'looking at something outside the frame' },
]

export interface AspectOption {
  key: string
  label: string
  width: number
  height: number
}

/**
 * All multiples of 32 and all about one megapixel, so the choice is cost-neutral: the spread
 * across the whole set is 3920-4096 latent tokens, about 4%. Two are not their nominal ratio
 * on a 32-pixel grid and are labelled with what they actually are rather than rounded quietly.
 */
export const ASPECTS: AspectOption[] = [
  { key: '1-1', label: '1:1', width: 1024, height: 1024 },
  { key: '4-5', label: '4:5', width: 896, height: 1120 },
  { key: '2-3', label: '2:3', width: 832, height: 1248 },
  { key: '3-2', label: '3:2', width: 1248, height: 832 },
  { key: '16-9', label: '16:9*', width: 1344, height: 768 },
  { key: '9-16', label: '9:16*', width: 768, height: 1344 },
]

export const ASPECT_FOOTNOTE =
  '* 1344×768 is 7:4 and 768×1344 is 4:7 — the nearest 32-pixel grid to 16:9. Exact 16:9 would be 1536×864, a third more pixels.'

export function optionFragment(options: Option[], key: string): string {
  return options.find((option) => option.key === key)?.fragment ?? ''
}

export function optionNote(options: Option[], key: string): string | undefined {
  return options.find((option) => option.key === key)?.note
}

export function aspectFor(key: string): AspectOption {
  return ASPECTS.find((aspect) => aspect.key === key) ?? ASPECTS[0]!
}
