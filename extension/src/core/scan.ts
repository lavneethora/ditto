import { isForbidden } from "./blocklist"
import { isRequired, normalizeLabel, resolveGroupLabel, resolveLabel, resolveSection } from "./label"
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
  "[aria-haspopup='listbox']",
  // ARIA toggle groups. Ashby builds its Yes/No questions from two
  // `aria-pressed` buttons over a display:none checkbox, so a scanner that
  // only looks at real inputs sees nothing at all and the question never
  // reaches the panel, in any bucket. A required field that is invisible to
  // the report is worse than one reported as needing attention: the progress
  // bar then says 100% over an incomplete form.
  "[aria-pressed]",
  "[role='radio']",
  "[role='switch']"
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

  // A toggle button is one option of a choice, so it is scanned as part of a
  // group in the same way a radio is.
  if (el.hasAttribute("aria-pressed") || role === "radio" || role === "switch") {
    return "radiogroup"
  }

  return null
}

/** One section of a split date control. */
function isDatePart(el: Element): boolean {
  return el instanceof HTMLInputElement && el.getAttribute("role") === "spinbutton"
}

/**
 * The container holding every section of one date.
 *
 * The nearest `role="group"`, which is what Workday puts on its
 * `dateInputWrapper`. Falls back to the parent so a stray spin button still
 * produces a field rather than disappearing.
 */
function dateGroup(el: Element): HTMLElement | null {
  const group = el.closest("[role='group']") ?? el.parentElement
  return group instanceof HTMLElement ? group : null
}

/** Whether a control is an ARIA toggle rather than a real `<input>`. */
function isToggleElement(el: Element): boolean {
  return (
    !(el instanceof HTMLInputElement) &&
    (el.hasAttribute("aria-pressed") ||
      el.getAttribute("role") === "radio" ||
      el.getAttribute("role") === "switch")
  )
}

/**
 * The toggles that make up one question.
 *
 * Grouped by the nearest container that holds more than one of them, which is
 * how these are always built: a wrapper per question with an option inside it
 * per choice.
 */
function toggleGroup(el: Element, root: Element): Element[] {
  const SELECTOR = "[aria-pressed], [role='radio'], [role='switch']"
  let container: Element | null = el.parentElement

  for (let depth = 0; depth < 4 && container && container !== root; depth++) {
    const found = Array.from(container.querySelectorAll(SELECTOR)).filter(
      (candidate) => !(candidate instanceof HTMLInputElement)
    )

    if (found.length > 1) return found
    container = container.parentElement
  }

  return [el]
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
  const seenCheckboxGroups = new Set<string>()
  const seenCheckboxContainers = new WeakSet<Element>()
  const seenToggleGroups = new WeakSet<Element>()
  const seenDateGroups = new WeakSet<Element>()

  const candidates = Array.from(root.querySelectorAll(CONTROL_SELECTOR))

  for (const el of candidates) {
    if (adapter?.ignore?.(el)) continue

    // The blocklist runs during the scan, so a submit or credential control
    // never even becomes a FieldSpec. See PRD non-negotiables 1 and 2.
    if (isForbidden(el)) continue

    const kind = adapter?.kind?.(el) ?? kindOf(el)
    if (!kind) continue

    if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
      if (el.disabled) continue
      // A select has no readOnly property; only inputs and textareas do.
      if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && el.readOnly) continue
    }

    if (isEffectivelyHidden(el)) continue

    /**
     * A date split across separate spin buttons is one field, not two or three.
     *
     * Workday renders From and To as a `role="group"` holding an MM input and
     * a YYYY input, each `role="spinbutton"` with no type, so a scanner that
     * takes them at face value reports two text fields called "Month" and
     * "Year" per date. Four rows per job, none of which a profile has an
     * answer for, and the real question is never asked.
     */
    if (isDatePart(el)) {
      const wrapper = dateGroup(el)
      if (!wrapper || seenDateGroups.has(wrapper)) continue
      seenDateGroups.add(wrapper)

      const parts = Array.from(
        wrapper.querySelectorAll<HTMLInputElement>("input[role='spinbutton']")
      )

      const rawLabel = adapter?.label?.(wrapper, doc) || resolveLabel(wrapper, doc)

      // The legend that labels this date is not also the block it belongs to.
      // Workday wraps each date in a fieldset whose legend reads "From" or
      // "To", so resolving the section from the group itself reports every
      // date as its own section, and repeat indexes then count dates instead
      // of jobs: the second date of the first job becomes the second job.
      const sectionHost = wrapper.closest("fieldset")?.parentElement ?? wrapper

      fields.push({
        id: nextId("date"),
        el: wrapper,
        // A month and a year with no day is a month field. Whether a day is
        // asked for changes what the profile has to supply.
        kind: parts.some((part) => /\bday\b/i.test(part.getAttribute("aria-label") ?? ""))
          ? "date"
          : "month",
        label: normalizeLabel(rawLabel),
        required: isRequired(el, rawLabel),
        section: resolveSection(sectionHost)
      })

      continue
    }

    // ARIA toggle groups: emit once, keyed on the container.
    if (kind === "radiogroup" && isToggleElement(el)) {
      const toggles = toggleGroup(el, root)
      const container = toggles[0]?.parentElement ?? el

      if (seenToggleGroups.has(container)) continue
      seenToggleGroups.add(container)

      const rawGroupLabel =
        adapter?.label?.(el, doc) ||
        el.closest("fieldset")?.querySelector("legend")?.textContent ||
        resolveGroupLabel(toggles) ||
        resolveLabel(el, doc)

      fields.push({
        id: nextId("toggle"),
        el: toggles[0] as FieldSpec["el"],
        kind: "radiogroup",
        label: normalizeLabel(rawGroupLabel),
        required: isRequired(el, rawGroupLabel ?? ""),
        section: resolveSection(el),
        options: toggles.map((toggle) => ({
          value: toggle.getAttribute("data-option") ?? (toggle as HTMLElement).innerText?.trim() ?? "",
          label: ((toggle as HTMLElement).innerText ?? toggle.textContent ?? "").trim(),
          el: toggle as HTMLElement
        }))
      })

      continue
    }

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
        adapter?.label?.(el, doc) ||
        el.closest("fieldset")?.querySelector("legend")?.textContent ||
        // The question is the container text minus the options' own text.
        resolveGroupLabel(radios) ||
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

    // Checkboxes sharing a name are one multi-select question, not several.
    // Lever's "check all that apply" ships six of them, and reporting six rows
    // for one question makes the panel read as though six things need doing.
    if (kind === "checkbox" && el instanceof HTMLInputElement) {
      // Two ways a set of checkboxes forms one question. Lever gives every box
      // the same name; Ashby gives each the option's own text as its name and
      // relies on a shared fieldset. Grouping only by name misses the second
      // and reports one row per option.
      const sharingName = el.name
        ? Array.from(
            root.querySelectorAll<HTMLInputElement>(
              `input[type='checkbox'][name="${CSS.escape(el.name)}"]`
            )
          )
        : []

      const fieldset = el.closest("fieldset")
      const sharingFieldset = fieldset
        ? Array.from(fieldset.querySelectorAll<HTMLInputElement>("input[type='checkbox']"))
        : []

      const grouped = sharingName.length > 1
      const boxes = grouped ? sharingName : sharingFieldset

      if (boxes.length > 1) {
        if (grouped) {
          if (seenCheckboxGroups.has(el.name)) continue
          seenCheckboxGroups.add(el.name)
        } else {
          if (seenCheckboxContainers.has(fieldset!)) continue
          seenCheckboxContainers.add(fieldset!)
        }

        const groupLabel = normalizeLabel(
          adapter?.label?.(el, doc) || resolveGroupLabel(boxes) || resolveLabel(el, doc)
        )

        fields.push({
          id: nextId("checkboxes"),
          el,
          kind: "multiselect",
          label: groupLabel,
          required: boxes.some((b) => b.required),
          name: grouped ? el.name : undefined,
          section: resolveSection(el),
          options: boxes.map((b) => ({
            value: b.value,
            label: resolveLabel(b, doc) || b.value,
            el: b
          }))
        })

        continue
      }
    }

    const rawLabel = adapter?.label?.(el, doc) ?? resolveLabel(el, doc)
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
