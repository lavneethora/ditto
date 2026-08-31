import { beforeEach, describe, expect, it } from "vitest"

import { fill } from "~core/fill"
import type { FieldSpec } from "~core/types"

/**
 * A control that takes many values.
 *
 * Reported live on Workday: Skills came back as "Nothing sensible to select
 * here" while the profile held a dozen of them. A list is many selections in
 * one control, and asChoice had no answer for a list at all.
 */

beforeEach(() => {
  document.body.replaceChildren()
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<div data-uxi-widget-type="multiselect">
       <input id="skills" type="text" placeholder="Search">
       <ul role="listbox" data-automation-id="selectedItemList" id="chosen"></ul>
       <ul role="listbox" id="menu">
         <li role="option"><div>Python</div></li>
         <li role="option"><div>TypeScript</div></li>
         <li role="option"><div>Rust</div></li>
       </ul>
     </div>`
  )

  // Picking an option adds a pill and clears the search box, which is what
  // the real widget does and what the read-back is written against.
  for (const option of document.querySelectorAll<HTMLElement>("#menu li[role='option']")) {
    option.addEventListener("click", () => {
      const name = option.textContent!.trim()

      document
        .getElementById("chosen")!
        .insertAdjacentHTML(
          "beforeend",
          `<li><p data-automation-id="promptOption" data-automation-label="${name}">${name}</p></li>`
        )
      ;(document.getElementById("skills") as HTMLInputElement).value = ""
    })
  }
})

const field = () =>
  ({
    id: "skills",
    el: document.getElementById("skills")!,
    kind: "combobox",
    label: "Type to Add Skills",
    required: false
  }) as FieldSpec

describe("adding several values to one control", () => {
  it("adds each one and reports what went in", async () => {
    const outcome = await fill(field(), { kind: "list", value: ["Python", "Rust"] })

    expect(outcome.kind).toBe("wrote")
    expect(document.getElementById("chosen")!.children).toHaveLength(2)
  })

  it("keeps the ones it could add when others are not offered", async () => {
    // A form that took two of three is not a failed field.
    const outcome = await fill(field(), {
      kind: "list",
      value: ["Python", "Cobol", "Rust"]
    })

    expect(outcome.kind).toBe("wrote")
    expect(outcome.kind === "wrote" && outcome.value).toBe("Python, Rust")
  })

  it("asks the user when none of them are offered", async () => {
    const outcome = await fill(field(), { kind: "list", value: ["Cobol", "Fortran"] })

    expect(outcome.kind).toBe("needs_you")
  }, 20_000)

  it("skips an empty list rather than reporting a failure", async () => {
    const outcome = await fill(field(), { kind: "list", value: [] })

    expect(outcome.kind).toBe("skipped")
  })
})

describe("what a role description falls back to", () => {
  /**
   * Reported live: every Role Description on a three job history came back
   * empty, reported as "no experience summary saved", while the user could
   * see the bullets sitting in their profile.
   */

  it("uses the bullets as lines when no paragraph is saved", async () => {
    document.body.replaceChildren()
    document.body.insertAdjacentHTML("afterbegin", `<textarea id="role"></textarea>`)

    const outcome = await fill(
      {
        id: "r",
        el: document.getElementById("role")!,
        kind: "textarea",
        label: "Role Description",
        required: false
      } as FieldSpec,
      { kind: "text", value: "Built the thing\nShipped the thing" }
    )

    expect(outcome.kind).toBe("wrote")
    expect((document.getElementById("role") as HTMLTextAreaElement).value).toContain("Shipped")
  })
})
