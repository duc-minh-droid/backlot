import { MAX_REFERENCES } from '../graph/buildGraph'
import { DEFAULT_BINDING, LEGACY_BINDINGS } from './types'
import type { ResolvedAttachment, Subject } from './types'

export type CompositionProblem =
  | { kind: 'im_start_prefix' }
  | { kind: 'dangling_label'; label: string; max: number }
  | { kind: 'ambiguous_name'; name: string }
  | { kind: 'name_substring'; outer: string; inner: string }
  | { kind: 'too_many'; count: number; max: number }
  | { kind: 'missing_file'; index: number; name: string }
  | { kind: 'unbound_name'; name: string }

/** `<image3>, <image4> and <image5>` */
export function refsPhrase(indices: number[]): string {
  const labels = indices.map((index) => `<image${index + 1}>`)
  if (labels.length === 0) return ''
  if (labels.length === 1) return labels[0]!
  return `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`
}

/**
 * The binding clause the app inserts into the prompt box as real, editable text.
 *
 * The user writes names; the app writes indices. Reordering regenerates these clauses and
 * the user's own sentence never has to change.
 */
export function bindingClause(subject: Subject, indices: number[]): string {
  // Subjects saved before {show} existed carry the old default verbatim. Replacing this app's
  // own previous default is not rewriting the user's words; a template they edited is left be.
  const template = LEGACY_BINDINGS.includes(subject.bindingTemplate)
    ? DEFAULT_BINDING[subject.kind]
    : subject.bindingTemplate

  return template
    .replaceAll('{show}', indices.length === 1 ? 'shows' : 'show')
    .replaceAll('{refs}', refsPhrase(indices))
    .replaceAll('{name}', subject.name || 'this subject')
    .replaceAll('{description}', subject.description)
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,])/g, '$1')
    .trim()
}

/** Every binding clause for the current attachment order, in order. */
export function bindingClauses(attachments: ResolvedAttachment[], subjects: Subject[]): string[] {
  const bySubject = new Map<string, number[]>()
  attachments.forEach((attachment, index) => {
    if (!attachment.subjectId) return
    const list = bySubject.get(attachment.subjectId) ?? []
    list.push(index)
    bySubject.set(attachment.subjectId, list)
  })

  const clauses: string[] = []
  for (const [subjectId, indices] of bySubject) {
    const subject = subjects.find((s) => s.id === subjectId)
    if (subject) clauses.push(bindingClause(subject, indices))
  }
  return clauses
}

const LABEL_RE = /<image(\d+)>/g

export function lintPrompt(
  prompt: string,
  attachments: ResolvedAttachment[],
  missing: Set<string>,
  /** Every subject in the library, so a name in the text with no photo attached is catchable. */
  allSubjects: Subject[] = [],
): CompositionProblem[] {
  const problems: CompositionProblem[] = []

  // qwen3vl.py:167 -- a prompt starting with <|im_start|> skips the chat template, which
  // means every auto-prepended vision block disappears and ALL references are dropped.
  // Silent and total, so it is an error rather than a warning.
  if (prompt.trimStart().startsWith('<|im_start|>')) problems.push({ kind: 'im_start_prefix' })

  if (attachments.length > MAX_REFERENCES) {
    problems.push({ kind: 'too_many', count: attachments.length, max: MAX_REFERENCES })
  }

  for (const match of prompt.matchAll(LABEL_RE)) {
    const n = Number(match[1])
    if (n < 1 || n > attachments.length) {
      problems.push({ kind: 'dangling_label', label: match[0], max: attachments.length })
    }
  }

  // Two attached subjects sharing a name make the coreference ambiguous; one name inside
  // another ("Ana" in "Anastasia") is a genuine hazard for a BPE model.
  const names = [...new Set(attachments.map((a) => a.subjectName).filter((n): n is string => !!n))]
  const counts = new Map<string, number>()
  for (const attachment of attachments) {
    if (!attachment.subjectId || !attachment.subjectName) continue
    counts.set(attachment.subjectName, (counts.get(attachment.subjectName) ?? 0) + 1)
  }
  const subjectIds = new Map<string, Set<string>>()
  for (const attachment of attachments) {
    if (!attachment.subjectId || !attachment.subjectName) continue
    const set = subjectIds.get(attachment.subjectName) ?? new Set()
    set.add(attachment.subjectId)
    subjectIds.set(attachment.subjectName, set)
  }
  for (const [name, ids] of subjectIds) {
    if (ids.size > 1) problems.push({ kind: 'ambiguous_name', name })
  }
  for (const outer of names) {
    for (const inner of names) {
      if (outer !== inner && outer.includes(inner)) {
        problems.push({ kind: 'name_substring', outer, inner })
      }
    }
  }

  attachments.forEach((attachment, index) => {
    if (missing.has(attachment.key)) {
      problems.push({ kind: 'missing_file', index, name: attachment.name })
    }
  })

  // Guided mode makes this easy to hit: detach someone while the chips still name them and the
  // prompt asks for a character the model has no photo of. Nothing else catches it.
  const attachedIds = new Set(attachments.map((a) => a.subjectId).filter(Boolean))
  for (const subject of allSubjects) {
    const name = subject.name.trim()
    if (!name || attachedIds.has(subject.id)) continue
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(prompt)) {
      problems.push({ kind: 'unbound_name', name })
    }
  }

  return problems
}

export function describeProblem(problem: CompositionProblem): string {
  switch (problem.kind) {
    case 'im_start_prefix':
      return 'A prompt starting with <|im_start|> makes ComfyUI skip its chat template, which silently drops every reference image. Remove it or the subjects will be ignored.'
    case 'dangling_label':
      return `${problem.label} refers to an image that is not attached (there ${problem.max === 1 ? 'is' : 'are'} ${problem.max}).`
    case 'ambiguous_name':
      return `Two different subjects called "${problem.name}" are attached. Rename one of them in the Library.`
    case 'name_substring':
      return `"${problem.inner}" is contained in "${problem.outer}", so a sentence mentioning it may bind to the wrong subject.`
    case 'too_many':
      return `${problem.count} images attached, the graph allows ${problem.max}. Remove ${problem.count - problem.max}.`
    case 'missing_file':
      return `image_${problem.index + 1} (${problem.name}) is no longer in ComfyUI's input folder.`
    case 'unbound_name':
      return `The prompt names "${problem.name}" but none of their photos are attached, so the model has nothing to go on for them.`
  }
}

export function isBlocking(problem: CompositionProblem): boolean {
  return (
    problem.kind === 'im_start_prefix' ||
    problem.kind === 'too_many' ||
    problem.kind === 'missing_file' ||
    problem.kind === 'dangling_label' ||
    problem.kind === 'ambiguous_name'
  )
}
