import { canonical } from "../label"
import type { FieldOption } from "../types"
import { fireInput, safeClick, setNativeValue } from "./dom"
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
const MAX_WAIT_MS = 600

function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms))
}

/** Selectors for the popup that appears once a combobox opens. */
const MENU_SELECTORS = [
  "[role='listbox']",
  ".select__menu",
  "[class*='menu-list']",
  "[class*='__menu']",
  "[data-automation-id='activeListContainer']"
].join(", ")

const OPTION_SELECTORS = [
  "[role='option']",
  ".select__option",
  "[class*='__option']",
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
}

/** Poll for options, since the menu populates a frame or two after opening. */
async function waitForOptions(doc: Document, control: Element): Promise<FieldOption[]> {
  const deadline = Date.now() + MAX_WAIT_MS

  while (Date.now() < deadline) {
    const menu = findOpenMenu(doc, control)
    if (menu) {
      const options = readOptions(menu)
      if (options.length > 0) return options
    }

    await sleep(OPEN_WAIT_MS)
  }

  return []
}

/** Dispatch a full pointer and mouse sequence, which is what these widgets listen for. */
function pressPointer(el: Element): void {
  const options = { bubbles: true, cancelable: true, button: 0, isPrimary: true } as const

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

  for (const handle of openHandles(input)) {
    pressPointer(handle)
    await sleep(OPEN_WAIT_MS)

    // Some widgets only open on a keyboard gesture.
    if (!findOpenMenu(doc, input)) {
      input.focus?.()
      pressKey(input, "ArrowDown", 40)
      await sleep(OPEN_WAIT_MS)
    }

    // Typing narrows a long list. A country dropdown renders 200 options and
    // the wanted one is often virtualized out of the DOM until filtered.
    if (isTextInput) {
      setNativeValue(input as HTMLInputElement, wanted)
      fireInput(input)
      await sleep(OPEN_WAIT_MS * 2)
    }

    const options = await waitForOptions(doc, input)
    if (options.length === 0) continue

    const choice = pickText(options, wanted) ?? exactish(options, wanted)
    if (!choice?.el) {
      return {
        ok: false,
        reason: `Opened the dropdown but found no option matching "${wanted}"`
      }
    }

    // Options usually commit on mousedown, not click.
    pressPointer(choice.el)
    await sleep(OPEN_WAIT_MS)

    // Enter as a fallback for widgets that commit the highlighted option.
    if (findOpenMenu(doc, input)) {
      pressKey(input, "Enter", 13)
      await sleep(OPEN_WAIT_MS)
    }

    return { ok: true, value: choice.label }
  }

  return { ok: false, reason: "Could not open the dropdown" }
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
