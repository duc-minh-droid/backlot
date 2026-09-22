import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { panelVariants } from '../motion/variants'

const LAW: { swatch: string; name: string; meaning: string }[] = [
  { swatch: 'var(--load)', name: 'amber', meaning: 'time is passing and nothing is measuring it' },
  { swatch: 'var(--accent)', name: 'teal', meaning: 'time is passing and we have a true fraction' },
  { swatch: 'var(--cache)', name: 'blue', meaning: 'work we did not have to do' },
  { swatch: 'var(--neutral)', name: 'grey', meaning: 'not started, or stopped by you' },
  { swatch: 'var(--danger)', name: 'red', meaning: 'failed' },
]

/** The colour law, stated verbatim. One read and the timeline is self-explanatory. */
export function LegendPopover() {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="legend-wrap" ref={wrap}>
      <button
        type="button"
        className="mini-button legend-button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="what the colours mean"
      >
        ?
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="legend"
            role="dialog"
            aria-label="what the colours mean"
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <strong>What the colours mean</strong>
            <dl>
              {LAW.map((entry) => (
                <div key={entry.name}>
                  <dt>
                    <span className="legend-swatch" style={{ background: entry.swatch }} aria-hidden="true" />
                    {entry.name}
                  </dt>
                  <dd>{entry.meaning}</dd>
                </div>
              ))}
            </dl>
            <p>
              A filling bar only ever appears where a real numerator and denominator exist. The
              sampler has one. Loading weights does not, so it gets a sweep that never fills.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
