import { parseBinaryFrame } from './binary'
import type { ComfyJsonMessage, ComfyMessage } from './types'

export type ConnState =
  | { phase: 'idle' }
  | { phase: 'connecting'; attempt: number }
  | { phase: 'open'; sid: string; since: number }
  | { phase: 'degraded'; sid: string; silentMs: number }
  | { phase: 'reconnecting'; attempt: number; nextAttemptAt: number; reason: string }

type MessageListener = (message: ComfyMessage) => void
type StateListener = (state: ConnState) => void

const BACKOFF_MS = [250, 500, 1000, 2000, 4000, 8000]
const JITTER = 0.2
// server.py:287 sends `status` unconditionally on connect. If it does not arrive, this
// socket lost the registration race in the handler's `finally` (server.py:282-325) and is
// a zombie: open at the TCP level, receiving nothing, forever, with no error.
const LIVENESS_MS = 3000
// Long enough to outlive a StrictMode remount, short enough to be invisible on a real unmount.
const TEARDOWN_GRACE_MS = 250

export class ComfySocket {
  // Minted once per app session and reused across reconnects. server.py:288 replays
  // `executing {node: last}` only when the sid matches, which is how we resync to a run
  // that is still going. A fresh id per socket would also orphan us from the running
  // prompt entirely, since server.client_id was captured at execute time.
  readonly clientId = crypto.randomUUID()

  private ws: WebSocket | null = null
  private state: ConnState = { phase: 'idle' }
  private attempt = 0
  private timer: number | null = null
  private livenessTimer: number | null = null
  private closed = false
  private refs = 0
  private teardown: number | null = null

  private readonly messageListeners = new Set<MessageListener>()
  private readonly stateListeners = new Set<StateListener>()

  /** The sid the server assigned. Authoritative for /prompt and the log subscription. */
  sid: string = this.clientId
  tLastMessage = 0

  onMessage(listener: MessageListener): () => void {
    this.messageListeners.add(listener)
    return () => this.messageListeners.delete(listener)
  }

  onState(listener: StateListener): () => void {
    this.stateListeners.add(listener)
    listener(this.state)
    return () => this.stateListeners.delete(listener)
  }

  getState(): ConnState {
    return this.state
  }

  /**
   * Idempotent and refcounted: React StrictMode mounts effects twice in dev.
   *
   * The teardown is deferred rather than immediate. Closing and instantly reopening with
   * the same clientId loses ComfyUI's registration race: the dying socket's `finally`
   * pops the sid (server.py:325) and deletes the NEW socket's entry, leaving it open and
   * permanently silent. The delay lets the remount cancel the close entirely.
   */
  connect(): () => void {
    this.refs += 1
    if (this.teardown !== null) {
      clearTimeout(this.teardown)
      this.teardown = null
    }
    if (this.refs === 1 && this.ws === null) {
      this.closed = false
      this.open()
    }
    return () => {
      this.refs -= 1
      if (this.refs > 0) return
      this.teardown = window.setTimeout(() => {
        this.teardown = null
        if (this.refs === 0) this.disconnect()
      }, TEARDOWN_GRACE_MS)
    }
  }

  disconnect(): void {
    this.closed = true
    this.clearTimers()
    this.ws?.close()
    this.ws = null
    this.setState({ phase: 'idle' })
  }

  /** Called by the run store when a gap is detected during an in-flight run. */
  markDegraded(silentMs: number): void {
    if (this.state.phase === 'open') {
      this.setState({ phase: 'degraded', sid: this.state.sid, silentMs })
    }
  }

  private open(): void {
    this.setState({ phase: 'connecting', attempt: this.attempt })

    const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${scheme}//${location.host}/api/ws?clientId=${this.clientId}`)
    // Must be set before any frame arrives. The default is 'blob', which forces an async
    // `await blob.arrayBuffer()` -- a preview frame can then be dispatched AFTER the
    // `progress` frame that followed it on the wire, corrupting step attribution
    // intermittently in a way that looks like server jitter.
    ws.binaryType = 'arraybuffer'
    this.ws = ws

    ws.onopen = () => {
      // Must be the first text frame: server.py:302 only inspects `first_message`, so
      // anything sent ahead of it forfeits metadata previews for this socket's lifetime.
      ws.send(JSON.stringify({ type: 'feature_flags', data: { supports_preview_metadata: true } }))
      this.livenessTimer = window.setTimeout(() => {
        if (this.state.phase !== 'open') this.retry('no status frame within 3s')
      }, LIVENESS_MS)
    }

    ws.onmessage = (event) => {
      const tRecv = performance.now()
      this.tLastMessage = tRecv

      if (event.data instanceof ArrayBuffer) {
        this.emit({ channel: 'binary', msg: parseBinaryFrame(event.data), tRecv })
        return
      }

      let message: ComfyJsonMessage
      try {
        message = JSON.parse(event.data as string) as ComfyJsonMessage
      } catch {
        return
      }

      if (message.type === 'status') {
        // Proof of life. Reset backoff here rather than on `open`, so a zombie socket
        // does not look like a healthy one.
        this.attempt = 0
        this.clearLiveness()
        if (message.data.sid) this.sid = message.data.sid
        this.setState({ phase: 'open', sid: this.sid, since: tRecv })
      }

      this.emit({ channel: 'json', msg: message, tRecv })
    }

    ws.onerror = () => {
      /* onclose always follows; retry there so we do not schedule twice. */
    }

    ws.onclose = (event) => {
      this.clearLiveness()
      if (this.closed) return
      this.retry(event.reason || `socket closed (${event.code})`)
    }
  }

  private retry(reason: string): void {
    this.clearTimers()
    this.ws?.close()
    this.ws = null
    if (this.closed) return

    const base = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)] ?? 8000
    const delay = Math.round(base * (1 + (Math.random() * 2 - 1) * JITTER))
    this.attempt += 1

    this.setState({
      phase: 'reconnecting',
      attempt: this.attempt,
      nextAttemptAt: Date.now() + delay,
      reason,
    })
    this.timer = window.setTimeout(() => this.open(), delay)
  }

  private clearLiveness(): void {
    if (this.livenessTimer !== null) {
      clearTimeout(this.livenessTimer)
      this.livenessTimer = null
    }
  }

  private clearTimers(): void {
    this.clearLiveness()
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  private setState(state: ConnState): void {
    this.state = state
    for (const listener of this.stateListeners) listener(state)
  }

  private emit(message: ComfyMessage): void {
    for (const listener of this.messageListeners) listener(message)
  }
}
