import { BINARY_EVENT, type ComfyBinaryMessage, type PreviewMeta } from './types'

const utf8 = new TextDecoder()

// Binary frames are `struct.pack(">I", event)` followed by a payload (server.py:1304).
// Kept pure and dependency-free so it can be tested against a captured frame.
export function parseBinaryFrame(buf: ArrayBuffer): ComfyBinaryMessage {
  const view = new DataView(buf)
  const eventId = view.getUint32(0, false)

  switch (eventId) {
    case BINARY_EVENT.PREVIEW_IMAGE: {
      // 4-byte image format: 1 = JPEG, 2 = PNG (server.py:1313).
      const format = view.getUint32(4, false)
      return {
        kind: 'preview',
        meta: null,
        mime: format === 2 ? 'image/png' : 'image/jpeg',
        bytes: new Uint8Array(buf, 8),
      }
    }

    case BINARY_EVENT.PREVIEW_IMAGE_WITH_METADATA: {
      // 4-byte JSON length, then the metadata, then the image (server.py:1338).
      const metaLength = view.getUint32(4, false)
      const meta = JSON.parse(utf8.decode(new Uint8Array(buf, 8, metaLength))) as PreviewMeta
      return {
        kind: 'preview',
        meta,
        mime: meta.image_type || 'image/jpeg',
        bytes: new Uint8Array(buf, 8 + metaLength),
      }
    }

    case BINARY_EVENT.TEXT: {
      // 4-byte node id length, then the node id, then the text (server.py:1470).
      const idLength = view.getUint32(4, false)
      return {
        kind: 'progress_text',
        nodeId: utf8.decode(new Uint8Array(buf, 8, idLength)),
        text: utf8.decode(new Uint8Array(buf, 8 + idLength)),
      }
    }

    default:
      return { kind: 'unknown', eventId, bytes: new Uint8Array(buf, 4) }
  }
}
