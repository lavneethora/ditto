import { beforeEach, describe, expect, it } from "vitest"

import { fill } from "~core/fill"
import { selectFromCombobox } from "~core/fill/combobox"
import type { FieldSpec } from "~core/types"

/**
 * Widgets whose commit gesture is Enter.
 *
 * Workday's instructions above its School box say to type the name and press
 * Enter, and Skills behaves the same way. Clicking the option does nothing
 * there, so each value was typed, left uncommitted, and wiped by the next one
 * typing over it: the user watched twelve skills go in and none stay.
 */

beforeEach(() => {
  document.body.replaceChildren()
})

/** A search box that only commits on Enter, and clears itself when it does. */
function typeAndEnterWidget(): HTMLInputElement {
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<form id="host">
       <div data-uxi-widget-type="multiselect">
         <input id="search" type="text" placeholder="Search">
         <ul role="listbox" data-automation-id="selectedItemList" id="chosen"></ul>
         <ul role="listbox" id="menu">
           <li role="option"><div>Texas Tech University</div></li>
           <li role="option"><div>Texas A&M University</div></li>
         </ul>
       </div>
     </form>`
  )

  const input = document.getElementById("search") as HTMLInputElement

  // Clicking an option does nothing at all, which is the point.
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return

    const match = [...document.querySelectorAll<HTMLElement>("#menu li")].find((li) =>
      li.textContent!.trim().toLowerCase().startsWith(input.value.toLowerCase())
    )
    if (!match) return

    document
      .getElementById("chosen")!
      .insertAdjacentHTML(
        "beforeend",
        `<li><p data-automation-id="promptOption" data-automation-label="${match.textContent!.trim()}">${match.textContent!.trim()}</p></li>`
      )
    input.value = ""
  })

  return input
}

describe("committing with Enter", () => {
  it("locks in a value the widget will not accept by click", async () => {
    const input = typeAndEnterWidget()

    const result = await selectFromCombobox(input, "Texas Tech University")

    expect(result.ok).toBe(true)
    expect(document.getElementById("chosen")!.textContent).toContain("Texas Tech University")
  })

  it("keeps each value instead of typing over the last", async () => {
    // The failure the user watched: type, no commit, next value wipes it.
    const input = typeAndEnterWidget()

    await fill(
      {
        id: "s",
        el: input,
        kind: "combobox",
        label: "Type to Add Skills",
        required: false
      } as FieldSpec,
      { kind: "list", value: ["Texas Tech University", "Texas A&M University"] }
    )

    expect(document.getElementById("chosen")!.children).toHaveLength(2)
  })

  it("never lets Enter submit the form it is inside", async () => {
    // Enter in a text input is the browser's implicit submit gesture, and
    // these widgets live inside the application form.
    const input = typeAndEnterWidget()

    let submitted = false
    document.getElementById("host")!.addEventListener("submit", () => {
      submitted = true
    })

    await selectFromCombobox(input, "Nothing That Matches")

    expect(submitted).toBe(false)
  })
})

describe("a box that takes the typed text itself", () => {
  /**
   * Reported live on Workday's Skills box: typing "supabase" showed an empty
   * menu, and pressing Enter with nothing on screen added it anyway. Ditto
   * never got that far, because Enter lived in the commit step and the commit
   * step is only reached once an option has been found.
   */

  /** A search box with no menu at all, which pockets whatever is typed. */
  function freeTextWidget(): HTMLInputElement {
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div data-uxi-widget-type="multiselect">
         <input id="skills" type="text" placeholder="Search">
         <ul role="listbox" data-automation-id="selectedItemList" id="chosen"></ul>
       </div>`
    )

    const input = document.getElementById("skills") as HTMLInputElement

    input.addEventListener("keydown", (event) => {
      if ((event as KeyboardEvent).key !== "Enter" || !input.value.trim()) return

      const name = input.value.trim()
      document
        .getElementById("chosen")!
        .insertAdjacentHTML(
          "beforeend",
          `<li><p data-automation-id="promptOption" data-automation-label="${name}">${name}</p></li>`
        )
      input.value = ""
    })

    return input
  }

  it("adds a value the menu never offered", async () => {
    const result = await selectFromCombobox(freeTextWidget(), "supabase")

    expect(result.ok).toBe(true)
    expect(document.getElementById("chosen")!.textContent).toContain("supabase")
  })

  it("does not claim success from a box still showing what was typed", async () => {
    // The safety property. Lever's location typeahead discards typed text on
    // blur, and its read-back is the input's own value, so "the value is
    // there" stays true right up until the field wipes itself. The widget has
    // to have taken the text OUT of the box.
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div>
         <input id="loc" class="location-input" type="text">
         <div class="dropdown-container"><div class="dropdown-results"></div></div>
       </div>`
    )

    const result = await selectFromCombobox(
      document.getElementById("loc") as HTMLInputElement,
      "Lubbock, Texas"
    )

    expect(result.ok).toBe(false)
    expect((document.getElementById("loc") as HTMLInputElement).value).toBe("Lubbock, Texas")
  })
})
