import { beforeEach, describe, expect, it } from "vitest"

import { selectFromCombobox } from "~core/fill/combobox"
import { relocate } from "~core/fill/dom"
import type { FieldSpec } from "~core/types"
import { verify } from "~core/verify"

/**
 * Re-rendering, which is what a React ATS does between the write and the read.
 *
 * Reported live on Workday: six text fields visibly held the right value and
 * every one of them was reported as "wrote the value but the field did not
 * accept it". Workday commits a write into its own state and paints a NEW
 * element carrying it, so the reference captured during the scan is detached
 * and the read-back finds nothing.
 *
 * That fails in the safe direction, which is the right direction, and it is
 * still wrong. A panel that cries wolf on six correct fields is one the user
 * stops reading, and PRD invariant 5.1 is worth nothing if nobody reads it.
 */

beforeEach(() => {
  document.body.replaceChildren()
})

/** Replace a node with an identical one, the way a re-render does. */
function rerender(el: HTMLElement): HTMLElement {
  const fresh = el.cloneNode(true) as HTMLElement
  el.replaceWith(fresh)
  return fresh
}

const textField = (el: Element): FieldSpec =>
  ({ id: "f1", el, kind: "text", label: "First Name", required: true }) as FieldSpec

describe("finding a control again", () => {
  it("returns the element itself when nothing moved", () => {
    document.body.innerHTML = `<input id="a" value="x">`
    const input = document.getElementById("a")!

    expect(relocate(input)).toBe(input)
  })

  it("finds the replacement by id", () => {
    document.body.innerHTML = `<input id="name--legalName--firstName" value="">`
    const original = document.getElementById("name--legalName--firstName") as HTMLInputElement
    const replacement = rerender(original)

    expect(original.isConnected).toBe(false)
    expect(relocate(original)).toBe(replacement)
  })

  it("falls back to the automation id, then the name", () => {
    document.body.innerHTML = `<input data-automation-id="email" value="">`
    const byAutomation = document.querySelector("input")! as HTMLInputElement
    expect(relocate(rerender(byAutomation) && byAutomation)).toBe(document.querySelector("input"))

    document.body.innerHTML = `<input name="postalCode" value="">`
    const byName = document.querySelector("input")! as HTMLInputElement
    rerender(byName)
    expect(relocate(byName)).toBe(document.querySelector("input"))
  })

  it("gives up on a control that is genuinely gone", () => {
    document.body.innerHTML = `<input id="a" value="x">`
    const input = document.getElementById("a")!
    input.remove()

    expect(relocate(input)).toBeNull()
  })
})

describe("verifying across a re-render", () => {
  it("confirms a value the site moved to a new element", () => {
    document.body.innerHTML = `<input id="name--legalName--firstName" value="">`
    const original = document.getElementById("name--legalName--firstName") as HTMLInputElement
    const field = textField(original)

    // The write lands, the site re-renders, the new node carries the value.
    original.value = "Jordan"
    const replacement = rerender(original)
    replacement.setAttribute("value", "Jordan")
    ;(replacement as HTMLInputElement).value = "Jordan"

    expect(verify(field, { kind: "wrote", value: "Jordan" }).status).toBe("filled")
  })

  it("still refuses to confirm a control that vanished", () => {
    document.body.innerHTML = `<input id="gone" value="">`
    const input = document.getElementById("gone") as HTMLInputElement
    const field = textField(input)
    input.remove()

    const result = verify(field, { kind: "wrote", value: "Jordan" })

    expect(result.status).toBe("error")
    expect(result.reason).toMatch(/did not accept/)
  })

  it("still refuses to confirm a value the replacement does not hold", () => {
    document.body.innerHTML = `<input id="a" value="">`
    const input = document.getElementById("a") as HTMLInputElement
    const field = textField(input)
    rerender(input)

    expect(verify(field, { kind: "wrote", value: "Jordan" }).status).toBe("error")
  })
})

describe("a menu left open by the field before this one", () => {
  it("prefers the menu that opened for this control", async () => {
    // Reported live on Workday: Country committed and left its list mounted,
    // so Phone Device Type read 250 countries as its own options and said it
    // found no option matching "mobile".
    document.body.innerHTML = `
      <ul role="listbox" id="leftover">
        <li role="option"><div>Canada</div></li>
        <li role="option"><div>United States of America</div></li>
      </ul>
      <div id="host">
        <button aria-haspopup="listbox" aria-expanded="false" id="phoneType">Select One</button>
      </div>`

    const trigger = document.getElementById("phoneType") as HTMLButtonElement

    // Pressing the trigger mounts its own menu, which is what makes that menu
    // fresh and the country list left over.
    trigger.addEventListener("click", () => {
      if (document.getElementById("mine")) return

      const menu = document.createElement("ul")
      menu.id = "mine"
      menu.setAttribute("role", "listbox")

      for (const name of ["Mobile", "Home"]) {
        const option = document.createElement("li")
        option.setAttribute("role", "option")
        option.innerHTML = `<div>${name}</div>`
        option.addEventListener("click", () => {
          trigger.textContent = name
        })
        menu.append(option)
      }

      document.getElementById("host")!.append(menu)
      trigger.setAttribute("aria-expanded", "true")
    })

    const result = await selectFromCombobox(trigger, "mobile")

    expect(result.ok).toBe(true)
    expect(result.value).toBe("Mobile")
    expect(trigger.textContent).toBe("Mobile")
  })

  it("does not claim success from clicking another field's option", async () => {
    // The safety property that makes preferring rather than excluding safe:
    // an option in someone else's menu cannot change this control, so the
    // commit check fails and the field is reported honestly.
    document.body.innerHTML = `
      <ul role="listbox" id="leftover">
        <li role="option"><div>Mobile</div></li>
      </ul>
      <button aria-haspopup="listbox" aria-expanded="true" id="phoneType">Select One</button>`

    const result = await selectFromCombobox(
      document.getElementById("phoneType") as HTMLButtonElement,
      "mobile"
    )

    expect(result.ok).toBe(false)
  })
})
