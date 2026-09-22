import type {
  ComfyImageRef,
  ComfyPrompt,
  HistoryEntry,
  PreviewMethod,
  SubmitErrorBody,
  SubmitResponse,
  SystemStats,
  UploadResponse,
} from './types'

const API = '/api'

export class ComfyRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: SubmitErrorBody,
  ) {
    super(message)
    this.name = 'ComfyRequestError'
  }

  /**
   * ComfyUI validates per node and returns a structured node_errors map. LoadImage checks
   * that its file exists (nodes.py:1808), so a deleted reference lands here rather than
   * failing mid-run -- but only if we keep it instead of collapsing to error.message.
   */
  get nodeErrors(): { nodeId: string; message: string }[] {
    const raw = this.body?.node_errors
    if (!raw) return []
    return Object.entries(raw).flatMap(([nodeId, value]) => {
      const errors = (value as { errors?: { message?: string; details?: string }[] }).errors ?? []
      return errors.map((error) => ({
        nodeId,
        message: [error.message, error.details].filter(Boolean).join(' — '),
      }))
    })
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const parsed = (await response.json().catch(() => undefined)) as SubmitErrorBody | undefined
    throw new ComfyRequestError(
      parsed?.error?.message ?? `${path} failed with ${response.status}`,
      response.status,
      parsed,
    )
  }
  return (await response.json()) as T
}

export interface SubmitArgs {
  promptId: string
  prompt: ComfyPrompt
  clientId: string
  previewMethod: PreviewMethod
}

/**
 * client_id is mandatory: without it server.client_id stays null (execution.py:733) and
 * the server sends no executing / progress / progress_state messages at all.
 *
 * prompt_id is minted by us (server.py:1093 accepts a canonical lowercase UUID) so the run
 * can be registered in the store before this fetch resolves -- execution_start cannot then
 * arrive for a prompt id we have never heard of.
 *
 * preview_method is applied per prompt (execution.py:731), which is how we get live latent
 * previews without restarting a server that was launched without --preview-method.
 */
export function submitPrompt(args: SubmitArgs): Promise<SubmitResponse> {
  return postJson<SubmitResponse>('/prompt', {
    prompt_id: args.promptId,
    prompt: args.prompt,
    client_id: args.clientId,
    extra_data: { preview_method: args.previewMethod },
  })
}

/**
 * Both calls, always. /interrupt scans only the RUNNING list and returns 200 while doing
 * nothing for a queued prompt (server.py:1172); /queue delete only removes pending items.
 * Together they cover the queued -> running transition we would otherwise race.
 *
 * Never the empty-body global interrupt -- it would kill a job queued from ComfyUI's own UI.
 */
export async function cancelPrompt(promptId: string): Promise<void> {
  await Promise.allSettled([
    postJson('/interrupt', { prompt_id: promptId }),
    postJson('/queue', { delete: [promptId] }),
  ])
}

export async function getSystemStats(): Promise<SystemStats> {
  const response = await fetch(`${API}/system_stats`)
  if (!response.ok) throw new ComfyRequestError('system_stats failed', response.status)
  return (await response.json()) as SystemStats
}

export async function getHistory(promptId: string): Promise<HistoryEntry | undefined> {
  const response = await fetch(`${API}/history/${promptId}`)
  if (!response.ok) return undefined
  const body = (await response.json()) as Record<string, HistoryEntry>
  return body[promptId]
}

export function viewUrl(ref: ComfyImageRef): string {
  const params = new URLSearchParams({
    filename: ref.filename,
    subfolder: ref.subfolder,
    type: ref.type,
  })
  return `${API}/view?${params}`
}

export interface UploadProgress {
  loaded: number
  total: number
}

/**
 * XMLHttpRequest rather than fetch: xhr.upload.onprogress gives real transmitted bytes,
 * which is a measured signal with a known denominator and therefore earns a real progress
 * bar. fetch has no upload progress, and swapping a real signal for a spinner would be a
 * self-inflicted version of exactly what this app exists to avoid.
 *
 * overwrite is left off so an existing file is never clobbered; the server renames to
 * "name (1).png" instead, which is why the RETURNED name must be used in the graph.
 */
export function uploadImage(
  file: File,
  subfolder: string,
  onProgress?: (progress: UploadProgress) => void,
): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('image', file, file.name)
    form.append('type', 'input')
    form.append('subfolder', subfolder)

    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API}/upload/image`)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.({ loaded: event.loaded, total: event.total })
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText) as UploadResponse)
      } else {
        reject(new ComfyRequestError(`upload failed with ${xhr.status}`, xhr.status))
      }
    }
    xhr.onerror = () => reject(new ComfyRequestError('upload failed', 0))
    xhr.send(form)
  })
}

/**
 * HEAD on /view: aiohttp serves HEAD for GET routes, so this is a status code and no
 * bytes. Used to tell a saved subject whose files are gone from one that is fine, before
 * the user spends 100 seconds finding out.
 */
export async function imageExists(name: string, subfolder: string): Promise<boolean> {
  const params = new URLSearchParams({ filename: name, subfolder, type: 'input' })
  try {
    const response = await fetch(`${API}/view?${params}`, { method: 'HEAD' })
    return response.ok
  } catch {
    return false
  }
}

export interface RawLogs {
  entries: { t: string; m: string }[]
  size: { cols: number; rows: number }
}

/** /internal is an add_subapp and is NOT mirrored under /api. */
export async function getRawLogs(): Promise<RawLogs | undefined> {
  const response = await fetch('/internal/logs/raw')
  if (!response.ok) return undefined
  return (await response.json()) as RawLogs
}

/**
 * Must be re-issued on every socket open: sockets_metadata is popped in the ws handler's
 * `finally` (server.py:325), so the subscription does not survive a reconnect.
 */
export async function subscribeLogs(clientId: string, enabled: boolean): Promise<boolean> {
  const response = await fetch('/internal/logs/subscribe', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, enabled }),
  })
  return response.ok
}
