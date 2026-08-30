import { assertAllowed, ForbiddenControlError, isCredentialField, isSubmitByName } from "../blocklist"

/**
 * Low-level DOM writes.
 *
 * Every write in the engine goes through this file, which means every write
 * passes the blocklist and every write notifies React the same way. Duplicating
 * either of those anywhere else is how a submit button eventually gets clicked.
 */

type ValueElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

/**
 * Set a value in a way React notices.
 *
 * Assigning `el.value` directly does not work on a React-controlled input.
 * React tracks the previous value on the DOM node, and on the next render it
 * sees its own stale copy, concludes nothing changed, and overwrites what was
 * typed. Going through the prototype's native setter updates the node without
 * touching React's tracker, so the subsequent `input` event looks exactly like
 * a real keystroke.
 *
 * All four target ATS are React apps, so this is the normal path, not an edge
 * case.
 */
export function setNativeValue(el: ValueElement, value: string): void {
  const prototype = Object.getPrototypeOf(el)
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value")

  if (descriptor?.set) {
    descriptor.set.call(el, value)
  } else {
    el.value = value
  }
}

/** Dispatch the events a real user interaction would produce. */
export function fireInput(el: Element): void {
  el.dispatchEvent(new Event("input", { bubbles: true }))
  el.dispatchEvent(new Event("change", { bubbles: true }))
}

/**
 * Write text into an input or textarea the way a person would.
 *
 * Focus first and blur after, because several ATS validate on blur and will
 * leave a red "required" state on a field that already has the right value.
 */
export function typeInto(el: ValueElement, value: string): void {
  assertAllowed(el)

  el.focus?.()
  setNativeValue(el, value)
  fireInput(el)
  el.blur?.()
}

/**
 * Type a value one character at a time, with the key events a real keyboard
 * produces.
 *
 * Necessary for search-as-you-type widgets. Lever's location field was tested
 * three ways against the live page: setting the value with an `input` event
 * did nothing, adding a single `keyup` did nothing, and only a per-character
 * keydown/input/keyup sequence caused it to run its query and return results.
 * Its handler is watching keystrokes, not the value.
 *
 * Slower than a single write, so this is reserved for controls that need it.
 */
export async function typeSequentially(
  el: HTMLInputElement,
  value: string,
  delayMs = 12
): Promise<void> {
  assertAllowed(el)

  el.focus?.()
  setNativeValue(el, "")
  el.dispatchEvent(new Event("input", { bubbles: true }))

  for (const char of value) {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: char, bubbles: true }))
    setNativeValue(el, el.value + char)
    el.dispatchEvent(new Event("input", { bubbles: true }))
    el.dispatchEvent(new KeyboardEvent("keyup", { key: char, bubbles: true }))

    if (delayMs > 0) await new Promise((done) => setTimeout(done, delayMs))
  }
}

/**
 * Click an element, but only after the blocklist clears it.
 *
 * The engine clicks radios, checkboxes and listbox options. It must never
 * click a submit control, and this is the chokepoint that guarantees it.
 */
export function safeClick(el: Element): void {
  assertAllowed(el)

  withSubmitGuard(el, () => (el as HTMLElement).click())
}

/**
 * Click a control that changes the SHAPE of the form rather than its content.
 *
 * "Add" and "Add Another" are buttons inside the form carrying no type, which
 * by the HTML default makes them submit buttons, so the ordinary gate refuses
 * them and a repeatable section can never be grown. The same reasoning as
 * nextControl applies: the type attribute cannot tell "Add Another" from
 * "Submit", and the words can.
 *
 * Narrower than it looks. The words are still checked, credentials are still
 * refused, and the click is still wrapped in the submit guard, so the worst a
 * misjudged control can do is nothing.
 */
export function clickStructural(el: Element): void {
  if (isCredentialField(el) || isSubmitByName(el)) {
    throw new ForbiddenControlError(el)
  }

  withSubmitGuard(el, () => (el as HTMLElement).click())
}

/**
 * Run a click with any resulting form submission cancelled.
 *
 * Not paranoia: Ashby's Yes/No toggles and Workday's Add buttons are all
 * `type="submit"` inside the form, and they only fail to submit because the
 * site calls preventDefault in its own handler. Relying on someone else's
 * handler for a non-negotiable is not a guarantee. This makes it one.
 */
function withSubmitGuard(el: Element, act: () => void): void {
  const form = el.closest("form")
  const block = (event: Event) => {
    event.preventDefault()
    event.stopImmediatePropagation()
  }

  form?.addEventListener("submit", block, true)

  try {
    act()
  } finally {
    // After the current task, so a handler that submits asynchronously in
    // direct response to this click is still caught.
    setTimeout(() => form?.removeEventListener("submit", block, true), 0)
  }
}

/**
 * Attach files to a file input.
 *
 * `input.files` is read-only, so the only way to set it is to build a
 * DataTransfer and assign its FileList. This is also why the resume has to be
 * rehydrated into a real File rather than kept as base64.
 */
export function attachFiles(input: HTMLInputElement, files: File[]): void {
  assertAllowed(input)

  const transfer = new DataTransfer()
  for (const file of files) transfer.items.add(file)

  input.files = transfer.files
  fireInput(input)
}

/**
 * Drive a dropzone that listens for drag events rather than exposing an input.
 *
 * Workday's resume dropzone ignores a programmatic change on the underlying
 * input in some flows and only commits on a real drop sequence, so this
 * replays the full sequence with the files attached to the event.
 */
export function dropFiles(target: Element, files: File[]): void {
  assertAllowed(target)

  const transfer = new DataTransfer()
  for (const file of files) transfer.items.add(file)

  for (const type of ["dragenter", "dragover", "drop"] as const) {
    const event = new DragEvent(type, { bubbles: true, cancelable: true })

    // DragEvent's dataTransfer is read-only, so it has to be defined onto the
    // instance rather than passed in the constructor.
    Object.defineProperty(event, "dataTransfer", { value: transfer })
    target.dispatchEvent(event)
  }
}

/**
 * Find a control again after a re-render replaced its DOM node.
 *
 * React apps do not always mutate an input in place. Workday commits a write
 * into its own state and then paints a NEW element carrying the value, which
 * leaves the reference captured during the scan detached from the document.
 * The value is on the page, correct and visible, and the element Ditto is
 * holding is a corpse.
 *
 * Read-back then finds nothing and reports "wrote the value but the field did
 * not accept it" over a field the user can see is filled. That is invariant
 * 5.1 failing safe, which is the right direction, but it is still wrong, and a
 * panel that cries wolf on six correct fields is one the user stops reading.
 *
 * Identity comes from what the site itself published, in order of how much it
 * pins the element down. Returns null only when the control is genuinely gone.
 */
export function relocate(el: Element): Element | null {
  if (el.isConnected) return el

  const doc = el.ownerDocument
  if (!doc) return null

  const id = el.getAttribute("id")
  if (id) {
    const found = doc.getElementById(id)
    if (found) return found
  }

  const automation = el.getAttribute("data-automation-id")
  if (automation) {
    const found = doc.querySelector(`[data-automation-id="${CSS.escape(automation)}"]`)
    if (found) return found
  }

  const name = el.getAttribute("name")
  if (name) {
    const found = doc.querySelector(`${el.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`)
    if (found) return found
  }

  return null
}

/** True when the element is still in the document and could accept input. */
export function isLive(el: Element): boolean {
  if (!el.isConnected) return false

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    return !el.disabled
  }

  return true
}
