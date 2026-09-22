import type { ComfyPrompt, NodeId } from '../comfy/types'

function isLink(value: unknown): value is [NodeId, number] {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === 'string'
}

/**
 * Walks backwards from the output node over [nodeId, slot] links.
 *
 * ComfyUI exposes no endpoint for the planned execution order or node count, and
 * execution_cached is computed over every key in the prompt rather than the reachable set
 * -- so `prompt.keys() - cached` over-counts. Because we author this graph we can be
 * exact instead.
 *
 * This is only exact while no node in the graph uses lazy input evaluation or subgraph
 * expansion. None of UnetLoaderGGUF, CLIPLoader, VAELoader, TextEncodeQwenImage21,
 * EmptyLatentImage, LoadImage, KSampler, VAEDecode or SaveImage do. Re-check this if a
 * node type is added.
 */
export function reachableFrom(prompt: ComfyPrompt, outputNode: NodeId): NodeId[] {
  const seen = new Set<NodeId>()
  const stack: NodeId[] = [outputNode]

  while (stack.length > 0) {
    const id = stack.pop()!
    if (seen.has(id)) continue
    seen.add(id)

    const node = prompt[id]
    if (!node) continue
    for (const value of Object.values(node.inputs)) {
      if (isLink(value)) stack.push(value[0])
    }
  }

  return [...seen]
}
