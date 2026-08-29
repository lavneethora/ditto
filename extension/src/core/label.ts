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

/** Collapse whitespace, drop the required marker, normalize punctuation. */
export function normalizeLabel(raw: string): string {
  return raw
    .replace(/[\u00a0\u200b]/g, " ")
    .replace(/\*/g, " ")
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

  clone.querySelectorAll("input, select, textarea, button, option, svg, script, style").forEach((n) => n.remove())

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
  const strategies = [
    () => byAriaLabelledBy(el, doc),
    () => byLabelFor(el, doc),
    () => byWrappingLabel(el),
    () => byFieldsetLegend(el),
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

  // The raw label still has its asterisk; the normalized one does not.
  if (/\*/.test(label)) return true

  const container = el.closest("[class*='required'], [data-required='true']")
  if (container) return true

  const wrapper = el.closest("label, div, fieldset")
  if (wrapper && /\*/.test(wrapper.querySelector("label, legend")?.textContent ?? "")) return true

  return false
}
