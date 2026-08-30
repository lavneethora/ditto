import { canonical } from "../label"
import type { FieldOption } from "../types"
import { fireInput, safeClick, setNativeValue, typeSequentially } from "./dom"
import { pickText } from "./options"

/**
 * Driving custom dropdowns that are not `<select>`.
 *
 * This is the single most common reason an autofill stalls, and it is exactly
 * the failure the user's own mockup records as "Country: could not open the
 * dropdown". Greenhouse renders both its country field and its custom
 * questions with react-select; Ashby uses the same library; Workday ships its
 * own listbox. None of them expose a native select to write to.
 *
 * The approach is layered rather than clever. Each strategy is attempted in
 * turn and the caller verifies afterwards, so a widget that ignores one path
 * still has a chance at the next, and a widget that ignores all of them
 * reports honestly instead of leaving a value that looks committed but is not.
 *
 * Everything here is synchronous-with-waits because these menus render
 * asynchronously: the options for a country list do not exist in the DOM until
 * a frame or two after the control opens.
 */

const OPEN_WAIT_MS = 60

/**
 * How long to wait for a menu to populate.
 *
 * Generous because some of these are network-backed: Lever's location
 * typeahead queries a places service, so its results are not in the DOM for
 * several hundred milliseconds after the keystroke. Too short a wait reads an
 * empty menu and reports that nothing matched, which is a lie about the
 * widget rather than about the value.
 */
const MAX_WAIT_MS = 1500

function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms))
}

/** Selectors for the popup that appears once a combobox opens. */
const MENU_SELECTORS = [
  "[role='listbox']",
  ".select__menu",
  "[class*='menu-list']",
  "[class*='__menu']",
  // Lever's location typeahead. Its results only exist after a query
  // resolves, which is why the wait loop below polls rather than reads once.
  ".dropdown-container",
  "[class*='dropdown-results']",
  "[data-automation-id='activeListContainer']"
].join(", ")

const OPTION_SELECTORS = [
  "[role='option']",
  ".select__option",
  "[class*='__option']",
  // Lever's place results, captured live: each is
  // <div class="break-word dropdown-location ..." id="location-0">.
  "[class*='dropdown-location']",
  "[class*='dropdown-result']:not([class*='results'])",
  "[data-automation-id='promptOption']",
  "li"
].join(", ")

/**
 * Find the open menu.
 *
 * Searched from the document root rather than from the control, because
 * react-select and Workday both portal their menu to `document.body`, well
 * outside the control's subtree.
 */
function findOpenMenu(doc: Document, control: Element): Element | null {
  const owned = control.getAttribute("aria-controls") ?? control.getAttribute("aria-owns")
  if (owned) {
    const byId = doc.getElementById(owned)
    if (byId) return byId
  }

  const menus = Array.from(doc.querySelectorAll(MENU_SELECTORS))

  // Prefer a menu that actually has options in it.
  return (
    menus.find((menu) => menu.querySelector(OPTION_SELECTORS)) ??
    menus[menus.length - 1] ??
    null
  )
}

function readOptions(menu: Element): FieldOption[] {
  return Array.from(menu.querySelectorAll(OPTION_SELECTORS))
    .map((el) => ({
      value: el.getAttribute("data-value") ?? (el as HTMLElement).innerText ?? el.textContent ?? "",
      label: ((el as HTMLElement).innerText ?? el.textContent ?? "").trim(),
      el: el as HTMLElement
    }))
    .filter((option) => option.label.length > 0)
    // A typeahead renders its empty and loading states as siblings of the
    // results. Selecting "No location found. Try entering a different
    // location" would be worse than selecting nothing.
    .filter((option) => {
      const cls = option.el?.className ?? ""
      return !/no-results|loading|empty|placeholder|disabled/i.test(String(cls))
    })
}

/** Poll for options, since the menu populates a frame or two after opening. */
async function waitForOptions(
  doc: Document,
  control: Element,
  budgetMs: number = MAX_WAIT_MS
): Promise<FieldOption[]> {
  const deadline = Date.now() + budgetMs

  while (Date.now() < deadline) {
    const menu = findOpenMenu(doc, control)

    if (menu) {
      const options = readOptions(menu)

      if (options.length > 0) {
        // Let the list settle before handing it out. A search-backed menu
        // often paints a first batch and then replaces it, and an option
        // captured from the discarded render is detached by the time it is
        // clicked, so the click silently does nothing.
        await sleep(OPEN_WAIT_MS * 2)

        const settled = findOpenMenu(doc, control)
        const after = settled ? readOptions(settled) : []

        return after.length > 0 ? after : options
      }
    }

    await sleep(OPEN_WAIT_MS)
  }

  return []
}

/** Dispatch a full pointer and mouse sequence, which is what these widgets listen for. */
function pressPointer(el: Element): void {
  const options = { bubbles: true, cancelable: true, button: 0, isPrimary: true } as const

  // Hover first. Some lists only commit the option they consider active, and
  // they decide that from pointer movement rather than from the click target.
  el.dispatchEvent(new PointerEvent("pointerover", options))
  el.dispatchEvent(new MouseEvent("mouseover", options))
  el.dispatchEvent(new MouseEvent("mousemove", options))

  el.dispatchEvent(new PointerEvent("pointerdown", options))
  el.dispatchEvent(new MouseEvent("mousedown", options))
  el.dispatchEvent(new PointerEvent("pointerup", options))
  el.dispatchEvent(new MouseEvent("mouseup", options))
  el.dispatchEvent(new MouseEvent("click", options))
}

function pressKey(el: Element, key: string, keyCode: number): void {
  for (const type of ["keydown", "keyup"] as const) {
    el.dispatchEvent(
      new KeyboardEvent(type, { key, code: key, keyCode, which: keyCode, bubbles: true, cancelable: true })
    )
  }
}

/**
 * The handles that open a combobox, in descending order of reliability.
 *
 * The explicit toggle button is best: Greenhouse renders one with
 * `aria-label="Toggle flyout"`, and clicking it is unambiguous. The control
 * wrapper is next. The input itself is last, since some widgets treat a click
 * on the text area as a caret placement rather than an open.
 */
function openHandles(input: Element): Element[] {
  const shell = input.closest(".select__control, [class*='__control'], [role='combobox']") ?? input
  const toggle =
    shell.querySelector("[aria-label*='oggle'], [class*='indicator'], [class*='dropdown']") ?? null

  return [toggle, shell, input].filter((el): el is Element => Boolean(el))
}

export interface ComboboxResult {
  ok: boolean
  /** The option label that was committed, when it worked. */
  value?: string
  reason?: string
}

/**
 * Select a value in a custom dropdown.
 *
 * Returns what it believes happened. The caller still verifies against the
 * DOM, because "believes" is not good enough for a green check. See PRD 5.1.
 */
export async function selectFromCombobox(
  input: HTMLElement,
  wanted: string,
  doc: Document = input.ownerDocument
): Promise<ComboboxResult> {
  const isTextInput = input instanceof HTMLInputElement

  // Phase one: get the menu open. Cheap, and repeated across handles because
  // widgets disagree about which element and which gesture opens them.
  let opened = false

  for (const handle of openHandles(input)) {
    pressPointer(handle)
    await sleep(OPEN_WAIT_MS)

    if (findOpenMenu(doc, input)) {
      opened = true
      break
    }

    input.focus?.()
    pressKey(input, "ArrowDown", 40)
    await sleep(OPEN_WAIT_MS)

    if (findOpenMenu(doc, input)) {
      opened = true
      break
    }
  }

  if (!opened) return { ok: false, reason: "Could not open the dropdown" }

  // Phase two: read the options, typing to filter only if the open menu is
  // empty. Typing is done at most once per query and never once per handle:
  // a per-character type plus a network wait is expensive, and repeating it
  // for every candidate handle made a field that could not be filled take ten
  // seconds to say so.
  let options = await waitForOptions(doc, input, OPEN_WAIT_MS * 4)

  if (options.length === 0 && isTextInput) {
    for (const query of queriesFor(wanted)) {
      await typeSequentially(input as HTMLInputElement, query)
      options = await waitForOptions(doc, input, MAX_WAIT_MS)
      if (options.length > 0) break
    }
  }

  if (options.length === 0) {
    return { ok: false, reason: "The dropdown opened but returned no results" }
  }

  const choice = pickText(options, wanted) ?? exactish(options, wanted)

  if (!choice?.el) {
    return { ok: false, reason: `Opened the dropdown but found no option matching "${wanted}"` }
  }

  const committed = await commit(doc, input, choice)

  if (!committed) {
    // Honest failure rather than a claim the caller would have to disprove.
    // Left uncommitted, the widget clears itself the moment focus moves on,
    // and the panel would be reporting a value the form never received.
    return {
      ok: false,
      reason: `Found "${choice.label}" but the dropdown would not commit it`
    }
  }

  return { ok: true, value: choice.label }
}

/**
 * Click the option and confirm something actually took.
 *
 * Returning as soon as the click is dispatched is not good enough. A stale
 * option element, a list that re-rendered mid-selection, or a widget that
 * wants a keyboard commit all produce a click that does nothing, and these
 * controls then wipe themselves as soon as focus moves to the next field. The
 * result is a value reported as written against a field that ends up empty.
 *
 * So each strategy is followed by a read, and the option is re-found by its
 * text right before use, because the reference captured a moment ago may
 * belong to a render that no longer exists.
 */
async function commit(
  doc: Document,
  input: HTMLElement,
  choice: FieldOption
): Promise<boolean> {
  const before = readComboboxValue(input)

  const fresh = (): HTMLElement | null => {
    const menu = findOpenMenu(doc, input)
    if (!menu) return choice.el ?? null

    const match = Array.from(menu.querySelectorAll<HTMLElement>(OPTION_SELECTORS)).find(
      (el) => (el.innerText ?? el.textContent ?? "").trim() === choice.label
    )

    return match ?? choice.el ?? null
  }

  const took = () => {
    const now = readComboboxValue(input)
    return Boolean(now) && now !== before
  }

  const target = fresh()
  if (target) {
    pressPointer(target)
    await sleep(OPEN_WAIT_MS * 2)
    if (took()) return true
  }

  // Keyboard commit, for lists that only accept their highlighted option.
  input.focus?.()
  pressKey(input, "ArrowDown", 40)
  await sleep(OPEN_WAIT_MS)
  pressKey(input, "Enter", 13)
  await sleep(OPEN_WAIT_MS * 2)
  if (took()) return true

  // One more click, in case the first landed during a re-render.
  const retry = fresh()
  if (retry) {
    pressPointer(retry)
    await sleep(OPEN_WAIT_MS * 3)
    if (took()) return true
  }

  return false
}

/**
 * The strings worth typing to make a menu show the wanted value.
 *
 * A place typeahead queries literally, so "Lubbock, Texas" returns nothing
 * while "Lubbock" returns "Lubbock, TX, USA". Trying the full value first
 * keeps exact-match widgets working; falling back to the leading segment is
 * what makes a search-backed one return anything at all.
 */
function queriesFor(wanted: string): string[] {
  const queries = [wanted]

  const head = wanted.split(",")[0]?.trim()
  if (head && head !== wanted) queries.push(head)

  return queries
}

/** Last-resort match for options whose text carries extra decoration. */
function exactish(options: FieldOption[], wanted: string): FieldOption | null {
  const target = canonical(wanted)
  return options.find((option) => canonical(option.label).startsWith(target)) ?? null
}

/**
 * Read what a combobox currently displays.
 *
 * react-select mirrors the committed value onto the input container's
 * `data-value`, which survives the input itself being cleared after selection.
 * That makes it a more reliable read-back than `input.value`.
 */
export function readComboboxValue(input: HTMLElement): string {
  const container = input.closest("[data-value]")
  const dataValue = container?.getAttribute("data-value")
  if (dataValue) return dataValue

  const shell = input.closest(".select__control, [class*='__control']")
  const single = shell?.querySelector("[class*='singleValue'], [class*='single-value']")
  if (single) return (single as HTMLElement).innerText.trim()

  if (input instanceof HTMLInputElement && input.value) return input.value

  return ""
}
