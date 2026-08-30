import { isForbidden } from "./blocklist"
import { isRequired, normalizeLabel, resolveLabel, resolveSection } from "./label"
import type { Adapter, FieldKind, FieldOption, FieldSpec } from "./types"

/**
 * Walks the DOM and produces the list of fields the engine could fill.
 *
 * Scanning is deliberately separate from matching. This layer answers "what
 * controls exist and what are they called", and knows nothing about profiles.
 * That split is what lets `npm run score` measure recognition on saved HTML
 * without a profile or a browser.
 */

const CONTROL_SELECTOR = [
  "input",
  "select",
  "textarea",
  "[role='combobox']",
  "[role='listbox']",
  "[aria-haspopup='listbox']"
].join(", ")

/** Input types that are never a data field. */
const IGNORED_INPUT_TYPES = new Set(["submit", "button", "reset", "image", "hidden", "password"])

/**
 * Visibility test that behaves in both a real browser and jsdom.
 *
 * jsdom has no layout, so `offsetParent` and `getBoundingClientRect` are
 * useless there. Computed style is the only signal available in both, so this
 * checks the properties an author actually sets to hide things.
 */
function isVisible(el: Element): boolean {
  if (el.hasAttribute("hidden")) return false
  if (el.getAttribute("aria-hidden") === "true") return false

  let node: Element | null = el

  for (let depth = 0; depth < 20 && node; depth++) {
    if (node.hasAttribute?.("hidden")) return false

    const style = node.ownerDocument.defaultView?.getComputedStyle(node)
    if (style) {
      if (style.display === "none") return false
      if (style.visibility === "hidden" || style.visibility === "collapse") return false
    }

    node = node.parentElement
  }

  return true
}

/**
 * File inputs are exempt from the visibility check.
 *
 * Every one of the four target ATS hides the real `<input type=file>` behind a
 * styled button or a dropzone. The hidden input is the actual attach target,
 * so skipping invisible ones would mean never attaching a resume anywhere.
 */
function isEffectivelyHidden(el: Element): boolean {
  if (el instanceof HTMLInputElement && el.type === "file") return false
  return !isVisible(el)
}

function kindOf(el: Element): FieldKind | null {
  if (el instanceof HTMLTextAreaElement) return "textarea"
  if (el instanceof HTMLSelectElement) return el.multiple ? "multiselect" : "select"

  if (el instanceof HTMLInputElement) {
    const type = el.type.toLowerCase()

    if (IGNORED_INPUT_TYPES.has(type)) return null
    if (type === "file") return "file"
    if (type === "checkbox") return "checkbox"
    if (type === "radio") return "radiogroup"
    if (type === "date") return "date"
    if (type === "month") return "month"

    // A text input wired to a listbox is a combobox, not a text field.
    if (el.getAttribute("role") === "combobox" || el.getAttribute("aria-haspopup") === "listbox") {
      return "combobox"
    }

    return "text"
  }

  const role = el.getAttribute("role")
  if (role === "combobox" || role === "listbox" || el.getAttribute("aria-haspopup") === "listbox") {
    return "combobox"
  }

  return null
}

function selectOptions(el: HTMLSelectElement): FieldOption[] {
  return Array.from(el.options)
    // A blank leading option is a prompt, not a choice.
    .filter((option) => option.value !== "" || normalizeLabel(option.text) !== "")
    .map((option) => ({ value: option.value, label: normalizeLabel(option.text) }))
}

/**
 * Options for a radio group, resolved from the group's own labels rather than
 * the group container's, which is the question text.
 */
function radioOptions(radios: HTMLInputElement[], doc: Document): FieldOption[] {
  return radios.map((radio) => ({
    value: radio.value,
    label: resolveLabel(radio, doc) || radio.value,
    el: radio
  }))
}

let counter = 0

function nextId(prefix: string): string {
  counter += 1
  return `${prefix}-${counter}`
}

/** Reset between scans so ids stay stable and comparable in tests. */
export function resetFieldIds(): void {
  counter = 0
}

/**
 * Number repeated blocks so a matched key can be paired with the right entry.
 *
 * Two fields both labelled "School" in sections "Education 1" and
 * "Education 2" must resolve to education[0] and education[1]. Ordinal in the
 * section heading is the most reliable signal; otherwise fall back to the
 * order distinct sections were encountered.
 */
function assignRepeatIndexes(fields: FieldSpec[]): void {
  const seen = new Map<string, number>()

  for (const field of fields) {
    if (!field.section) continue

    const ordinal = field.section.match(/\b(\d+)\s*$/)
    if (ordinal) {
      field.repeatIndex = Math.max(0, Number(ordinal[1]) - 1)
      continue
    }

    const base = field.section.toLowerCase().replace(/\d+/g, "").trim()
    if (!seen.has(base)) seen.set(base, seen.size)
    field.repeatIndex = seen.get(base)
  }
}

/**
 * Scan a document for fillable fields.
 *
 * Radios sharing a `name` collapse into a single `radiogroup` field, because
 * the user answers one question, not three, and the drawer should say so.
 */
export function scan(doc: Document, adapter?: Adapter): FieldSpec[] {
  resetFieldIds()

  const root = adapter?.root?.(doc) ?? doc.body
  if (!root) return []

  const fields: FieldSpec[] = []
  const seenRadioGroups = new Set<string>()

  const candidates = Array.from(root.querySelectorAll(CONTROL_SELECTOR))

  for (const el of candidates) {
    if (adapter?.ignore?.(el)) continue

    // The blocklist runs during the scan, so a submit or credential control
    // never even becomes a FieldSpec. See PRD non-negotiables 1 and 2.
    if (isForbidden(el)) continue

    const kind = kindOf(el)
    if (!kind) continue

    if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
      if (el.disabled) continue
      // A select has no readOnly property; only inputs and textareas do.
      if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && el.readOnly) continue
    }

    if (isEffectivelyHidden(el)) continue

    // Radio groups: emit once, keyed on the shared name.
    if (kind === "radiogroup" && el instanceof HTMLInputElement) {
      const groupName = el.name

      if (groupName) {
        if (seenRadioGroups.has(groupName)) continue
        seenRadioGroups.add(groupName)
      }

      const radios = groupName
        ? Array.from(root.querySelectorAll<HTMLInputElement>(`input[type='radio'][name="${CSS.escape(groupName)}"]`))
        : [el]

      // The group's question is the fieldset legend or container text, not the
      // label of whichever radio happened to come first.
      const rawGroupLabel =
        el.closest("fieldset")?.querySelector("legend")?.textContent ??
        resolveLabel(radios[0]?.parentElement ?? el, doc)

      const label = normalizeLabel(rawGroupLabel || resolveLabel(el, doc))

      fields.push({
        id: nextId("radio"),
        el,
        kind: "radiogroup",
        label,
        required: radios.some((r) => isRequired(r, rawGroupLabel ?? "")),
        name: groupName || undefined,
        section: resolveSection(el),
        options: radioOptions(radios, doc)
      })

      continue
    }

    const rawLabel = resolveLabel(el, doc)
    const label = normalizeLabel(rawLabel)

    const spec: FieldSpec = {
      id: nextId(kind),
      el: el as FieldSpec["el"],
      kind,
      label,
      required: isRequired(el, rawLabel),
      section: resolveSection(el)
    }

    if (el instanceof HTMLSelectElement) {
      spec.options = selectOptions(el)
    }

    if (el instanceof HTMLInputElement && el.name) {
      spec.name = el.name
    }

    fields.push(spec)
  }

  assignRepeatIndexes(fields)

  return fields
}
