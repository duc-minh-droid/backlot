import { comfySocket, setLogStreamEnabled } from '../comfy/client'
import { getRawLogs } from '../comfy/rest'

export interface LogLine {
  id: number
  text: string
  /** ms since the app's epoch, from the server timestamp when it parses, else receipt. */
  tMs: number
  /** Which clock the timestamp came from -- shown, not hidden. */
  clock: 'server' | 'client'
  level: 'info' | 'warn' | 'error'
}

// eslint-disable-next-line no-control-regex
const ANSI = /\[[0-9;]*[A-Za-z]/g

const RENDER_LIMIT = 120
const HISTORY_LIMIT = 2000

type Listener = (lines: LogLine[]) => void

/**
 * Deliberately outside React: log bursts during a weight load must not re-render the
 * timeline or the canvas. Components subscribe and get a batched array.
 */
class LogStream {
  private history: LogLine[] = []
  private pending: LogLine[] = []
  private flushHandle: number | null = null
  private nextId = 0
  private readonly listeners = new Set<Listener>()

  start(): void {
    setLogStreamEnabled(true)
    void getRawLogs().then((raw) => {
      if (!raw) return
      for (const entry of raw.entries) this.ingest(entry.t, entry.m)
      this.flush()
    })
  }

  stop(): void {
    setLogStreamEnabled(false)
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.rendered())
    return () => this.listeners.delete(listener)
  }

  rendered(): LogLine[] {
    return this.history.slice(-RENDER_LIMIT)
  }

  all(): LogLine[] {
    return this.history
  }

  ingest(timestamp: string | undefined, message: string): void {
    // ComfyUI's own tqdm bars write with \r, so one entry can carry a whole line of
    // overwritten bar states. Keep the last segment. It also colours its output with ANSI
    // escapes, which would otherwise render as literal "[32m[INFO][0m".
    for (const raw of message.split('\n')) {
      const text = (raw.split('\r').at(-1) ?? '').replace(ANSI, '')
      if (text.trim() === '') continue

      const parsed = timestamp ? Date.parse(timestamp) : Number.NaN
      const usable = Number.isFinite(parsed)

      this.pending.push({
        id: this.nextId++,
        text,
        tMs: usable ? parsed : Date.now(),
        clock: usable ? 'server' : 'client',
        level: levelOf(text),
      })
    }
    this.scheduleFlush()
  }

  private scheduleFlush(): void {
    if (this.flushHandle !== null) return
    this.flushHandle = requestAnimationFrame(() => {
      this.flushHandle = null
      this.flush()
    })
  }

  private flush(): void {
    if (this.pending.length === 0) return
    this.history = [...this.history, ...this.pending].slice(-HISTORY_LIMIT)
    this.pending = []
    const rendered = this.rendered()
    for (const listener of this.listeners) listener(rendered)
  }
}

function levelOf(text: string): LogLine['level'] {
  const lower = text.toLowerCase()
  if (lower.includes('error') || lower.includes('traceback') || lower.includes('out of memory')) {
    return 'error'
  }
  if (lower.includes('warning') || lower.includes('warn')) return 'warn'
  return 'info'
}

export const logStream = new LogStream()

comfySocket.onMessage((message) => {
  if (message.channel !== 'json' || message.msg.type !== 'logs') return
  for (const entry of message.msg.data.entries) logStream.ingest(entry.t, entry.m)
})
