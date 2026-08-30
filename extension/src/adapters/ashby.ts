import type { Adapter, FieldKind, MatchRule, ProfileKey } from "~core/types"

/**
 * Ashby.
 *
 * Hosted at `jobs.ashbyhq.com/<org>/<id>/application`, and a React app that
 * renders the form after load, so detection has to survive an empty first
 * paint. The content script re-detects on mutation, which covers it.
 *
 * The useful part, confirmed against a live posting: every field wrapper
 * carries `data-field-path`. Core fields get stable names
 * (`_systemfield_name`, `_systemfield_email`, `_systemfield_resume`,
 * `_systemfield_location`) while company-specific ones get a UUID. That is an
 * exact identifier where a label is an inference, and it survives a copy
 * change that would break a pattern, so it is consulted before anything else.
 *
 * Groups need help. A radio group is a `<fieldset>` with no `<legend>`; the
 * question is a `<label class="ashby-application-form-question-title">`, and
 * each option's own label is a sibling of its input rather than an ancestor.
 */

/** `data-field-path` values Ashby uses for its built-in fields. */
const SYSTEM_FIELDS: Record<string, ProfileKey> = {
  _systemfield_name: "personal.fullName",
  _systemfield_email: "personal.email",
  _systemfield_phone: "personal.phone",
  _systemfield_resume: "resume",
  _systemfield_location: "personal.location"
}

const RULES: MatchRule[] = [
  // Ashby's "Location" is the applicant's own, so it must not fall through to
  // the shared rule that reads a bare "location" as a past job's.
  { key: "personal.location", test: /^location$/, weight: 100 },
  { key: "personal.linkedin", test: /\blinked\s?in\b/, weight: 100 },
  { key: "personal.github", test: /\bgit\s?hub\b/, weight: 100 }
]

function fieldPath(el: Element): string {
  return el.closest("[data-field-path]")?.getAttribute("data-field-path") ?? ""
}

function ignore(el: Element): boolean {
  if (el.getAttribute("name") === "g-recaptcha-response") return true

  // Ashby renders a file input for each upload slot plus hidden helpers; the
  // real target is the one inside a field entry.
  if (el instanceof HTMLInputElement && el.type === "file" && !fieldPath(el)) return true

  return false
}

export const ashby: Adapter = {
  id: "ashby",
  name: "Ashby",

  hosts: [/(^|\.)ashbyhq\.com$/],

  detect(doc) {
    return Boolean(
      doc.querySelector("[class*='ashby-application-form'], [data-field-path], .ashby-job-posting")
    )
  },

  root(doc) {
    return doc.querySelector<HTMLElement>("form") ?? doc.body
  },

  /**
   * The exact key, where Ashby publishes one.
   *
   * Company-specific questions get a UUID field path, which means nothing to
   * us, so those fall through to label matching and mostly land in NEEDS YOU,
   * which is right: they are not questions the profile has answers to.
   */
  key(el): ProfileKey | null {
    return SYSTEM_FIELDS[fieldPath(el)] ?? null
  },

  /**
   * The question text, which for a group exists only here.
   *
   * A radio or checkbox group is a fieldset with no legend, and each option's
   * label is a sibling of its input, so resolving from the input yields the
   * option rather than the question.
   */
  label(el) {
    const entry = el.closest("fieldset, [class*='_fieldEntry'], [data-field-path]")
    const title = entry?.querySelector(".ashby-application-form-question-title")

    return title?.textContent?.trim() || null
  },

  /**
   * Ashby's location field is react-select behind a plain-looking input.
   * Everything else it renders is an honest control.
   */
  kind(el): FieldKind | null {
    if (fieldPath(el) === "_systemfield_location") return "combobox"
    return null
  },

  rules: RULES,
  ignore
}
