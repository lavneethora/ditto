import { canonical } from "../label"
import type { FieldSpec, ProfileKey } from "../types"

import { nearestKey, type SemanticMatch } from "./rank"

export { SEMANTIC_THRESHOLD, nearestKey } from "./rank"
export type { SemanticMatch } from "./rank"

/**
 * The last thing tried, and the only one that can be wrong about meaning.
 *
 * Runs after the rules and after everything the user has taught, on the labels
 * none of them recognised. Asks the offscreen document for a vector per label,
 * then decides by arithmetic.
 *
 * Fails to nothing. If the model is unavailable, the document cannot be
 * created, or the browser is too old for any of it, every label comes back
 * unmatched and Ditto behaves exactly as it did before this tier existed.
 * That is the correct failure: the tier adds recognition, it is not load
 * bearing.
 */

/** How long the whole batch may take before Ditto gives up and moves on. */
const EMBED_BUDGET_MS = 8000

async function embed(texts: string[]): Promise<number[][] | null> {
  if (texts.length === 0) return []
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) return null

  try {
    const reply = await Promise.race([
      chrome.runtime.sendMessage({ type: "ditto:embed", texts }),
      new Promise<null>((done) => setTimeout(() => done(null), EMBED_BUDGET_MS))
    ])

    if (!reply || reply.ok !== true) return null

    return reply.vectors as number[][]
  } catch {
    // A missing background, a closed port, a browser without offscreen. None
    // of them is worth surfacing: the field simply goes to the user.
    return null
  }
}

/**
 * Keys for the fields the rules could not place, where the model is confident.
 *
 * Batched, because the cost here is one round trip and one model load, not one
 * per field.
 */
export async function recogniseUnmatched(
  fields: readonly FieldSpec[]
): Promise<Map<string, SemanticMatch & { key: ProfileKey }>> {
  const found = new Map<string, SemanticMatch & { key: ProfileKey }>()

  const asking = fields.filter((field) => canonical(field.label).length > 2)
  if (asking.length === 0) return found

  const vectors = await embed(asking.map((field) => canonical(field.label)))
  if (!vectors) return found

  asking.forEach((field, index) => {
    const vector = vectors[index]
    if (!vector) return

    const match = nearestKey(vector)
    if (match) found.set(field.id, match)
  })

  return found
}
