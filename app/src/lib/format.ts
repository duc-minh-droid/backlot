/**
 * One place for every number the UI prints.
 *
 * Durations come from client-side websocket receipt times, so they carry a few ms of
 * transport latency. One decimal place, never two: claiming millisecond precision we do
 * not have is the same kind of lie as a fake progress bar.
 */

export function seconds(ms: number): string {
  const value = ms / 1000
  if (value >= 100) return value.toFixed(0)
  return value.toFixed(1)
}

/** M:SS.s. Hundredths would be noise at websocket latency. */
export function clock(ms: number): string {
  const total = Math.max(0, ms) / 1000
  const minutes = Math.floor(total / 60)
  const rest = total - minutes * 60
  return `${minutes}:${rest.toFixed(1).padStart(4, '0')}`
}

export function gigabytes(bytes: number): string {
  return (bytes / 1e9).toFixed(1)
}

export function secondsPerStep(value: number): string {
  return value.toFixed(2)
}

export function percent(fraction: number): string {
  return Math.round(fraction * 100).toString()
}
