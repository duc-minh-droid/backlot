import type { Shot } from '../library/composeShot'
import type { ResolvedAttachment } from '../library/types'
import {
  ASPECTS,
  ASPECT_FOOTNOTE,
  CAMERA_ANGLES,
  EXPRESSIONS,
  FACING,
  GAZES,
  LENSES,
  LOOKS,
  SHOT_SIZES,
} from '../library/vocab'
import { ChipRow } from './ChipRow'

interface Props {
  shot: Shot
  onChange: (patch: Partial<Shot>) => void
  attachments: ResolvedAttachment[]
  needsSubjectNoun: boolean
  disabled: boolean
}

export function ShotForm({ shot, onChange, attachments, needsSubjectNoun, disabled }: Props) {
  const people = attachments.filter((attachment) => attachment.subjectKind === 'person')
  const hasPeople = people.length > 0
  // Expression and gaze are about a face. With only scenes attached there is no face to aim at.
  const noFace = hasPeople ? undefined : 'Attach a person to answer this.'

  return (
    <div className="shotform">
      <label className="field">
        <span className="label-xs">
          {needsSubjectNoun ? 'what is in the shot' : "what they're doing"}{' '}
          <span className="unit">{needsSubjectNoun ? 'a subject and what it is doing' : 'ending in -ing'}</span>
        </span>
        <input
          value={shot.action}
          disabled={disabled}
          placeholder={needsSubjectNoun ? 'a red umbrella lying on wet sand' : 'repairing a fishing net'}
          onChange={(event) => onChange({ action: event.target.value })}
        />
      </label>

      <label className="field">
        <span className="label-xs">
          where <span className="unit">a phrase starting with on / in / at</span>
        </span>
        <input
          value={shot.setting}
          disabled={disabled}
          placeholder="on a harbour wall at dawn"
          onChange={(event) => onChange({ setting: event.target.value })}
        />
      </label>

      <ChipRow
        label="shot size"
        options={SHOT_SIZES}
        value={shot.shotSize}
        onChange={(shotSize) => onChange({ shotSize })}
        disabled={disabled}
      />
      <ChipRow
        label="camera height"
        options={CAMERA_ANGLES}
        value={shot.angle}
        onChange={(angle) => onChange({ angle })}
        disabled={disabled}
      />
      <ChipRow
        label="which way they face"
        options={FACING}
        value={shot.facing}
        onChange={(facing) => onChange({ facing })}
        disabled={disabled}
        unavailable={noFace}
      />
      <ChipRow
        label="lens"
        options={LENSES}
        value={shot.lens}
        onChange={(lens) => onChange({ lens })}
        disabled={disabled}
      />

      <label className="field">
        <span className="label-xs">
          wearing <span className="unit">optional</span>
        </span>
        <input
          value={shot.wardrobe}
          disabled={disabled}
          placeholder="a worn canvas jacket"
          onChange={(event) => onChange({ wardrobe: event.target.value })}
        />
      </label>

      <ChipRow
        label="expression"
        options={EXPRESSIONS}
        value={shot.expression}
        onChange={(expression) => onChange({ expression })}
        disabled={disabled}
        unavailable={noFace}
      />
      <ChipRow
        label="looking"
        options={GAZES}
        value={shot.gaze}
        onChange={(gaze) => onChange({ gaze })}
        disabled={disabled}
        unavailable={noFace}
      />
      <ChipRow
        label="look"
        options={LOOKS}
        value={shot.look}
        onChange={(look) => onChange({ look })}
        disabled={disabled}
      />

      {hasPeople && (
        <div className="chiprow">
          <span className="label-xs">how many</span>
          <div className="chiprow-chips">
            <button
              type="button"
              className={`chip-button ${shot.solo ? 'chip-button-on' : ''}`}
              aria-pressed={shot.solo}
              disabled={disabled}
              onClick={() => onChange({ solo: true })}
            >
              only them
            </button>
            <button
              type="button"
              className={`chip-button ${!shot.solo ? 'chip-button-on' : ''}`}
              aria-pressed={!shot.solo}
              disabled={disabled}
              onClick={() => onChange({ solo: false })}
            >
              don&apos;t say
            </button>
          </div>
          <p className="chiprow-note">
            {shot.solo
              ? 'Adds a sentence naming them as the only person in frame — this model sometimes paints a second copy otherwise.'
              : 'Nothing is added. Wide shots may come back with a duplicate of them.'}
          </p>
        </div>
      )}

      <div className="chiprow">
        <span className="label-xs">shape</span>
        <div className="chiprow-chips" role="group" aria-label="aspect ratio">
          {ASPECTS.map((aspect) => (
            <button
              key={aspect.key}
              type="button"
              className={`chip-button ${shot.aspect === aspect.key ? 'chip-button-on' : ''}`}
              aria-pressed={shot.aspect === aspect.key}
              disabled={disabled}
              onClick={() => onChange({ aspect: aspect.key })}
            >
              {aspect.label}
              <span className="unit">
                {' '}
                {aspect.width}×{aspect.height}
              </span>
            </button>
          ))}
        </div>
        <p className="chiprow-note">{ASPECT_FOOTNOTE}</p>
      </div>
    </div>
  )
}
