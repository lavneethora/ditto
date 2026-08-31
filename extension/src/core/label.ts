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
 * Words that look plural and are not.
 *
 * Every one of these ends in a letter pattern the rules below would strip,
 * and every one of them turns up in a form label.
 */
const NOT_PLURAL = new Set([
  "status",
  "address",
  "business",
  "gas",
  "campus",
  "bonus",
  "previous",
  "various",
  "us",
  "this",
  "his",
  "is",
  "as",
  "was",
  "has",
  "less",
  "plus",
  "yes",
  "class",
  "process",
  "access",
  "progress",
  "series"
])

/** The singular of one word, or the word unchanged. */
function singularWord(word: string): string {
  if (word.length <= 3 || NOT_PLURAL.has(word)) return word
  if (!word.endsWith("s")) return word

  // "companies" -> "company", "disabilities" -> "disability"
  if (word.endsWith("ies")) return word.slice(0, -3) + "y"

  // "addresses" -> "address", "boxes" -> "box", "watches" -> "watch"
  if (/(?:ss|x|z|ch|sh)es$/.test(word)) return word.slice(0, -2)

  // "business", "status", "analysis" keep their endings.
  if (/(?:ss|us|is)$/.test(word)) return word

  return word.slice(0, -1)
}

/**
 * A phrase with each word reduced to its singular.
 *
 * Not for display and not for comparison between two pieces of page text.
 * This exists so a rule written once can recognise a label however the form
 * happened to pluralise it.
 *
 * The alternative was noticing each plural as a user hits it, one regex at a
 * time. Workday labels its veteran question "Veterans status", and `\bveteran\b`
 * cannot match "veterans" because the word boundary has to fall right after
 * the n. A required legal self-identification was skipped over one letter,
 * and there is no reason to think that is the last such letter.
 *
 * Deliberately crude. It only has to make a rule reachable, and anything it
 * gets wrong produces a string no rule matches, which is where the label
 * already was.
 */
export function singularize(text: string): string {
  return text.split(" ").map(singularWord).join(" ")
}

/**
 * The same thing, said differently.
 *
 * Every entry rewrites a phrasing a form actually uses into the one the rules
 * are written in. It is the same idea as the singulariser above and solves the
 * other half of the problem: that half was morphology, this half is vocabulary.
 * A form says "Alma Mater" and the rule says "school"; nothing about the
 * spelling connects them, and adding a regex per phrasing does not converge
 * because there is always another form.
 *
 * Longest phrases first, so "family name" is rewritten before "name".
 *
 * What this is not: it does not understand a question, it recognises a
 * wording. A genuinely novel paraphrase still needs an entry here, and still
 * goes to the user until it has one. That is the right failure: a field the
 * user fills themselves costs them a moment, and a field filled from a guess
 * about what a question meant can put a wrong answer on an application.
 */
const SYNONYMS: ReadonlyArray<readonly [string, string]> = [
  // Names
  ["family name", "last name"],
  ["surname", "last name"],
  ["given name", "first name"],
  ["forename", "first name"],
  ["christian name", "first name"],
  ["legal name", "full name"],
  ["goes by", "preferred name"],
  ["known as", "preferred name"],
  ["nickname", "preferred name"],

  // Contact
  ["e mail", "email"],
  ["telephone", "phone"],
  ["cellular", "phone"],
  ["cell phone", "phone"],
  ["mobile number", "phone"],
  ["mobile", "phone"],
  ["contact number", "phone"],
  ["zip code", "postal code"],
  ["zip", "postal code"],
  ["post code", "postal code"],
  ["postcode", "postal code"],
  ["linked in", "linkedin"],

  // Education
  ["alma mater", "school"],
  ["educational institution", "school"],
  ["academic institution", "school"],
  ["institution attended", "school"],
  ["field of study", "major"],
  ["course of study", "major"],
  ["area of study", "major"],
  ["subject studied", "major"],
  ["qualification", "degree"],
  ["graduation year", "graduation date"],

  // Work
  ["employer", "company"],
  ["organisation you work for", "company"],
  ["position title", "job title"],
  ["role title", "job title"],
  ["job function", "job title"],
  ["commencement date", "start date"],
  ["date of joining", "start date"],
  ["date joined", "start date"],
  ["date left", "end date"],
  ["leaving date", "end date"],

  // Money
  ["remuneration", "salary"],
  ["compensation expectation", "salary expectation"],
  ["expected pay", "expected salary"],
  ["desired compensation", "desired salary"],
  ["pay expectation", "salary expectation"],

  // Equal employment
  ["ethnic background", "ethnicity"],
  ["racial background", "ethnicity"],
  ["racial identity", "ethnicity"],
  ["heritage", "ethnicity"],
  ["ancestry", "ethnicity"],
  ["gender identity", "gender"],
  ["armed forces", "military"],
  ["service member", "military"],
  ["servicemember", "military"],
  ["differently abled", "disability"],
  ["long term health condition", "disability"],

  // Eligibility
  ["nationality", "citizenship"],
  ["right to work", "authorized to work"],
  ["eligible to work", "authorized to work"],
  ["work permit", "work authorization"],
  ["visa sponsorship", "sponsorship"],
  ["immigration sponsorship", "sponsorship"],
  ["non compete", "noncompete"],
  ["non solicitation", "noncompete"],
  ["non solicit", "noncompete"],
  ["restrictive covenant", "noncompete"],

  // Documents
  ["curriculum vitae", "resume"],
  ["cv", "resume"]
]

/**
 * The label with known phrasings rewritten into the ones the rules use.
 *
 * Applied only when nothing matched as written, so it can turn a miss into a
 * hit and never change an answer that was already correct.
 */
export function normalizeWording(text: string): string {
  let out = ` ${text} `

  for (const [from, to] of SYNONYMS) {
    out = out.split(` ${from} `).join(` ${to} `)
  }

  return out.trim().replace(/\s+/g, " ")
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
    // Toggle buttons carry their option text as their own content, so they
    // are removed outright rather than by finding an enclosing row.
    clone
      .querySelectorAll("[aria-pressed], [role='radio'], [role='switch']")
      .forEach((toggle) => {
        if (toggle !== clone) toggle.remove()
      })

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

      // Not legends. A `<legend>` scopes to its own fieldset, so one found
      // inside a PRECEDING SIBLING is that sibling's label, not this field's
      // section. Workday puts each date in its own fieldset, and without this
      // the To date reported its section as "From".
      const nested = sibling.querySelectorAll("h1, h2, h3, h4, h5, h6, [role='heading']")
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
/**
 * Every label element that names this control.
 *
 * Read raw, marks and all. `ownText` strips `aria-hidden` nodes because a
 * screen reader must not hear decoration, and the required asterisk is almost
 * always `aria-hidden` (the requirement reaches assistive tech through
 * `aria-required` instead). That is correct for naming and wrong for deciding
 * whether a field is required, so this reads the elements directly.
 */
function associatedLabels(el: Element): Element[] {
  const doc = el.ownerDocument
  const found: Element[] = []

  if (el.id) {
    for (const label of doc.querySelectorAll(`label[for="${CSS.escape(el.id)}"]`)) found.push(label)
  }

  const wrapping = el.closest("label")
  if (wrapping) found.push(wrapping)

  // The control's own aria-labelledby, then the nearest ancestor's.
  //
  // A composite widget names itself on its container rather than on the input
  // inside it. Workday's resume upload is a div carrying
  // `aria-labelledby="label18"` wrapping a dropzone, a button and a hidden
  // file input, and the asterisk lives in label18. Read from the input alone
  // there is no label at all, and a required resume reports itself optional.
  /**
   * The legend of the fieldset this control sits in.
   *
   * Workday's questionnaire puts the whole question in a `<legend>` and the
   * required asterisk inside it, often at the end of the last bullet rather
   * than anywhere near the control. Without reading the legend, ten required
   * questions all reported themselves optional.
   */
  const legend = el.closest("fieldset")?.querySelector("legend")
  if (legend) found.push(legend)

  const labelledBy = el.closest("[aria-labelledby]")

  for (const source of new Set([el, labelledBy].filter(Boolean) as Element[])) {
    for (const id of (source.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean)) {
      const target = doc.getElementById(id)
      if (target) found.push(target)
    }
  }

  return found
}

export function isRequired(el: Element, label: string): boolean {
  if (el.hasAttribute("required")) return true
  if (el.getAttribute("aria-required") === "true") return true

  // An explicit false is the author saying optional, and it outranks every
  // inference below. Workday sets it on Middle Name and Phone Extension,
  // which share a wrapper with required siblings, so any rule that reaches
  // for a nearby asterisk marks them required and the drawer then reports a
  // form as incomplete that is not.
  if (el.getAttribute("aria-required") === "false") return false

  // The raw label still carries its marker; the normalized one does not.
  if (new RegExp(REQUIRED_MARKS.source).test(label)) return true

  // The marker survives here even when it was stripped from the label string.
  for (const element of associatedLabels(el)) {
    if (new RegExp(REQUIRED_MARKS.source).test(element.textContent ?? "")) return true
  }

  const container = el.closest("[class*='required'], [data-required='true']")
  if (container) return true

  const wrapper = el.closest("label, div, fieldset")
  const wrapperLabel = wrapper?.querySelector("label, legend, .application-label")?.textContent ?? ""
  if (new RegExp(REQUIRED_MARKS.source).test(wrapperLabel)) return true

  return false
}

