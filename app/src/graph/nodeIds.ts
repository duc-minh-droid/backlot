import type { NodeId } from '../comfy/types'

// Node ids are stable across both modes so labels, the graph inspector and recorded runs
// stay comparable between a text-to-image run and an edit run. Reference loaders start at
// 101 so they can never collide with the fixed pipeline.
export const N = {
  UNET: '1',
  CLIP: '2',
  VAE: '3',
  ENCODE: '4',
  EMPTY_LATENT: '5',
  SAMPLER: '6',
  DECODE: '7',
  SAVE: '8',
  /** QwenImage21Cache, present only when we override the prefix-cache defaults. */
  CACHE: '9',
} as const

export const refImageNodeId = (index: number): NodeId => String(101 + index)

export interface NodeLabel {
  title: string
  detail: string
  /**
   * False means ComfyUI emits no sub-node progress for this node, so the UI must say so
   * from the moment the node starts rather than apologising for the silence afterwards.
   * Only the sampler is true.
   */
  expectSubProgress: boolean
}

export const NODE_LABELS: Record<NodeId, NodeLabel> = {
  [N.UNET]: {
    title: 'Loading diffusion weights',
    detail: 'qwen_image_2.1-Q4_K.gguf — 4.2 GB read from disk',
    expectSubProgress: false,
  },
  [N.CLIP]: {
    title: 'Loading text encoder',
    detail: 'qwen3vl_8b_w4a8.safetensors — 6.3 GB',
    expectSubProgress: false,
  },
  [N.VAE]: {
    title: 'Loading VAE',
    detail: 'qwen_image_2.1_vae_bf16.safetensors — 0.7 GB',
    expectSubProgress: false,
  },
  [N.ENCODE]: {
    title: 'Encoding your prompt',
    detail: 'Qwen3-VL turns your text into conditioning',
    expectSubProgress: false,
  },
  [N.EMPTY_LATENT]: {
    title: 'Allocating latent',
    detail: 'an empty canvas at the target size',
    expectSubProgress: false,
  },
  [N.SAMPLER]: {
    title: 'Sampling',
    detail: 'weights move into VRAM, then one frame per step',
    expectSubProgress: true,
  },
  [N.DECODE]: {
    title: 'Decoding to pixels',
    detail: 'VAE turns the latent into an image',
    expectSubProgress: false,
  },
  [N.SAVE]: {
    title: 'Saving image',
    detail: 'written to ComfyUI\\output',
    expectSubProgress: false,
  },
}

/** Nodes are folded into six displayed stages; folded members keep their own timings. */
export interface StageDef {
  key: string
  label: string
  nodes: NodeId[]
  caption: string
}

export const STAGES: StageDef[] = [
  // The cache node only clones the patcher, so its time belongs with the model load.
  { key: 'load-unet', label: 'LOAD DIFFUSION', nodes: [N.UNET, N.CACHE], caption: 'Q4_K GGUF · 4.2 GB' },
  { key: 'load-clip', label: 'LOAD TEXT ENCODER', nodes: [N.CLIP], caption: 'Qwen3-VL 8B w4a8 · 6.3 GB' },
  {
    key: 'encode',
    label: 'ENCODE PROMPT',
    nodes: [N.ENCODE, N.EMPTY_LATENT],
    // With references this node also runs the vision tower twice per image (positive and
    // negative) and the VAE once per image, which is where most of its time goes.
    caption: 'Qwen3-VL text encode',
  },
  { key: 'sample', label: 'SAMPLE', nodes: [N.SAMPLER], caption: 'euler/simple' },
  { key: 'decode', label: 'DECODE', nodes: [N.VAE, N.DECODE], caption: 'VAE 0.7 GB · latent → pixels' },
  { key: 'save', label: 'SAVE', nodes: [N.SAVE], caption: 'PNG → output\\' },
]

const STAGE_BY_NODE = new Map<NodeId, string>()
for (const stage of STAGES) for (const node of stage.nodes) STAGE_BY_NODE.set(node, stage.key)

export function stageKeyForNode(nodeId: NodeId): string | undefined {
  // Reference image loaders belong to the encode stage: they exist to feed it.
  if (Number(nodeId) >= 101) return 'encode'
  return STAGE_BY_NODE.get(nodeId)
}

export function labelForNode(nodeId: NodeId, classType?: string): NodeLabel {
  const known = NODE_LABELS[nodeId]
  if (known) return known
  if (Number(nodeId) >= 101) {
    return {
      title: `Loading reference image ${Number(nodeId) - 100}`,
      detail: 'read from ComfyUI\\input',
      expectSubProgress: false,
    }
  }
  // Never crash on an id we did not author, and never invent a description for it.
  return { title: classType ?? nodeId, detail: 'no label registered', expectSubProgress: false }
}
