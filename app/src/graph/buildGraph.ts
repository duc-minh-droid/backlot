import type { ComfyPrompt, NodeId, PreviewMethod, PromptNode } from '../comfy/types'
import { N, refImageNodeId } from './nodeIds'
import { reachableFrom } from './reachability'

export interface ReferenceImage {
  /** The name RETURNED by /upload/image -- the server renames on collision. */
  name: string
  subfolder: string
  width: number
  height: number
}

export interface GenParams {
  prompt: string
  negativePrompt: string
  width: number
  height: number
  steps: number
  cfg: number
  seed: number
  samplerName: string
  scheduler: string
  /** Encoder pixel budget for reference images. 0 keeps each at native size. */
  resolution: number
  references: ReferenceImage[]
  previewMethod: PreviewMethod
  filenamePrefix: string
  /** Prefix KV cache placement. Only emitted when it differs from ComfyUI's own default. */
  cacheDevice: 'auto' | 'gpu' | 'cpu' | 'off'
  cacheDtype: 'default' | 'int8' | 'int4'
}

export interface BuiltGraph {
  prompt: ComfyPrompt
  mode: 't2i' | 'edit'
  reachable: NodeId[]
  classTypes: Record<NodeId, string>
}

export const MAX_REFERENCES = 10

export const DEFAULT_PARAMS: GenParams = {
  prompt: '',
  negativePrompt: '',
  width: 1024,
  height: 1024,
  steps: 25,
  cfg: 1,
  seed: 0,
  samplerName: 'euler',
  scheduler: 'simple',
  // Never 0. resolution 0 keeps a reference at its native size, so a 12MP phone photo
  // becomes ~47k tokens and a 23 GiB KV cache request (nodes_qwen.py:155-165).
  resolution: 1024,
  references: [],
  previewMethod: 'latent2rgb',
  filenamePrefix: 'qwen',
  cacheDevice: 'cpu',
  cacheDtype: 'default',
}

/** LoadImage resolves a bare name against the input dir; a subfolder goes in the name. */
function loadImageValue(reference: ReferenceImage): string {
  return reference.subfolder ? `${reference.subfolder}/${reference.name}` : reference.name
}

/**
 * The resolution widget is a total PIXEL BUDGET, not a dimension: the encoder targets an
 * area of roughly resolution^2 while preserving aspect, snapped to multiples of 32
 * (nodes_qwen.py:155). So 1024 against a 16:9 reference yields about 1376x768. Mirrored
 * here so the UI can show each reference's real target size instead of implying 1024xN.
 */
export function referenceTargetSize(
  reference: { width: number; height: number },
  resolution: number,
): { width: number; height: number } {
  const snap = (value: number) => Math.max(32, Math.round(value / 32) * 32)
  if (resolution === 0) return { width: snap(reference.width), height: snap(reference.height) }
  const ratio = reference.width / reference.height
  return {
    width: snap(Math.sqrt(resolution * resolution * ratio)),
    height: snap(Math.sqrt((resolution * resolution) / ratio)),
  }
}

export function buildGraph(params: GenParams): BuiltGraph {
  const references = params.references
  const mode: 't2i' | 'edit' = references.length > 0 ? 'edit' : 't2i'

  // A hard error, not a silent slice(). Dropping a reference the user attached would be
  // invisible, and with a subject library it is easy to exceed the cap by accident.
  if (references.length > MAX_REFERENCES) {
    throw new Error(
      `${references.length} reference images attached, the graph allows ${MAX_REFERENCES}`,
    )
  }

  const encodeInputs: PromptNode['inputs'] = {
    clip: [N.CLIP, 0],
    prompt: params.prompt,
    negative_prompt: params.negativePrompt,
    resolution: params.resolution,
  }

  const prompt: ComfyPrompt = {
    [N.UNET]: {
      class_type: 'UnetLoaderGGUF',
      inputs: { unet_name: 'qwen_image_2.1-Q4_K.gguf' },
    },
    [N.CLIP]: {
      class_type: 'CLIPLoader',
      inputs: {
        clip_name: 'qwen3vl_8b_w4a8.safetensors',
        type: 'qwen_image',
        device: 'default',
      },
    },
    [N.VAE]: {
      class_type: 'VAELoader',
      inputs: { vae_name: 'qwen_image_2.1_vae_bf16.safetensors' },
    },
    [N.ENCODE]: { class_type: 'TextEncodeQwenImage21', inputs: encodeInputs },
    // The output size is always ours. fix_empty_latent_channels converts this 4-channel
    // /8 latent to the 64-channel /16 Qwen format losslessly because it is all zeros
    // (comfy/sample.py:45-70), which is exactly what the official template's custom_size
    // path does. It is what lets a portrait reference produce a 16:9 scene.
    [N.EMPTY_LATENT]: {
      class_type: 'EmptyLatentImage',
      inputs: { width: params.width, height: params.height, batch_size: 1 },
    },
    [N.SAMPLER]: {
      class_type: 'KSampler',
      inputs: {
        model: [N.UNET, 0],
        positive: [N.ENCODE, 0],
        negative: [N.ENCODE, 1],
        latent_image: [N.EMPTY_LATENT, 0],
        seed: params.seed,
        steps: params.steps,
        cfg: params.cfg,
        sampler_name: params.samplerName,
        scheduler: params.scheduler,
        // Reference-latent conditioning, not img2img: the encoder contributes latents
        // through the conditioning, never a partially-noised image. So this stays 1.0.
        denoise: 1,
      },
    },
    [N.DECODE]: { class_type: 'VAEDecode', inputs: { samples: [N.SAMPLER, 0], vae: [N.VAE, 0] } },
    [N.SAVE]: {
      class_type: 'SaveImage',
      inputs: { images: [N.DECODE, 0], filename_prefix: params.filenamePrefix },
    },
  }

  if (mode === 'edit') {
    references.forEach((reference, index) => {
      const id = refImageNodeId(index)
      prompt[id] = { class_type: 'LoadImage', inputs: { image: loadImageValue(reference) } }
      // Autogrow inputs are addressed by dotted, 1-based keys (nodes_qwen.py:125).
      encodeInputs[`images.image_${index + 1}`] = [id, 0]
    })

    // Without this link ref_latents stays empty and keep_vision flips true
    // (nodes_qwen.py:175): the model sees the image through the vision tower but gets no
    // VAE latents to splice, so the result reads as a prompt-only generation that merely
    // resembles the reference. It fails silently, which is why it is asserted below.
    encodeInputs['vae'] = [N.VAE, 0]

    // The encoder compacts its image inputs and then labels them by position
    // (nodes_qwen.py:149,157). A gap would silently renumber every later reference, so
    // <image3> in the prompt would point at the wrong photo. Dense 1..N is required.
    for (let i = 1; i <= references.length; i += 1) {
      if (!encodeInputs[`images.image_${i}`]) {
        throw new Error(`reference keys must be dense: images.image_${i} is missing`)
      }
    }

    if (!encodeInputs['vae']) {
      throw new Error('edit mode requires the VAE linked into TextEncodeQwenImage21')
    }

    // The prefix KV cache is already on for every run (model_base.py:2678) with
    // device "auto" / dtype "default". Adding this node at those values would change
    // nothing, so it is only emitted when we are genuinely overriding something.
    const overriding = params.cacheDevice !== 'auto' || params.cacheDtype !== 'default'
    if (overriding) {
      prompt[N.CACHE] = {
        class_type: 'QwenImage21Cache',
        inputs: { model: [N.UNET, 0], device: params.cacheDevice, dtype: params.cacheDtype },
      }
      prompt[N.SAMPLER]!.inputs['model'] = [N.CACHE, 0]
    }
  }

  const classTypes: Record<NodeId, string> = {}
  for (const [id, node] of Object.entries(prompt)) classTypes[id] = node.class_type

  return { prompt, mode, reachable: reachableFrom(prompt, N.SAVE), classTypes }
}
