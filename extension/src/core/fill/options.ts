import { CA_PROVINCES, US_STATES } from "~profile/geo"

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
 * Both spellings of every subdivision, keyed by the canonical form of each.
 *
 * A profile stores "Texas" because that is what a dropdown of state names
 * offers. A location typeahead offers "Lubbock, TX, USA". Neither string
 * contains the other and they share one significant word, so without this the
 * two never match and a correct answer is reported as no option found.
 */
const SUBDIVISION_ALIASES: ReadonlyMap<string, string> = new Map(
  [...US_STATES, ...CA_PROVINCES].flatMap(({ name, abbr }) => [
    [canonical(name), abbr.toLowerCase()] as const,
    [abbr.toLowerCase(), canonical(name)] as const
  ])
)

/**
 * The same value with any subdivision swapped for its other spelling.
 *
 * "Lubbock, Texas" also becomes "lubbock tx", which then shares a significant
 * word with "Lubbock, TX, USA" and matches on overlap.
 */
function withSubdivisionAliases(value: string): string[] {
  const words = canonical(value).split(" ")
  const swapped: string[] = []

  // Longest first, so "new york" is tried before "new".
  for (let size = 3; size >= 1; size--) {
    for (let i = 0; i + size <= words.length; i++) {
      const phrase = words.slice(i, i + size).join(" ")
      const alias = SUBDIVISION_ALIASES.get(phrase)

      if (alias) {
        swapped.push([...words.slice(0, i), alias, ...words.slice(i + size)].join(" "))
      }
    }
  }

  return swapped
}

/**
 * Match free text, such as a country, state, gender or "how did you hear".
 *
 * Falls back to word overlap, which is what makes "United States of America"
 * find an option labelled "United States", but requires a majority of the
 * wanted words to appear so it cannot land on something unrelated.
 */
export function pickText(options: FieldOption[], value: string): FieldOption | null {
  const direct = pickExactish(options, value)
  if (direct) return direct

  // Retry with the state spelled the other way round.
  for (const alias of withSubdivisionAliases(value)) {
    const hit = pickExactish(options, alias)
    if (hit) return hit
  }

  return null
}

/**
 * Words that say WHICH thing of this name, rather than naming another thing.
 *
 * Deliberately tiny. An earlier version of this list included "framework" and
 * "library", and that is not a qualifier at all: "Python Frameworks" is a
 * different skill from "Python (Programming Language)", and having it in here
 * ranked it ABOVE the language, because the tail was shorter. Reported live on
 * Python, Java and React.
 *
 * A skills taxonomy lists the language C as "C (Programming Language)" and
 * C++ as "C++ Programming Language", alongside "C design" and "C++ STL",
 * which are different things that merely start the same way. The first two
 * are the entry for what was asked for; the last two are not.
 *
 * Reported live: Ditto took "C design" over "C (Programming Language)" and
 * "C++ STL" over "C++ Programming Language", because it took the first option
 * that started with the right characters and stopped looking.
 */
const QUALIFIERS = new Set([
  "programming",
  "language",
  "languages",
  "coding",
  // "Docker (Software)" and "Pandas (Software)" are the entries for Docker and
  // pandas. "Docker Swarm" is a different product that starts the same way.
  "software"
])

/**
 * How well one option answers the wanted value. Higher is better, 0 is no.
 *
 * Scored rather than taken in strategy order, because the strategies overlap:
 * several options can start with the same word and only one of them is the
 * thing being named.
 */
function score(text: string, wanted: string, raw: string, rawWanted: string): number {
  if (!text) return 0
  if (text === wanted) return 1000

  /**
   * The name written out with the wanted value as its abbreviation:
   * "Structured Query Language (SQL)".
   *
   * Read off the RAW text, because the parentheses are what make this a
   * different claim from merely ending in the same word. Canonicalising drops
   * them, and without them "Documentum Java" ends in "Java" exactly as much
   * as "(SQL)" ends in SQL, which is how a document management product got
   * offered as the Java programming language.
   */
  if (raw.toLowerCase().trim().endsWith("(" + rawWanted.toLowerCase().trim() + ")")) return 700

  // "C" answered by "C (Programming Language)": the extra words say which C,
  // they do not name something else.
  if (text.startsWith(wanted + " ")) {
    const rest = text.slice(wanted.length + 1)
    if (rest.split(" ").every((word) => QUALIFIERS.has(word))) return 900 - Math.min(rest.length, 99)

    /**
     * Extra words that are not qualifiers usually name something else.
     *
     * Kept, but only while they are shorter than the name they follow.
     * "Bachelor of Science (BS)" is the degree that was asked for; "Java
     * Persistence API" is not Java, and "C design" is not C. The tail being
     * longer than the head is the tell.
     */
    if (rest.length > wanted.length) return 0

    return 500 - Math.min(rest.length, 99)
  }


  /**
   * The option is shorter than what was asked for, and is a whole leading
   * word of it: "United States" for "United States of America".
   *
   * Word boundary, not any substring. "FASTA" is a substring of "FastAPI" and
   * is a completely different thing, and Ditto put it in a skills list.
   */
  if (wanted.startsWith(text + " ")) return 250

  return 0
}

function pickExactish(options: FieldOption[], value: string): FieldOption | null {
  const wanted = canonical(value)
  if (!wanted) return null

  let best: { option: FieldOption; score: number } | null = null

  for (const option of options) {
    for (const raw of [option.label, option.value]) {
      if (!raw) continue

      const points = score(canonical(raw), wanted, raw, value)
      if (points > (best?.score ?? 0)) best = { option, score: points }
    }
  }

  if (best) return best.option

  /**
   * Short words count when they carry a number.
   *
   * The length filter is there so "of" and "the" do not decide a match, but
   * it also threw away the only token that distinguished one option from
   * another: "Skill 18" and "Skill 01" both reduced to the single word
   * "skill" and scored a perfect overlap against each other. Anything with a
   * digit in it is doing work, whatever its length.
   */
  const wantedWords = wanted.split(" ").filter((w) => w.length > 2 || /\d/.test(w))
  if (wantedWords.length === 0) return null

  let overlap: { option: FieldOption; score: number } | null = null

  for (const option of options) {
    for (const text of labelsOf(option)) {
      const words = text.split(" ").filter((w) => w.length > 2 || /\d/.test(w))
      const found = new Set(words)
      const hits = wantedWords.filter((w) => found.has(w)).length

      const covered = hits / wantedWords.length
      /**
       * How much of the OPTION the match accounts for.
       *
       * Counting only the other direction, one word in common out of three
       * scored a perfect match: "Java Persistence API" answered "Java", and
       * on a skills list that is a claim the user never made. An option is
       * the same thing as the value only if each is most of the other.
       */
      const accounted = words.length === 0 ? 0 : hits / words.length

      const ratio = Math.min(covered, accounted)
      if (ratio > (overlap?.score ?? 0)) overlap = { option, score: ratio }
    }
  }

  return overlap && overlap.score >= 0.6 ? overlap.option : null
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
