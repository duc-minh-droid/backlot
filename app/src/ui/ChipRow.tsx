import type { Option } from '../library/vocab'
import { optionNote } from '../library/vocab'

interface Props {
  label: string
  options: Option[]
  value: string
  onChange: (key: string) => void
  disabled?: boolean
  /** Why the whole row is unavailable, shown in place of the chips. */
  unavailable?: string
}

/**
 * One question. The "unspecified" option is a real chip rather than an absence, so leaving a
 * question unanswered is a visible choice and adds no words to the prompt.
 */
export function ChipRow({ label, options, value, onChange, disabled, unavailable }: Props) {
  const note = optionNote(options, value)

  return (
    <div className="chiprow">
      <span className="label-xs">{label}</span>

      {unavailable ? (
        <p className="chiprow-unavailable">{unavailable}</p>
      ) : (
        <div className="chiprow-chips" role="group" aria-label={label}>
          {options.map((option) => (
            <button
              key={option.key || 'none'}
              type="button"
              className={`chip-button ${value === option.key ? 'chip-button-on' : ''}`}
              aria-pressed={value === option.key}
              disabled={disabled}
              onClick={() => onChange(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      {note && <p className="chiprow-note">{note}</p>}
    </div>
  )
}
