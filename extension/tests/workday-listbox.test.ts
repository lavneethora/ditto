import { readFileSync } from "node:fs"
import { resolve as resolvePath } from "node:path"
import { beforeEach, describe, expect, it } from "vitest"

import { workday } from "~adapters"
import { selectFromCombobox } from "~core/fill/combobox"
import { scan } from "~core/scan"

/**
 * Workday's listbox button, with its menu open.
 *
 * The widget has no search box, so the value is chosen by reading the list.
 * The menu is portalled to a body-level div outside the form, and the trigger
 * is a toggle rather than an open button.
 */

const FIXTURE = readFileSync(
  resolvePath(__dirname, "../../fixtures/workday-country-menu.html"),
  "utf8"
)

beforeEach(() => {
  document.body.replaceChildren()
  document.body.insertAdjacentHTML("afterbegin", FIXTURE)
})

const trigger = () => document.getElementById("country--country") as HTMLButtonElement

/**
 * Stand in for Workday's own handler: picking an option writes its name onto
 * the trigger and closes the menu. Without this nothing in jsdom changes, and
 * the driver is right to report failure.
 */
function wireSelection(): void {
  for (const option of document.querySelectorAll<HTMLElement>("li[role='option']")) {
    option.addEventListener("click", () => {
      if (option.getAttribute("aria-disabled") === "true") return

      trigger().textContent = option.textContent!.trim()
      trigger().setAttribute("aria-expanded", "false")
      option.closest("[data-popper-placement]")?.remove()
    })
  }
}

describe("choosing from a Workday listbox", () => {
  it("selects the option and reports the name, not the GUID", async () => {
    wireSelection()

    const result = await selectFromCombobox(trigger(), "Canada")

    expect(result.ok).toBe(true)
    expect(result.value).toBe("Canada")
    expect(trigger().textContent).toBe("Canada")
  })

  it("does not press a trigger that is already open", async () => {
    // The button toggles. A driver that tries each handle in turn presses it a
    // second time, closing the menu it just opened, and then reports that the
    // dropdown could not be opened.
    let presses = 0
    trigger().addEventListener("click", () => {
      presses += 1
    })

    wireSelection()
    await selectFromCombobox(trigger(), "Canada")

    expect(presses).toBe(0)
  })

  it("never selects the disabled placeholder", async () => {
    // "Select One" is a real <li role="option">. It is the state the field is
    // already in, so choosing it is indistinguishable from doing nothing.
    wireSelection()

    const result = await selectFromCombobox(trigger(), "Select One")

    expect(result.ok).toBe(false)
    expect(trigger().textContent).toBe("Select One")
  })

  it("reports failure when the widget ignores the click", async () => {
    // No handler wired, so nothing commits. Returning ok here would claim a
    // value the form never received.
    const result = await selectFromCombobox(trigger(), "Canada")

    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/would not commit/)
  })
})

describe("an open menu is not a field", () => {
  it("scans the trigger and not the list behind it", () => {
    // The menu is portalled outside applyFlowPage, and the scan is scoped to
    // it. Without that containment the <ul role="listbox"> reads as a control
    // whose label is every country name run together, and the drawer reports
    // a field the user cannot act on.
    const fields = scan(document, workday)

    expect(fields.map((f) => f.label)).toEqual(["Country"])
    expect(fields[0].kind).toBe("combobox")
  })

  it("still finds the menu when driving the dropdown", () => {
    // The other half of the same fact: the driver searches the whole document,
    // because scoping the option lookup to the root would find nothing.
    expect(document.querySelector("[data-automation-id='applyFlowPage'] [role='listbox']")).toBeNull()
    expect(document.querySelector("[role='listbox']")).not.toBeNull()
  })
})
