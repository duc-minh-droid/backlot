import { bindingClauses } from './composePrompt'
import type { ResolvedAttachment, Subject } from './types'
import {
  CAMERA_ANGLES,
  EXPRESSIONS,
  FACING,
  GAZES,
  LENSES,
  LOOKS,
  SHOT_SIZES,
  optionFragment,
} from './vocab'

export interface Shot {
  /** Present participle: "leaning against a wall". The field label says so. */
  action: string
  /** Prepositional phrase: "on a narrow street at night". */
  setting: string
  wardrobe: string
  expression: string
  gaze: string
  facing: string
  shotSize: string
  /** Camera height only. */
  angle: string
  lens: string
  look: string
  /** Emits an explicit "only person in the frame" sentence. Visible chip, on by default. */
  solo: boolean
  aspect: string
}

export const DEFAULT_SHOT: Shot = {
  action: '',
  setting: '',
  wardrobe: '',
  expression: '',
  gaze: '',
  facing: '',
  shotSize: '',
  angle: '',
  lens: '',
  look: '',
  solo: true,
  aspect: '1-1',
}

/** "Ana", "Ana and Ben", "Ana, Ben and Cara" — in attachment order, each named once. */
function subjectNames(attachments: ResolvedAttachment[]): string[] {
  const names: string[] = []
  for (const attachment of attachments) {
    if (attachment.subjectKind !== 'person') continue
    const name = attachment.subjectName?.trim()
    if (name && !names.includes(name)) names.push(name)
  }
  return names
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

/** Joins the parts that are present, so an unanswered question leaves no stray punctuation. */
function sentence(parts: (string | undefined | null)[]): string {
  const kept = parts.map((part) => part?.trim()).filter((part): part is string => !!part)
  if (kept.length === 0) return ''
  return `${kept.join(', ')}.`
}

export interface ComposeResult {
  prompt: string
  /** True when there are no attached people, so the action field must carry the subject noun. */
  needsSubjectNoun: boolean
}

/**
 * Builds the prompt from the answered questions.
 *
 * Three things here are load-bearing and were arrived at from how this model actually reads:
 *
 *  - the binding clauses come first, because they must sit next to the auto-prepended
 *    <imageN> labels -- that adjacency is the only thing binding a name to a photo;
 *  - the style leads the scene sentence rather than trailing it, because Qwen3-VL is causal:
 *    a token at the end is encoded having seen everything, but nothing before it has seen IT;
 *  - every slot drops together with its comma, so an unanswered question is invisible rather
 *    than leaving "Ana is walking, , smiling".
 */
export function composeShot(
  shot: Shot,
  attachments: ResolvedAttachment[],
  subjects: Subject[],
): ComposeResult {
  const names = subjectNames(attachments)
  const subjectPhrase = joinNames(names)
  const plural = names.length > 1
  const hasPeople = names.length > 0

  const blocks: string[] = []

  const bindings = bindingClauses(attachments, subjects)
  if (bindings.length > 0) blocks.push(bindings.join(' '))

  const look = optionFragment(LOOKS, shot.look)
  const action = shot.action.trim()

  // With no named person the user's own words carry the subject, so we never synthesise one.
  const opening = hasPeople
    ? [subjectPhrase, plural ? 'are' : 'is', action].filter(Boolean).join(' ')
    : action

  const scene = sentence([
    opening,
    shot.setting.trim(),
    shot.wardrobe.trim() ? `wearing ${shot.wardrobe.trim()}` : '',
    optionFragment(EXPRESSIONS, shot.expression),
    optionFragment(GAZES, shot.gaze),
  ])

  if (scene) blocks.push(look ? `${look}: ${scene}` : scene)
  else if (look) blocks.push(`${look}.`)

  // A named, exclusive construction. "a single person" would itself be an indefinite noun the
  // model can instantiate, which is the opposite of what is wanted.
  if (shot.solo && hasPeople) {
    blocks.push(`${subjectPhrase} ${plural ? 'are' : 'is'} the only ${plural ? 'people' : 'person'} in the frame.`)
  }

  const camera = sentence([
    optionFragment(SHOT_SIZES, shot.shotSize) ? `Framed ${optionFragment(SHOT_SIZES, shot.shotSize)}` : '',
    optionFragment(CAMERA_ANGLES, shot.angle),
    optionFragment(FACING, shot.facing),
    optionFragment(LENSES, shot.lens),
  ])
  if (camera) blocks.push(camera)

  return {
    prompt: blocks.join('\n\n'),
    needsSubjectNoun: !hasPeople,
  }
}
