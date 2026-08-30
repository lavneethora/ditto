import type { Adapter, MatchRule } from "~core/types"

/**
 * Lever.
 *
 * Hosted at `jobs.lever.co/<org>/<id>/apply`, and a plain server-rendered form
 * rather than a React app, which makes it the least troublesome of the four.
 *
 * The things that are not obvious, all confirmed against a live posting:
 *
 * 1. The form id is `application-form`, hyphenated, which is byte-for-byte
 *    what a newer Greenhouse board uses. Detection cannot lean on it.
 * 2. There are no `<label for>` associations and no `aria-label` anywhere.
 *    Each input sits inside a bare `<label>` next to a sibling
 *    `.application-label`, so the shared wrapping-label strategy resolves the
 *    standard fields without help.
 * 3. Radio and checkbox groups defeat that, because each option has its own
 *    wrapping `<label>`. Resolving a group from one of its radios returns
 *    "Yes". The question is on `.application-question > .application-label`,
 *    which is what the `label` hook below is for.
 * 4. `name` is the dependable identifier: name, email, phone, location, org,
 *    resume, and `urls[LinkedIn]` style link fields. Company-specific
 *    questions are `cards[uuid][fieldN]` and correctly stay unmatched.
 */

const RULES: MatchRule[] = [
  // Lever calls the applicant's own location "Current location". The shared
  // rule reads a bare "location" as a past job's location, which would put a
  // previous employer's city into the candidate's address.
  { key: "personal.location", test: /\bcurrent\s+location\b/, weight: 100 },

  // "Current company" is the present employer, which is the first work entry.
  { key: "work[].company", test: /\bcurrent\s+company\b/, weight: 100 },

  // Link fields are named `urls[LinkedIn]`, and the humanised fallback turns
  // that into "linkedin", already covered. These catch boards that label the
  // field with the bare platform name.
  { key: "personal.linkedin", test: /^linked\s?in$/, weight: 100 },
  { key: "personal.github", test: /^git\s?hub$/, weight: 100 }
]

/**
 * Controls that exist but must not be touched.
 *
 * The marketing consent checkbox is the important one. Ticking a marketing
 * opt-in on someone's behalf is not autofill, whatever the profile says, and
 * it is the kind of thing a user would rightly be angry to discover.
 */
function ignore(el: Element): boolean {
  const name = el.getAttribute("name") ?? ""

  if (/^consent\[/.test(name)) return true
  if (/^(?:selectedLocation|accountId|origin|referer|timezone|source|social|resumeStorageId)/.test(name)) {
    return true
  }

  // Lever's own location typeahead dropdown, not a field.
  if (el.closest(".dropdown-container")) return true

  return false
}

export const lever: Adapter = {
  id: "lever",
  name: "Lever",

  hosts: [/(^|\\.)lever\\.co$/],

  detect(doc, url) {
    if (/(^|\.)lever\.co$/.test(safeHost(url))) return true

    // Markup fingerprint for a board proxied behind a company domain. Both
    // markers are Lever's own; the form id alone is shared with Greenhouse.
    return Boolean(doc.querySelector(".application-question, [data-qa='btn-submit']"))
  },

  root(doc) {
    return (
      doc.querySelector<HTMLElement>("form#application-form") ??
      doc.querySelector<HTMLElement>(".application-form") ??
      doc.body
    )
  },

  /**
   * Lever states the question once, on the `.application-label` of the
   * enclosing `.application-question`, and never associates it with the input.
   * For grouped controls that is the only place the question exists.
   */
  label(el) {
    const question = el.closest(".application-question")
    if (!question) return null

    const label = question.querySelector(".application-label")
    if (!label) return null

    // Cloned and stripped rather than read directly, because some Lever
    // fields nest widget chrome inside the label block itself.
    const clone = label.cloneNode(true) as HTMLElement
    clone
      .querySelectorAll("input, select, textarea, button, svg, [class*='dropdown'], [aria-live]")
      .forEach((n) => n.remove())

    // `.text` wraps the question on multiple-choice cards; fall back to the
    // label's own text for the plain fields.
    const text = clone.querySelector(".text")?.textContent ?? clone.textContent

    return text?.trim() || null
  },

  rules: RULES,
  ignore
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ""
  }
}
