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

const YES_WORDS = [
  "yes",
  "y",
  "true",
  "1",
  "i am",
  "i do",
  "i have",
  // Workday's self-identification questions answer in the first person:
  // "I IDENTIFY AS ONE OR MORE OF THE CLASSIFICATIONS OF PROTECTED VETERANS".
  "i identify",
  "affirmative"
]
const NO_WORDS = [
  "no",
  "n",
  "false",
  "0",
  "i am not",
  "i do not",
  "i don t",
  "i do not identify",
  "negative"
]

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
  // Self-identification forms decline in their own words. Workday's veteran
  // question offers "I DO NOT WISH TO SELF-IDENTIFY", which none of the
  // phrasings above reaches.
  "i do not wish to self identify",
  "i don t wish to self identify",
  "do not wish to self identify",
  "i decline to self identify",
  "i do not want to answer",
  "do not want to answer",
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
/** Any standalone negation, which is what makes an option a "no". */
const NEGATED = /\b(?:not|never|neither|nor)\b/

/**
 * The longest synonym from `words` that this option's text begins with.
 *
 * Length is the measure because a longer phrase is a more specific claim.
 * "I am not a veteran" begins with the affirmative "i am" and with the
 * negative "i am not", and the second one is what the sentence means.
 */
function affinity(option: FieldOption, words: string[]): number {
  let best = 0

  for (const text of labelsOf(option)) {
    for (const word of words) {
      if (text === word || text.startsWith(word + " ")) best = Math.max(best, word.length)
    }
  }

  return best
}

/**
 * Match a yes/no answer.
 *
 * Two guards, both of them for real options seen on a live Workday form whose
 * veteran question offers four answers rather than two.
 *
 * The first is polarity. "I AM NOT A VETERAN" starts with "i am", so a plain
 * search for affirmatives picked it as the YES, and a veteran who said yes
 * was told on their own application that they are not one. An option belongs
 * to whichever side matches it more specifically.
 *
 * The second is the negation guard. "I IDENTIFY AS A VETERAN, JUST NOT A
 * PROTECTED VETERAN" is affirmative right up until the word that reverses it,
 * and it sits beside the option that actually means yes. Nothing carrying a
 * negation can be a yes.
 *
 * Order within a side still decides between survivors, so "No, I do not have
 * a disability" beats "I do not want to answer" for a plain no.
 */
export function pickBoolean(options: FieldOption[], value: boolean): FieldOption | null {
  const wanted = value ? YES_WORDS : NO_WORDS
  const opposite = value ? NO_WORDS : YES_WORDS

  const eligible = options.filter((option) => {
    if (value && labelsOf(option).some((text) => NEGATED.test(text))) return false

    return affinity(option, wanted) >= affinity(option, opposite)
  })

  return bySynonyms(eligible, wanted)
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
 * The shorter ways a degree is listed.
 *
 * A profile says "Bachelor of Science" because that is what the certificate
 * says. A dropdown offers "Bachelor's". Neither string contains the other and
 * they share one word out of three, so without this the two never meet and a
 * required degree goes unanswered.
 */
const DEGREE_ALIASES: ReadonlyArray<readonly [RegExp, string[]]> = [
  [/\bbachelor/, ["Bachelors", "Bachelor", "Bachelor's Degree", "Undergraduate"]],
  [/\bmaster/, ["Masters", "Master", "Master's Degree", "Graduate"]],
  [/\b(?:doctor|phd|ph d)/, ["Doctorate", "PhD", "Doctoral"]],
  [/\bassociate/, ["Associates", "Associate", "Associate's Degree"]],
  [/\b(?:high school|secondary)/, ["High School", "High School Diploma", "Secondary"]]
]

/**
 * Degrees written as their initials, which no word pattern can reach.
 *
 * "BS" shares no word with "Bachelor's Degree". Matched on the whole value
 * rather than as a word inside one, so a school called "BS Abdur Rahman" is
 * not read as a bachelor's.
 */
const DEGREE_INITIALS: ReadonlyMap<string, RegExp> = new Map([
  ["bs", /\bbachelor/],
  ["b s", /\bbachelor/],
  ["ba", /\bbachelor/],
  ["b a", /\bbachelor/],
  ["bsc", /\bbachelor/],
  ["beng", /\bbachelor/],
  ["btech", /\bbachelor/],
  ["ms", /\bmaster/],
  ["m s", /\bmaster/],
  ["ma", /\bmaster/],
  ["msc", /\bmaster/],
  ["meng", /\bmaster/],
  ["mtech", /\bmaster/],
  ["mba", /\bmaster/],
  ["phd", /\bdoctor/],
  ["ph d", /\bdoctor/],
  ["aa", /\bassociate/],
  ["as", /\bassociate/]
])

/** Degree spellings worth trying when the exact wording is not on offer. */
function degreeAliases(value: string): string[] {
  const wanted = canonical(value)

  const initials = DEGREE_INITIALS.get(wanted)
  if (initials) {
    for (const [pattern, spellings] of DEGREE_ALIASES) {
      if (pattern.source === initials.source) return spellings
    }
  }

  for (const [pattern, spellings] of DEGREE_ALIASES) {
    if (pattern.test(wanted)) return spellings
  }

  return []
}

/** The bare answers a profile stores, and the sentences forms offer for them. */
const STATED_ANSWERS: ReadonlyMap<string, string[]> = new Map([
  ["yes", YES_WORDS],
  ["true", YES_WORDS],
  ["no", NO_WORDS],
  ["false", NO_WORDS],
  ["decline", DECLINE_WORDS],
  ["decline to answer", DECLINE_WORDS],
  ["prefer not to say", DECLINE_WORDS]
])

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

  /**
   * A yes, a no or a decline, asked as a sentence.
   *
   * The EEO questions store a tri-state and the form offers "I am not a
   * protected veteran" and "I don't wish to answer". A dropdown reaches this
   * function with the bare word, which scores zero against every one of those
   * and is then thrown away by the length filter for being two letters long,
   * so the veteran question could never be answered on a form that asks it as
   * a dropdown rather than as radios. The radio path has had these synonyms
   * all along; this is the same table, reachable from the other path.
   *
   * After the ordinary matching, so a genuine option labelled "No" still wins
   * on its own merits.
   */
  const stated = STATED_ANSWERS.get(canonical(value))
  if (stated) {
    const hit = bySynonyms(options, stated)
    if (hit) return hit
  }

  /**
   * Retry with the state spelled the other way round, for values that are
   * actually places.
   *
   * A comma is what makes a place: "Lubbock, Texas". Without that test the
   * rewrite fires on any value containing a state name, and "Texas Tech
   * University" became "TX Tech University" — where the two letter token is
   * then dropped as too short, leaving "tech university", which matched
   * ARKANSAS Tech University. A school nobody attended, from a rule about
   * postal abbreviations.
   */
  if (value.includes(",")) {
    for (const alias of withSubdivisionAliases(value)) {
      const hit = pickExactish(options, alias)
      if (hit) return hit
    }
  }

  // And with the shorter ways a degree gets listed.
  for (const alias of degreeAliases(value)) {
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

  /**
   * A jurisdiction or qualifier in parentheses after the whole answer.
   *
   * Workday lists race as "Asian (United States of America)". The tail is
   * longer than the answer, which the rule below reads as naming something
   * else, so every race option was rejected and a required question went
   * unanswered. The parentheses are the difference: "Asian (...)" is Asian,
   * where "Asian Studies" is not.
   *
   * Requires the head to match exactly, so this cannot rescue a partial.
   */
  const head = raw.replace(/\s*\([^)]*\)\s*$/, "")
  if (head !== raw && canonical(head) === wanted) return 850

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

  /**
   * A dialling code, which names a country by carrying its number.
   *
   * "+1" is one short token and the option around it is three words, so the
   * ordinary overlap test rejects it for not accounting for enough of the
   * option. That is the right rule for names and the wrong one for codes:
   * "United States +1" IS the +1 entry, and Greenhouse's phone field went
   * unanswered because of it.
   *
   * Narrow on purpose. Only a value shaped like a dialling code qualifies, so
   * a one word name still has to earn its match the ordinary way.
   */
  if (/^\+\d{1,4}$/.test(wanted) && text.split(" ").includes(wanted)) return 600

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

      /**
       * The first word has to be there.
       *
       * It is the one carrying the identity, and without it two names that
       * share everything else score well enough to pass: "Arkansas Tech
       * University" answered "Texas Tech University" on two words out of
       * three, and a school nobody attended went onto an application.
       */
      if (!found.has(wantedWords[0])) continue

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
