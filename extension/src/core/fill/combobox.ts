import { canonical } from "../label"
import type { FieldOption } from "../types"
import { fireInput, relocate, safeClick, setNativeValue, typeSequentially, withSubmitGuard } from "./dom"
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

/**
 * How long to wait, in total, for a click to show up in the control.
 *
 * Generous, because confirming early is cheap and the cost of giving up too
 * soon is a correct field reported as a failure. Workday fetches the State
 * list the moment a Country is chosen, so the trigger can take well over a
 * second to repaint, and the old fixed 120ms sample called three correct
 * selections "the dropdown would not commit it".
 *
 * A total, not a per-strategy budget. Three generous waits in a row is how a
 * field that genuinely cannot be filled ends up taking five seconds to say so,
 * and a form with four such fields spends twenty seconds looking broken.
 */
const COMMIT_WAIT_MS = 3000

function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms))
}

/** Selectors for the popup that appears once a combobox opens. */
const MENU_SELECTORS = [
  // Not the pill list of what is already chosen. Workday's multiselect renders
  // its current selection as a `<ul role="listbox">` sitting inside the
  // control itself, and each pill is a `[data-automation-id='promptOption']`,
  // so both halves of menu discovery match it. Clicking a "option" in there
  // does not choose anything: the pill's own click target is a delete charm,
  // so the driver would clear the field it was sent to fill and then report
  // success because an option was pressed.
  "[role='listbox']:not([data-automation-id='selectedItemList'])",
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
/**
 * The menu this control opened.
 *
 * `stale` holds the menus that were already in the document when this fill
 * began, and a menu that opened during it is preferred over one that did not.
 * Workday leaves a committed dropdown mounted, so filling Country and then
 * Phone Device Type found the country list still sitting there, read 250
 * countries as the phone type's options, and reported "found no option
 * matching mobile" over a control whose own menu was never consulted.
 *
 * Preference rather than exclusion, because plenty of widgets keep a single
 * menu mounted and merely repopulate it, and for those the pre-existing menu
 * is the right one. A stale menu can never produce a wrong value on its own:
 * clicking an option in another field's list does not change this control, so
 * the commit check fails and the field is reported honestly.
 */
function findOpenMenu(
  doc: Document,
  control: Element,
  stale: ReadonlySet<Element> = new Set()
): Element | null {
  const owned = control.getAttribute("aria-controls") ?? control.getAttribute("aria-owns")
  if (owned) {
    const byId = doc.getElementById(owned)
    if (byId) return byId
  }

  const all = Array.from(doc.querySelectorAll(MENU_SELECTORS))
  const fresh = all.filter((menu) => !stale.has(menu))

  // A menu with options in it beats an empty one, and a fresh menu beats both.
  for (const group of [fresh, all]) {
    const populated = group.find((menu) => menu.querySelector(OPTION_SELECTORS))
    if (populated) return populated
  }

  return fresh[fresh.length - 1] ?? all[all.length - 1] ?? null
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
    // Workday's placeholder row is a real `<li role="option">` reading "Select
    // One", marked `aria-disabled`. It is the value the field already has when
    // empty, so choosing it is indistinguishable from doing nothing, and a
    // fuzzy match on a short profile value could land there.
    .filter(
      (option) =>
        option.el?.getAttribute("aria-disabled") !== "true" && !option.el?.hasAttribute("disabled")
    )
}

/** Poll for options, since the menu populates a frame or two after opening. */
async function waitForOptions(
  doc: Document,
  control: Element,
  budgetMs: number = MAX_WAIT_MS,
  stale: ReadonlySet<Element> = new Set()
): Promise<FieldOption[]> {
  const deadline = Date.now() + budgetMs

  while (Date.now() < deadline) {
    const menu = findOpenMenu(doc, control, stale)

    if (menu) {
      const options = readOptions(menu)

      if (options.length > 0) {
        // Let the list settle before handing it out. A search-backed menu
        // often paints a first batch and then replaces it, and an option
        // captured from the discarded render is detached by the time it is
        // clicked, so the click silently does nothing.
        await sleep(OPEN_WAIT_MS * 2)

        const settled = findOpenMenu(doc, control, stale)
        const after = settled ? readOptions(settled) : []

        return after.length > 0 ? after : options
      }
    }

    await sleep(OPEN_WAIT_MS)
  }

  return []
}

/**
 * Poll until a condition holds, or the budget runs out.
 *
 * Sampling once after a fixed sleep asks "had it happened by 120ms", which is
 * a question about the site's render speed rather than about whether the fill
 * worked. Polling asks the question the caller actually has.
 */
async function waitUntil(condition: () => boolean, budgetMs: number): Promise<boolean> {
  const deadline = Date.now() + budgetMs

  while (Date.now() < deadline) {
    if (condition()) return true
    await sleep(OPEN_WAIT_MS)
  }

  return condition()
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

/**
 * Press a key, with any resulting form submission cancelled.
 *
 * Enter in a text input is the browser's implicit submit gesture, and these
 * widgets are inside the application form. Committing a dropdown must never be
 * able to send the application, so the press goes through the same guard as a
 * click. See PRD non-negotiable 1.
 */
function pressKey(el: Element, key: string, keyCode: number): void {
  withSubmitGuard(el, () => {
    for (const type of ["keydown", "keyup"] as const) {
      el.dispatchEvent(
        new KeyboardEvent(type, {
          key,
          code: key,
          keyCode,
          which: keyCode,
          bubbles: true,
          cancelable: true
        })
      )
    }
  })
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

/**
 * Whether a control already shows the value we were about to select.
 *
 * Strict on purpose. Loose containment would read the dial code "+1" as
 * present in "Australia (+61)", and a false positive here is a green check on
 * a field nobody set, which is the one thing invariant 5.1 exists to stop.
 * `canonical` keeps the plus sign, so "+1" is a whole token and "+61" is a
 * different one.
 */
function alreadyHolds(existing: string, wanted: string): boolean {
  const have = canonical(existing)
  const want = canonical(wanted)

  if (!have || !want) return false
  if (have === want) return true

  return have.split(" ").includes(want)
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

  // Nothing to do if the control already shows the wanted value.
  //
  // Workday pre-fills Country and Country Phone Code from the account, so
  // opening a dropdown to choose the value it is already displaying is work
  // that can only go wrong: the value never changes, the commit check sees
  // nothing take, and a correct field is reported as one the dropdown would
  // not commit. It also leaves a menu open for the next field to trip over.
  //
  // This is not a shortcut around verification. The caller still reads the
  // DOM back and compares, exactly as it does for a value we did write.
  const existing = readComboboxValue(input)
  if (alreadyHolds(existing, wanted)) {
    return { ok: true, value: existing }
  }

  // Anything already open belongs to a field filled before this one.
  const stale: ReadonlySet<Element> = new Set(doc.querySelectorAll(MENU_SELECTORS))

  // Phase one: get the menu open. Cheap, and repeated across handles because
  // widgets disagree about which element and which gesture opens them.
  let opened = false

  // A trigger that is already open must not be pressed again. Workday's
  // Country and State controls are toggle buttons, so the second handle in the
  // list closes the menu the first one opened, and the field then reports that
  // it could not be opened at all.
  //
  // Two signals, and the menu one only counts after a press of our own. Before
  // that, any open menu belongs to the field filled before this one, and
  // treating it as ours means never pressing this control at all.
  let pressed = false
  const alreadyOpen = () =>
    input.getAttribute("aria-expanded") === "true" ||
    (pressed && Boolean(findOpenMenu(doc, input, stale)))

  for (const handle of openHandles(input)) {
    if (alreadyOpen()) {
      opened = true
      break
    }

    pressed = true
    pressPointer(handle)
    await sleep(OPEN_WAIT_MS)

    if (findOpenMenu(doc, input, stale)) {
      opened = true
      break
    }

    input.focus?.()
    pressKey(input, "ArrowDown", 40)
    await sleep(OPEN_WAIT_MS)

    if (findOpenMenu(doc, input, stale)) {
      opened = true
      break
    }
  }

  if (!opened) {
    // A box with no menu at all can still be one that pockets what you type.
    // Workday's Skills showed nothing on screen for "supabase" and accepted
    // it on Enter, so "no menu" is not the same as "nothing can be done".
    if (isTextInput) {
      const accepted = await commitTypedText(doc, input as HTMLInputElement, wanted, stale)
      if (accepted) return { ok: true, value: wanted }
    }

    return { ok: false, reason: "Could not open the dropdown" }
  }

  // Phase two: read the options, typing to filter only if the open menu is
  // empty. Typing is done at most once per query and never once per handle:
  // a per-character type plus a network wait is expensive, and repeating it
  // for every candidate handle made a field that could not be filled take ten
  // seconds to say so.
  let options = await waitForOptions(doc, input, OPEN_WAIT_MS * 4, stale)
  let choice = options.length > 0 ? pickText(options, wanted) ?? exactish(options, wanted) : null

  /**
   * Type to filter, whenever what opened does not already contain the answer.
   *
   * Not only when the menu is empty. Workday's School and Field of Study
   * boxes are search backed: opening them shows a short default list, so the
   * old test saw options, never typed, and reported "found no option matching
   * Texas Tech University" against a list of somebody else's suggestions. The
   * university is in Workday's data; it just has to be asked for.
   */
  if (!choice && isTextInput) {
    for (const query of queriesFor(wanted)) {
      await typeSequentially(input as HTMLInputElement, query)
      options = await waitForOptions(doc, input, MAX_WAIT_MS, stale)

      choice = options.length > 0 ? pickText(options, wanted) ?? exactish(options, wanted) : null
      if (choice) break
    }
  }

  if (!choice?.el) {
    /**
     * Nothing to click, so offer the typed text itself.
     *
     * Some search boxes accept what you typed rather than requiring a pick.
     * Reported live on Workday's Skills box: typing "supabase" showed an
     * empty menu, and pressing Enter with nothing on screen added it anyway.
     * Ditto never got that far, because Enter lived in the commit step and
     * the commit step is only reached once an option has been found.
     *
     * Still held to the same standard as everything else: it counts only if
     * the control's value changes to hold it. On these widgets that means a
     * pill appeared, which is a real signal rather than the box still showing
     * what was typed into it.
     */
    if (isTextInput) {
      const accepted = await commitTypedText(doc, input as HTMLInputElement, wanted, stale)
      if (accepted) return { ok: true, value: wanted }
    }

    return {
      ok: false,
      reason:
        options.length === 0
          ? "The dropdown opened but returned no results"
          : `Opened the dropdown but found no option matching "${wanted}"`
    }
  }

  const committed = await commit(doc, input, choice, stale)

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
 * Offer a search box the typed text, for widgets that take it on Enter.
 *
 * Only reached when there was no option to pick. The value is typed if it is
 * not already in the box, and the read-back has to change for this to count.
 */
async function commitTypedText(
  doc: Document,
  input: HTMLInputElement,
  wanted: string,
  stale: ReadonlySet<Element>
): Promise<boolean> {
  const current = () => readComboboxValue((relocate(input) ?? input) as HTMLElement)
  const before = current()

  if (canonical(input.value) !== canonical(wanted)) {
    await typeSequentially(input, wanted)
  }

  input.focus?.()
  pressKey(input, "Enter", 13)

  /**
   * The widget has to have taken the text OUT of the box.
   *
   * Without that, this cannot tell a box that accepted the value from one
   * that is simply still showing what was typed into it. Lever's location
   * typeahead is the second kind: it discards typed text on blur, and its
   * read-back is the input's own value, so "the value is there" is true right
   * up until the field wipes itself.
   *
   * Workday's Skills box clears itself and shows a pill, which is evidence
   * from somewhere other than the box being read.
   */
  const took = () => {
    const consumed = canonical(input.value) !== canonical(wanted)
    if (!consumed) return false

    const now = current()
    return Boolean(now) && now !== before && alreadyHolds(now, wanted)
  }

  // A short budget. This is the last thing tried before giving up, and a
  // widget that takes typed text does so immediately; waiting longer only
  // slows down every field that genuinely cannot be filled.
  if (!(await waitUntil(took, 800))) return false

  closeMenu(doc, input, stale, took)
  return true
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
  choice: FieldOption,
  stale: ReadonlySet<Element> = new Set()
): Promise<boolean> {
  // Read through relocate: committing makes these widgets re-render, and the
  // trigger Ditto is holding can be replaced by an identical one carrying the
  // new value. Reading the detached original reports a successful pick as a
  // dropdown that would not commit.
  const current = () => readComboboxValue((relocate(input) ?? input) as HTMLElement)
  const before = current()

  const fresh = (): HTMLElement | null => {
    const menu = findOpenMenu(doc, input, stale)
    if (!menu) return choice.el ?? null

    const match = Array.from(menu.querySelectorAll<HTMLElement>(OPTION_SELECTORS)).find(
      (el) => (el.innerText ?? el.textContent ?? "").trim() === choice.label
    )

    return match ?? choice.el ?? null
  }

  const took = () => {
    const now = current()
    if (!now) return false

    // Either the value changed, or it now shows what was picked. The second
    // case covers a control that was already partly right, where a change is
    // not available as evidence.
    return now !== before || alreadyHolds(now, choice.label)
  }

  // One deadline for every strategy below, so the escalation cannot compound.
  const deadline = Date.now() + COMMIT_WAIT_MS
  const budget = (share: number) => Math.min(share, Math.max(0, deadline - Date.now()))

  const target = fresh()
  if (target) {
    pressPointer(target)

    /**
     * A long wait for a button, a short one for a search box.
     *
     * The two seconds are for Workday's listbox buttons, where choosing a
     * Country sends it off to fetch the State list before the trigger
     * repaints. A search box that commits on Enter never repaints from a
     * click at all, so waiting the same two seconds only delays the strategy
     * that works, once per value: on a dozen skills that is half a minute of
     * watching nothing happen.
     *
     * Still click-first for both, because a click lands on the option Ditto
     * chose, while Enter takes whichever the widget has highlighted.
     */
    const clickBudget = input instanceof HTMLInputElement ? 700 : 2000
    if (await waitUntil(took, budget(clickBudget))) return closeMenu(doc, input, stale, took)
  }

  /**
   * Enter, for the widgets whose commit gesture that is.
   *
   * Workday's own instructions above its School box say to type the name and
   * press Enter, and its Skills box behaves the same way. Clicking the option
   * does nothing there, so each value was typed, left uncommitted, and then
   * wiped by the next one typing over it: the user watched twelve skills go
   * in and none stay.
   */
  if (input instanceof HTMLInputElement) {
    input.focus?.()
    pressKey(input, "Enter", 13)
    if (await waitUntil(took, budget(700))) return closeMenu(doc, input, stale, took)
  }

  // Keyboard commit, for lists that only accept their highlighted option.
  //
  // Only reached when the click genuinely did nothing, which matters: on a
  // toggle like Workday's, ArrowDown reopens the menu, so running this after a
  // click that had in fact worked left the dropdown hanging open over the rest
  // of the form.
  input.focus?.()
  pressKey(input, "ArrowDown", 40)
  await sleep(OPEN_WAIT_MS)
  pressKey(input, "Enter", 13)
  if (await waitUntil(took, budget(600))) return closeMenu(doc, input, stale, took)

  // One more click, in case the first landed during a re-render.
  const retry = fresh()
  if (retry) {
    pressPointer(retry)
    if (await waitUntil(took, budget(1000))) return closeMenu(doc, input, stale, took)
  }

  return false
}

/**
 * Put the menu away once the value is in.
 *
 * Workday leaves a committed dropdown open, which looks broken to the user and
 * leaves the next field picking its way around a list of 250 countries. Escape
 * is the documented gesture and the one a person would use.
 *
 * The value is re-checked afterwards, because a widget that treated Escape as
 * "cancel" rather than "close" would otherwise have its revert reported as a
 * success.
 */
function closeMenu(
  doc: Document,
  input: HTMLElement,
  stale: ReadonlySet<Element>,
  took: () => boolean
): boolean {
  if (findOpenMenu(doc, input, stale)) {
    pressKey(input, "Escape", 27)
  }

  return took()
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

  // A listbox button carries its own display value as its text. Workday's
  // Country, State and Phone Device Type are buttons, not inputs, so every
  // other branch here returns nothing and a successful pick verifies as a
  // failure.
  //
  // The empty state is the words "Select One", not an empty string, and
  // reporting that as the value would confirm any fill at all.
  if (input.tagName === "BUTTON" && input.getAttribute("aria-haspopup") === "listbox") {
    const text = (input.innerText ?? input.textContent ?? "").trim()
    return /^select one$/i.test(text) ? "" : text
  }

  // Workday's multiselect keeps the chosen values in pills and clears the
  // search box, so the input's own value is empty or a stale query.
  const multiselect = input.closest("[data-uxi-widget-type='multiselect']")
  if (multiselect) {
    const chosen = Array.from(
      multiselect.querySelectorAll("[data-automation-id='promptOption']")
    )
      .map((el) => el.getAttribute("data-automation-label") ?? el.textContent?.trim() ?? "")
      .filter(Boolean)

    if (chosen.length > 0) return chosen.join(", ")
  }

  const shell = input.closest(".select__control, [class*='__control']")
  const single = shell?.querySelector("[class*='singleValue'], [class*='single-value']")
  if (single) return (single as HTMLElement).innerText.trim()

  if (input instanceof HTMLInputElement && input.value) return input.value

  return ""
}
