import { ComfySocket } from './socket'
import { subscribeLogs } from './rest'

// Module-level singleton. React StrictMode double-mounts effects in dev, and two sockets
// would mean two client ids, doubled log subscriptions and a split event stream.
export const comfySocket = new ComfySocket()

let logsWanted = false

comfySocket.onState((state) => {
  // The log subscription is keyed to the sid and is dropped when the socket closes, so it
  // has to be re-issued on every open, not just the first.
  if (state.phase === 'open' && logsWanted) void subscribeLogs(state.sid, true)
})

export function setLogStreamEnabled(enabled: boolean): void {
  logsWanted = enabled
  const state = comfySocket.getState()
  if (state.phase === 'open') void subscribeLogs(state.sid, enabled)
}
