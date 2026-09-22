import { useEffect, useRef, useState } from 'react'
import { logStream, type LogLine } from '../telemetry/logStream'

/**
 * The real ComfyUI console. During a weight load this is the only signal that exists, so
 * it is not decoration.
 *
 * aria-live is off by default: streaming a server console to a screen reader unasked is
 * hostile. The lines are rendered from a capped ring buffer with no exit animations,
 * because eviction must be instant.
 */
export function LogConsole() {
  const [lines, setLines] = useState<LogLine[]>([])
  const [following, setFollowing] = useState(true)
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    logStream.start()
    return logStream.subscribe(setLines)
  }, [])

  useEffect(() => {
    if (!following) return
    const element = scroller.current
    if (element) element.scrollTop = element.scrollHeight
  }, [lines, following])

  const serverClock = lines.some((line) => line.clock === 'server')

  return (
    <section className="panel log-panel">
      <header className="panel-head">
        <span className="label-xs">server console</span>
        <button
          type="button"
          className="mini-button"
          onClick={() => setFollowing((value) => !value)}
          aria-pressed={following}
        >
          {following ? 'following' : 'paused'}
        </button>
      </header>

      <div
        ref={scroller}
        className="log-scroll"
        role="log"
        aria-live="off"
        tabIndex={0}
        onScroll={(event) => {
          const element = event.currentTarget
          const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 24
          if (atBottom !== following) setFollowing(atBottom)
        }}
      >
        {lines.length === 0 ? (
          <p className="log-empty">
            Waiting for ComfyUI to say something. Lines appear here as the server prints them.
          </p>
        ) : (
          lines.map((line) => (
            <div key={line.id} className={`log-line log-${line.level}`}>
              {line.text}
            </div>
          ))
        )}
      </div>

      <footer className="log-foot">
        {lines.length} lines shown
        <span className="unit">
          {' '}
          · timestamps from the {serverClock ? "server's own clock" : 'browser, on receipt'}
        </span>
      </footer>
    </section>
  )
}
