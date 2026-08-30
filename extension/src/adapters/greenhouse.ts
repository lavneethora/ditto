import type { Adapter, MatchRule } from "~core/types"

/**
 * Greenhouse.
 *
 * Two generations are in the wild and both are common:
 *
 * - Legacy boards (`boards.greenhouse.io`) render a plain server-side form
 *   with predictable ids: `#first_name`, `#last_name`, `#email`, `#phone`,
 *   `#resume`, and custom questions as `question_<id>`. Selects are sometimes
 *   Select2 widgets over a real `<select>`, so the native element is still
 *   there to drive.
 *
 * - Newer boards (`job-boards.greenhouse.io`) are React with proper
 *   `<label for>` associations, which the shared label resolver already
 *   handles.
 *
 * Greenhouse also embeds into company career sites through `#grnhse_iframe`,
 * whose src is a greenhouse.io origin. The content script runs in all frames
 * to reach it, which is why detection here works off the document rather than
 * off the top-level URL.
 */

/**
 * Greenhouse names its inputs predictably, so these rules key on the `name`
 * attribute that the shared label resolver falls back to when a legacy board
 * ships no usable label text.
 */
const RULES: MatchRule[] = [
  // Legacy Greenhouse asks for LinkedIn as a custom question whose label is
  // often just "LinkedIn Profile", already covered, but some boards label the
  // field "Website" while naming it for LinkedIn.
  { key: "links.linkedin", test: /\blinkedin\b/, weight: 100 },

  // "Are you legally authorized..." on Greenhouse is frequently phrased with
  // "work authorization" inside a longer sentence.
  { key: "eeo.authorizedUS", test: /\bwork\s+authorization\b/, invert: false, weight: 85 },

  // Greenhouse's demographic section labels the self-identification questions
  // with a leading "Please select" that the shared rules would otherwise miss.
  { key: "eeo.gender", test: /\bgender\s+identity\b/, weight: 95 },
  { key: "eeo.veteran", test: /\bveteran\s+status\b/, weight: 95 },
  { key: "eeo.disability", test: /\bdisability\s+status\b/, weight: 95 }
]

/**
 * Controls that exist on the page but are not part of the application form.
 * Greenhouse renders a job-alert signup and a location filter on some boards,
 * and filling those does nothing useful.
 */
function ignore(el: Element): boolean {
  if (el.closest("#job_alert, .job-alert, [data-mapped='job_alerts']")) return true
  if (el.closest("nav, header, footer")) return true

  // The "Autofill with Greenhouse" resume parser upload is a different control
  // from the application's own resume field and re-parses the whole form.
  if (el.closest("[data-provides='resume-parser'], .autofill-block")) return true

  return false
}

export const greenhouse: Adapter = {
  id: "greenhouse",
  name: "Greenhouse",

  detect(doc, url) {
    if (/(^|\.)greenhouse\.io$/.test(safeHost(url))) return true

    // Embedded on a company career site.
    if (doc.getElementById("grnhse_app") || doc.getElementById("grnhse_iframe")) return true

    // Legacy markup fingerprint, for boards served from a custom domain.
    return Boolean(doc.querySelector("#application_form, form#application-form, [data-mapped='application']"))
  },

  root(doc) {
    return (
      doc.querySelector<HTMLElement>("#application_form") ??
      doc.querySelector<HTMLElement>("form#application-form") ??
      doc.querySelector<HTMLElement>("#grnhse_app") ??
      doc.querySelector<HTMLElement>("main") ??
      doc.body
    )
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
