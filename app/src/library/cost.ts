import { referenceTargetSize } from '../graph/buildGraph'
import type { ResolvedAttachment } from './types'

/**
 * KV cache size, from ldm/qwen_image21/model.py:332:
 *   cache_bytes = 2 * len(transformer_blocks) * B * prefix_len * inner_dim * element_size
 *
 * Read straight off the GGUF header for qwen_image_2.1-Q4_K: 32 transformer blocks,
 * inner_dim 4096. At 2 bytes per element that is exactly 0.5 MiB per prefix token.
 */
export const BLOCKS = 32
export const INNER_DIM = 4096
export const BYTES_PER_PREFIX_TOKEN = 2 * BLOCKS * INNER_DIM * 2

/** The VAE latent is (W/16) x (H/16), and each of those positions is one DiT token. */
const LATENT_DIVISOR = 16

export interface ReferenceCost {
  index: number
  label: string
  width: number
  height: number
  tokens: number
}

export interface EncodeCost {
  perReference: ReferenceCost[]
  referenceTokens: number
  targetTokens: number
  /** Image tokens only. Text tokens are NOT included -- no BPE tokenizer in the browser. */
  prefixTokensExcludingText: number
  kvBytes: { default: number; int8: number; int4: number }
}

export function tokensFor(width: number, height: number): number {
  return Math.floor(width / LATENT_DIVISOR) * Math.floor(height / LATENT_DIVISOR)
}

export function encodeCost(
  attachments: ResolvedAttachment[],
  resolution: number,
  targetWidth: number,
  targetHeight: number,
): EncodeCost {
  const perReference = attachments.map((attachment, index) => {
    const size = referenceTargetSize(attachment, resolution)
    return {
      index,
      label: `image_${index + 1}`,
      width: size.width,
      height: size.height,
      tokens: tokensFor(size.width, size.height),
    }
  })

  const referenceTokens = perReference.reduce((total, reference) => total + reference.tokens, 0)
  const targetTokens = tokensFor(targetWidth, targetHeight)
  const prefix = referenceTokens + targetTokens

  return {
    perReference,
    referenceTokens,
    targetTokens,
    prefixTokensExcludingText: prefix,
    kvBytes: {
      default: prefix * BYTES_PER_PREFIX_TOKEN,
      int8: (prefix * BYTES_PER_PREFIX_TOKEN) / 2,
      int4: (prefix * BYTES_PER_PREFIX_TOKEN) / 4,
    },
  }
}

export interface CacheChoice {
  device: 'auto' | 'gpu' | 'cpu' | 'off'
  dtype: 'default' | 'int8' | 'int4'
  /** Whether this differs from what ComfyUI would do on its own. */
  isNonDefault: boolean
  reason: string
}

const GIB = 1024 ** 3

/**
 * The prefix cache is ALREADY enabled for every run (model_base.py:2678) with
 * device "auto" / dtype "default". So adding QwenImage21Cache at those values changes
 * nothing, and we only add the node when we are genuinely overriding something.
 *
 * On this machine (8GB VRAM, 24GB RAM) "auto" means: try GPU (needs free > 4x cache, which
 * never holds once a reference is attached), then pinned RAM, then silently recompute the
 * whole prefix every step. "cpu" goes straight to the RAM path, which the node's own
 * tooltip says is prefetched behind compute and costs little speed.
 */
export function chooseCache(cost: EncodeCost, referenceCount: number): CacheChoice {
  if (referenceCount === 0) {
    return {
      device: 'auto',
      dtype: 'default',
      isNonDefault: false,
      reason: 'no references, nothing worth caching',
    }
  }

  // Measured on this machine, 2 references at budget 768, 12 steps:
  //   no node (ComfyUI's own auto/default)  75.1s
  //   cpu / default                         57.1s   <- kept
  //   off                                   94.8s
  //   cpu / int8                            crashes: "aimdo memory compile error"
  //
  // So the node is worth emitting at cpu/default, and int8 is never chosen automatically
  // despite halving the cache -- a setting that reliably fails is not a saving. It stays
  // available in the advanced drawer for anyone who wants to retest it.
  return {
    device: 'cpu',
    dtype: 'default',
    isNonDefault: true,
    reason: `pinned RAM, prefetched behind compute — measured 57.1s vs 75.1s on this machine (${gib(cost.kvBytes.default)} GiB)`,
  }
}

export function gib(bytes: number): string {
  return (bytes / GIB).toFixed(2)
}
