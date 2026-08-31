import type { ProfileKey } from "../types"

import table from "./vectors.json"

/**
 * Which profile key a label is nearest to, or none.
 *
 * Pure: it takes a vector and returns a key. Producing the vector needs the
 * model, which lives elsewhere, so everything decided here is decided by
 * arithmetic and is testable without loading 23MB.
 */

interface Phrasing {
  key: string
  of: string
  v: number[]
}

const VECTORS = (table as { dims: number; vectors: Phrasing[] }).vectors

/**
 * The similarity a match has to clear.
 *
 * Measured, not chosen. Against the phrasings shipped here, twelve labels the
 * packaged rules cannot recognise scored between 0.44 and 0.75, and twelve
 * questions no profile can answer scored at most 0.438. With the excluded keys
 * below taken out of the running, those two sets do not overlap, and this sits
 * between them.
 *
 * Erring high is the cheap direction. A match refused becomes a field the user
 * fills; a match invented becomes an answer they did not give.
 */
export const SEMANTIC_THRESHOLD = 0.46

/**
 * Keys the model may never answer, however sure it is.
 *
 * Eligibility and equal-employment questions are legal statements, and the
 * measurement that set the threshold showed the model reading "Are you a
 * citizen of any one of these countries: Cuba, Iran, North Korea, or Syria" as
 * a request for the applicant's citizenship, at 0.542. It is not a request for
 * anything, it is a screening question with a yes or no answer, and getting it
 * backwards is a false statement on a federal form.
 *
 * They are not unreachable: the rules answer them, and the user can teach one
 * explicitly. What is refused is a guess.
 */
const NEVER_GUESSED = /^(eligibility|eeo)\.|^forms\./

export interface SemanticMatch {
  key: ProfileKey
  score: number
  /** The phrasing it matched, so a report can say why. */
  of: string
}

function dot(a: readonly number[], b: readonly number[]): number {
  let sum = 0
  for (let i = 0; i < a.length && i < b.length; i++) sum += a[i] * b[i]
  return sum
}

export function nearestKey(
  vector: readonly number[],
  threshold = SEMANTIC_THRESHOLD
): SemanticMatch | null {
  let best: SemanticMatch | null = null

  for (const phrasing of VECTORS) {
    if (NEVER_GUESSED.test(phrasing.key)) continue

    const score = dot(vector, phrasing.v)
    if (score < threshold) continue
    if (best && score <= best.score) continue

    best = { key: phrasing.key as ProfileKey, score, of: phrasing.of }
  }

  return best
}

/** The vector for a phrasing this build ships, for tests and for tuning. */
export function vectorFor(phrasing: string): number[] | null {
  return VECTORS.find((entry) => entry.of === phrasing)?.v ?? null
}
