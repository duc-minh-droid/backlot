export interface MappedError {
  headline: string
  explanation: string
  mapped: boolean
}

interface Rule {
  type?: string
  contains?: string
  headline: string
  explanation: string
}

// Explanations are specific to this machine: an 8GB 4060 Laptop running --lowvram.
const RULES: Rule[] = [
  {
    contains: 'out of memory',
    headline: 'The GPU ran out of memory',
    explanation:
      'On 8 GB in --lowvram this is the usual wall above 1024x1024, or when a browser or game is holding VRAM. Try 1024x1024, close other GPU applications, or drop to the Q3_K model.',
  },
  {
    contains: 'Invalid image file',
    headline: 'A reference image is missing from ComfyUI\\input',
    explanation:
      'The upload either failed or the file was renamed. Remove the reference and add it again.',
  },
  {
    contains: 'unet_name',
    headline: 'The GGUF model file was not found',
    explanation:
      'Expected qwen_image_2.1-Q4_K.gguf in C:\\AI\\ComfyUI\\models\\unet. Check the filename matches exactly.',
  },
  {
    contains: 'clip_name',
    headline: 'The text encoder was not found',
    explanation:
      'Expected qwen3vl_8b_w4a8.safetensors in C:\\AI\\ComfyUI\\models\\text_encoders, loaded with type qwen_image.',
  },
  {
    type: 'ExecutionBlocked',
    headline: 'A node upstream failed, so this one never ran',
    explanation: 'The real failure is the first red stage in the timeline.',
  },
]

export function mapError(exceptionType: string, exceptionMessage: string): MappedError {
  const haystack = `${exceptionType} ${exceptionMessage}`.toLowerCase()

  for (const rule of RULES) {
    const typeHit = rule.type && exceptionType === rule.type
    const textHit = rule.contains && haystack.includes(rule.contains.toLowerCase())
    if (typeHit || textHit) {
      return { headline: rule.headline, explanation: rule.explanation, mapped: true }
    }
  }

  // Never guess. An unexplained error is stated as unexplained.
  return {
    headline: exceptionType || 'ComfyUI raised an error',
    explanation:
      'We do not have an explanation mapped for this one. The traceback below is unedited — nothing has been trimmed or reworded.',
    mapped: false,
  }
}
