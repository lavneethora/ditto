/**
 * Resolving the human label for a control.
 *
 * This is the highest-leverage code in the engine. The matcher can only be as
 * good as the label it is given, and across the four target ATS the label
 * lives in six different places. Greenhouse's newer boards use `<label for>`,
 * its older ones use only a `name`, Workday hangs everything off
 * `aria-labelledby`, and Ashby keys fields by adjacent text with no `for` at
 * all.
 *
 * Strategies run in descending order of trustworthiness, and the first one
 * that yields non-empty text wins.
 */

/**
 * Every character seen used as a "this field is required" marker.
 *
 * Not just the ASCII asterisk: Lever marks required fields with U+2731 HEAVY
 * ASTERISK, so a label comes through as "Full name\u2731" and a required check
 * that only knows about `*` misses it entirely.
 */
const REQUIRED_MARKS = /[*\u2217\u2731\u2732\u2733\uff0a\u066d]/g

/** Collapse whitespace, drop the required marker, normalize punctuation. */
export function normalizeLabel(raw: string): string {
  return raw
    .replace(/[\u00a0\u200b]/g, " ")
    .replace(REQUIRED_MARKS, " ")
    .replace(/\(required\)|\(optional\)/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Lowercased, punctuation-stripped form used for pattern matching. */
export function canonical(raw: string): string {
  return normalizeLabel(raw)
    .toLowerCase()
    .replace(/[^a-z0-9+#\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Visible text of an element, excluding nested form controls.
 *
 * A wrapping `<label>` often contains the input itself plus its options, and
 * including that text turns "Do you have a disability?" into
 * "Do you have a disability? Yes No Decline to state".
 */
function ownText(el: Element): string {
  const clone = el.cloneNode(true) as HTMLElement

  // Beyond the controls themselves, drop the chrome that lives inside a
  // field wrapper and is never part of its label: typeahead dropdowns, and
  // live regions whose whole job is announcing transient status.
  //
  // Lever's location field wraps its dropdown inside the same <label> as the
  // input, so without this the label resolves to "Current location No
  // location found. Try entering a different location Loading", which then
  // fails an exact-match rule and falls through to the wrong one.
  clone
    .querySelectorAll(
      "input, select, textarea, button, option, svg, script, style," +
        " [aria-live], [role='log'], [role='status'], [role='alert']," +
        " [class*='dropdown'], [class*='autocomplete'], [class*='typeahead']"
    )
    .forEach((n) => n.remove())

  return normalizeLabel(clone.textContent ?? "")
}

function byAriaLabelledBy(el: Element, doc: Document): string {
  const ids = el.getAttribute("aria-labelledby")
  if (!ids) return ""

  return normalizeLabel(
    ids
      .split(/\s+/)
      .map((id) => doc.getElementById(id))
      .filter((n): n is HTMLElement => Boolean(n))
      .map((n) => ownText(n))
      .join(" ")
  )
}

/**
 * Label from an enclosing `role="group"` that names itself via aria-labelledby.
 *
 * This is how Greenhouse labels its resume upload: the `<input type=file>` is
 * visually hidden with its own label reading only "Attach", while the useful
 * text, "Resume/CV", sits on the wrapping group. Three other buttons in that
 * group are also labelled "Attach", so the input's own label is both useless
 * for matching and wrong in the drawer.
 */
function byGroupLabel(el: Element, doc: Document): string {
  const group = el.closest("[role='group'][aria-labelledby], fieldset[aria-labelledby]")
  if (!group) return ""

  return byAriaLabelledBy(group, doc)
}

function byLabelFor(el: Element, doc: Document): string {
  const id = el.getAttribute("id")
  if (!id) return ""

  // Attribute selector rather than getElementById, and escaped, because
  // Greenhouse ids contain characters that break a bare CSS selector.
  const escaped = id.replace(/["\\]/g, "\\$&")
  const label = doc.querySelector(`label[for="${escaped}"]`)

  return label ? ownText(label) : ""
}

function byWrappingLabel(el: Element): string {
  const label = el.closest("label")
  return label ? ownText(label) : ""
}

/**
 * Text from the nearest enclosing field container.
 *
 * Ashby and Workday both wrap a control and its label in a div with no `for`
 * relationship. Walking up a bounded number of ancestors and taking the first
 * that has its own text is the only thing that finds those.
 */
function byFieldContainer(el: Element): string {
  const MAX_DEPTH = 5
  let node: Element | null = el.parentElement

  for (let depth = 0; depth < MAX_DEPTH && node; depth++) {
    // A container holding many controls is a fieldset, not a field. Its text
    // is a section heading and would mislabel every control inside it.
    const controls = node.querySelectorAll("input, select, textarea").length

    if (controls <= 1) {
      const text = ownText(node)
      if (text) return text
    }

    node = node.parentElement
  }

  return ""
}

/** The legend of a radio or checkbox group. */
function byFieldsetLegend(el: Element): string {
  const fieldset = el.closest("fieldset")
  const legend = fieldset?.querySelector("legend")
  return legend ? ownText(legend) : ""
}

function byAttributes(el: Element): string {
  const direct =
    el.getAttribute("aria-label") ||
    el.getAttribute("placeholder") ||
    el.getAttribute("title") ||
    ""

  if (direct.trim()) return normalizeLabel(direct)

  // Last resort: humanize the name or id. "first_name" becomes "first name",
  // "job_application[first_name]" becomes "first name".
  const raw = el.getAttribute("name") || el.getAttribute("id") || ""
  if (!raw) return ""

  const inner = raw.match(/\[([^\]]+)\]\s*$/)?.[1] ?? raw

  return normalizeLabel(
    inner
      .replace(/[_\-.]+/g, " ")
      // camelCase to spaced words
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
  )
}

/**
 * Resolve the best available label for a control.
 *
 * Order matters: explicit associations first, structural guesses next,
 * attribute fallbacks last. `aria-labelledby` outranks `label[for]` because
 * Workday sets both and only the former carries the question text.
 */
export function resolveLabel(el: Element, doc: Document = el.ownerDocument): string {
  // A file input's own label is almost always a generic verb ("Attach",
  // "Upload", "Choose file") shared with sibling buttons, so the enclosing
  // group's label is both more specific and more accurate.
  const isFileInput = el instanceof HTMLInputElement && el.type === "file"

  const strategies = [
    ...(isFileInput ? [() => byGroupLabel(el, doc)] : []),
    () => byAriaLabelledBy(el, doc),
    () => byLabelFor(el, doc),
    () => byWrappingLabel(el),
    () => byFieldsetLegend(el),
    () => byGroupLabel(el, doc),
    () => byFieldContainer(el),
    () => byAttributes(el)
  ]

  for (const strategy of strategies) {
    const label = strategy()
    if (label) return label
  }

  return ""
}

/**
 * The question for a radio or checkbox group.
 *
 * A group's question is the text in its container that is not part of any
 * option, so this removes each option's row and reads what is left.
 *
 * Reading the container's text wholesale is what a naive implementation does,
 * and on a US equal-employment block it produces a label containing every
 * option's legal description. That text mentions "Hispanic or Latino", so the
 * matcher scored it as the Hispanic question, weight 90, over the race
 * question at 80, and then tried to answer a race dropdown with "no". The
 * question is "Race"; everything after it belongs to the options.
 */
export function resolveGroupLabel(inputs: Element[]): string {
  if (inputs.length === 0) return ""

  // Smallest element containing every member of the group.
  let container: Element | null = inputs[0].parentElement
  while (container && !inputs.every((input) => container!.contains(input))) {
    container = container.parentElement
  }

  for (let depth = 0; depth < 4 && container; depth++) {
    const clone = container.cloneNode(true) as HTMLElement

    // Drop each option's row, not just its input, so the option's own text
    // goes with it.
    clone.querySelectorAll("input[type='radio'], input[type='checkbox']").forEach((input) => {
      // The option's text may be a sibling rather than an ancestor. Ashby
      // associates it with `label[for]` and renders it outside the input's
      // wrapper, so removing only the ancestor leaves every option's text
      // behind and the question comes out as the whole list.
      const id = input.getAttribute("id")
      if (id) {
        clone
          .querySelectorAll(`label[for="${id.replace(/["\\]/g, "\\$&")}"]`)
          .forEach((associated) => associated.remove())
      }

      const row = input.closest("label, li, [role='radio'], [role='option'], [class*='option']")
      if (row && row !== clone) row.remove()
      else input.remove()
    })

    const text = ownText(clone)
    if (text) return text

    container = container.parentElement
  }

  return ""
}

/**
 * Nearest heading above the control, used to tell repeated blocks apart.
 * "Education 2" and "Work Experience 1" are otherwise indistinguishable when
 * both contain a field labelled "Start Date".
 */
export function resolveSection(el: Element): string | undefined {
  const HEADING = "h1, h2, h3, h4, h5, h6, legend, [role='heading']"
  let node: Element | null = el

  // Walk up, and at each level look backwards for the closest preceding heading.
  for (let depth = 0; depth < 12 && node; depth++) {
    let sibling: Element | null = node.previousElementSibling

    while (sibling) {
      if (sibling.matches(HEADING)) {
        const text = ownText(sibling)
        if (text) return text
      }

      const nested = sibling.querySelectorAll(HEADING)
      const last = nested[nested.length - 1]
      if (last) {
        const text = ownText(last)
        if (text) return text
      }

      sibling = sibling.previousElementSibling
    }

    node = node.parentElement
  }

  return undefined
}

/**
 * Whether a control is required.
 *
 * Checks the accessible signals first, then falls back to the asterisk, which
 * is how Greenhouse and Workday both actually mark required fields regardless
 * of what the attributes say.
 */
export function isRequired(el: Element, label: string): boolean {
  if (el.hasAttribute("required")) return true
  if (el.getAttribute("aria-required") === "true") return true

  // The raw label still carries its marker; the normalized one does not.
  if (new RegExp(REQUIRED_MARKS.source).test(label)) return true

  const container = el.closest("[class*='required'], [data-required='true']")
  if (container) return true

  const wrapper = el.closest("label, div, fieldset")
  const wrapperLabel = wrapper?.querySelector("label, legend, .application-label")?.textContent ?? ""
  if (new RegExp(REQUIRED_MARKS.source).test(wrapperLabel)) return true

  return false
}
