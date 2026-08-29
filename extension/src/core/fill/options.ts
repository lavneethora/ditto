import { canonical } from "../label"
import type { FieldOption } from "../types"

/**
 * Picking the right option out of a dropdown or radio group.
 *
 * The stored answer and the form's wording almost never match literally. A
 * profile says "decline", the form offers "I don't wish to answer"; a profile
 * says "yes", the form offers "Yes, I am authorized". This resolves that gap
 * with explicit synonyms plus graded fallbacks.
 *
 * The important property is that it returns null rather than guessing. An
 * unmatched option becomes NEEDS YOU, which costs the user one click. A wrong
 * guess on a demographic or authorization question costs them something
 * considerably worse.
 */

const YES_WORDS = ["yes", "y", "true", "1", "i am", "i do", "i have", "affirmative"]
const NO_WORDS = ["no", "n", "false", "0", "i am not", "i do not", "i don t", "negative"]

const DECLINE_WORDS = [
  "decline to state",
  "decline to self identify",
  "decline to answer",
  "decline",
  "i don t wish to answer",
  "i do not wish to answer",
  "i prefer not to say",
  "prefer not to say",
  "prefer not to answer",
  "prefer not to disclose",
  "choose not to disclose",
  "do not wish to disclose",
  "not disclosed",
  "opt out"
]

function labelsOf(option: FieldOption): string[] {
  return [canonical(option.label), canonical(option.value)].filter(Boolean)
}

/** Exact match on the whole normalized string. */
function exact(options: FieldOption[], wanted: string): FieldOption | undefined {
  return options.find((option) => labelsOf(option).includes(wanted))
}

/** The option's text begins with the wanted phrase, e.g. "Yes, I am authorized". */
function prefixed(options: FieldOption[], wanted: string): FieldOption | undefined {
  return options.find((option) =>
    labelsOf(option).some((text) => text === wanted || text.startsWith(wanted + " "))
  )
}

function contains(options: FieldOption[], wanted: string): FieldOption | undefined {
  return options.find((option) => labelsOf(option).some((text) => text.includes(wanted)))
}

/**
 * Try a list of synonyms in order of confidence: every synonym is tried as an
 * exact match before any is tried as a prefix, so "no" cannot beat "yes" just
 * by appearing earlier in a longer option's text.
 */
function bySynonyms(options: FieldOption[], synonyms: string[]): FieldOption | null {
  for (const strategy of [exact, prefixed]) {
    for (const word of synonyms) {
      const hit = strategy(options, word)
      if (hit) return hit
    }
  }

  return null
}

/**
 * Match a yes/no answer.
 *
 * "No" is checked against the negative synonyms before the positive ones are
 * allowed to run loosely, because "no" is a substring of words like "none" and
 * "not applicable" and a sloppy contains-match flips the answer.
 */
export function pickBoolean(options: FieldOption[], value: boolean): FieldOption | null {
  return bySynonyms(options, value ? YES_WORDS : NO_WORDS)
}

export function pickTriState(options: FieldOption[], value: "yes" | "no" | "decline"): FieldOption | null {
  if (value === "decline") return bySynonyms(options, DECLINE_WORDS)
  return pickBoolean(options, value === "yes")
}

/**
 * Match free text, such as a country, state, gender or "how did you hear".
 *
 * Falls back to word overlap, which is what makes "United States of America"
 * find an option labelled "United States", but requires a majority of the
 * wanted words to appear so it cannot land on something unrelated.
 */
export function pickText(options: FieldOption[], value: string): FieldOption | null {
  const wanted = canonical(value)
  if (!wanted) return null

  const direct = exact(options, wanted) ?? prefixed(options, wanted) ?? contains(options, wanted)
  if (direct) return direct

  // Reverse containment: the option is shorter than the stored value.
  // "United States" as an option, "United States of America" stored.
  const reverse = options.find((option) =>
    labelsOf(option).some((text) => text.length >= 3 && wanted.includes(text))
  )
  if (reverse) return reverse

  const wantedWords = wanted.split(" ").filter((w) => w.length > 2)
  if (wantedWords.length === 0) return null

  let best: { option: FieldOption; score: number } | null = null

  for (const option of options) {
    for (const text of labelsOf(option)) {
      const words = new Set(text.split(" "))
      const hits = wantedWords.filter((w) => words.has(w)).length
      const score = hits / wantedWords.length

      if (score > (best?.score ?? 0)) best = { option, score }
    }
  }

  return best && best.score >= 0.6 ? best.option : null
}

/** Dispatch on the shape of the resolved value. */
export function pickOption(
  options: FieldOption[],
  value: string | boolean
): FieldOption | null {
  if (typeof value === "boolean") return pickBoolean(options, value)
  if (value === "yes" || value === "no" || value === "decline") return pickTriState(options, value)
  return pickText(options, value)
}
