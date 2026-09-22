import { uploadImage } from '../comfy/rest'
import type { SubjectImage } from './types'

export const UPLOAD_SUBFOLDER = 'qwen-app'

/**
 * The model never uses more than ~2048x2048 of a reference, so anything larger is capped
 * before upload. This is a CAP, not a resize to the encode budget: ComfyUI resizes with
 * lanczos from the original file, and a browser canvas is a box filter at best, so we
 * leave the good filter as much source as it can actually use.
 */
const MAX_EDGE = 2048

export interface PreparedUpload {
  image: SubjectImage
  /** True when we downscaled before uploading, so the UI can say so. */
  capped: boolean
  originalWidth: number
  originalHeight: number
}

async function capIfHuge(file: File, bitmap: ImageBitmap): Promise<{ blob: Blob; w: number; h: number; capped: boolean }> {
  const longest = Math.max(bitmap.width, bitmap.height)
  if (longest <= MAX_EDGE) {
    return { blob: file, w: bitmap.width, h: bitmap.height, capped: false }
  }

  const scale = MAX_EDGE / longest
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return { blob: file, w: bitmap.width, h: bitmap.height, capped: false }
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, w, h)

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  return blob ? { blob, w, h, capped: true } : { blob: file, w: bitmap.width, h: bitmap.height, capped: false }
}

export async function prepareAndUpload(file: File): Promise<PreparedUpload> {
  const bitmap = await createImageBitmap(file)
  const originalWidth = bitmap.width
  const originalHeight = bitmap.height

  const { blob, w, h, capped } = await capIfHuge(file, bitmap)
  bitmap.close()

  const toSend = blob instanceof File ? blob : new File([blob], file.name, { type: 'image/png' })
  // Always the RETURNED name: the server renames on collision.
  const uploaded = await uploadImage(toSend, UPLOAD_SUBFOLDER)

  return {
    image: {
      id: crypto.randomUUID(),
      name: uploaded.name,
      subfolder: uploaded.subfolder,
      width: w,
      height: h,
      bytes: toSend.size,
      addedAt: Date.now(),
    },
    capped,
    originalWidth,
    originalHeight,
  }
}

/** LoadImage does convert("RGB"), so alpha is dropped rather than composited. */
export function warnsFor(file: File): string[] {
  const warnings: string[] = []
  if (file.type === 'image/gif' || file.type === 'image/webp') {
    warnings.push('only the first frame of an animated image is used')
  }
  if (file.type === 'image/png') {
    warnings.push('transparency is dropped, not composited — whatever sits under it comes through')
  }
  return warnings
}
