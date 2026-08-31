import { beforeEach, describe, expect, it } from "vitest"

import { fill } from "~core/fill"
import { selectFromCombobox } from "~core/fill/combobox"
import type { FieldSpec } from "~core/types"

/**
 * A list long enough to scroll.
 *
 * Workday renders these with React Virtualized, which keeps only the visible
 * rows in the DOM. An option further down does not exist to be read or
 * clicked until it has been scrolled to, so on the Skills box most values
 * were simply not there when Ditto looked, and only the handful in view went
 * in.
 */

const SKILLS = Array.from({ length: 24 }, (_, i) => `Skill ${String(i + 1).padStart(2, "0")}`)

/** Renders four rows at a time, chosen by scrollTop, as a windowed list does. */
function virtualList(): HTMLInputElement {
  document.body.replaceChildren()
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<div data-uxi-widget-type="multiselect">
       <input id="skills" type="text" placeholder="Search">
       <ul role="listbox" data-automation-id="selectedItemList" id="chosen"></ul>
     </div>
     <div data-popper-placement="top">
       <div data-automation-id="activeListContainer" role="listbox" id="menu"></div>
     </div>`
  )

  const input = document.getElementById("skills") as HTMLInputElement
  const menu = document.getElementById("menu")!

  const render = () => {
    const first = Math.min(Math.floor(menu.scrollTop / 32), SKILLS.length - 4)
    menu.innerHTML = SKILLS.slice(first, first + 4)
      .map(
        (label) =>
          `<div data-automation-id="menuItem" role="option" aria-label="${label}">
             <div data-automation-id="promptOption" data-automation-label="${label}">${label}</div>
           </div>`
      )
      .join("")

    for (const option of menu.querySelectorAll<HTMLElement>("[data-automation-id='promptOption']")) {
      option.addEventListener("click", () => {
        const name = option.getAttribute("data-automation-label")!
        document
          .getElementById("chosen")!
          .insertAdjacentHTML(
            "beforeend",
            `<li><p data-automation-id="promptOption" data-automation-label="${name}">${name}</p></li>`
          )
        input.value = ""
      })
    }
  }

  menu.addEventListener("scroll", render)
  render()

  return input
}

beforeEach(() => {
  document.body.replaceChildren()
})

describe("finding an option below the fold", () => {
  it("scrolls to a value that is not rendered yet", async () => {
    // Row 18 of 24, with four visible at a time.
    const input = virtualList()

    const result = await selectFromCombobox(input, "Skill 18")

    expect(result.ok).toBe(true)
    expect(document.getElementById("chosen")!.textContent).toBe("Skill 18")
  })

  it("takes one still in view without scrolling past it", async () => {
    const input = virtualList()

    expect((await selectFromCombobox(input, "Skill 02")).ok).toBe(true)
  })

  it("gives up on a value the list does not contain", async () => {
    const input = virtualList()

    expect((await selectFromCombobox(input, "Skill 99")).ok).toBe(false)
  }, 15_000)

  it("adds every saved skill, not just the ones on screen", async () => {
    const input = virtualList()

    const outcome = await fill(
      {
        id: "s",
        el: input,
        kind: "combobox",
        label: "Type to Add Skills",
        required: false
      } as FieldSpec,
      { kind: "list", value: ["Skill 02", "Skill 14", "Skill 23"] }
    )

    expect(outcome.kind).toBe("wrote")
    expect(document.getElementById("chosen")!.children).toHaveLength(3)
  }, 20_000)
})

describe("a search that takes a moment to answer", () => {
  /**
   * Reported live on the Skills box: some values went in, and for others the
   * list was still populating when Ditto looked, so it read what was there,
   * found nothing, and moved on to the next skill.
   *
   * The list showing a moment after typing is either the previous query's
   * results or this one's half rendered. Neither is an answer.
   */

  /** Results arrive late, and the stale list is on screen until they do. */
  function slowSearch(): HTMLInputElement {
    document.body.replaceChildren()
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div data-uxi-widget-type="multiselect">
         <input id="skills" type="text" placeholder="Search">
         <ul role="listbox" data-automation-id="selectedItemList" id="chosen"></ul>
       </div>
       <div data-popper-placement="top">
         <div data-automation-id="activeListContainer" role="listbox" id="menu">
           <div role="option"><div data-automation-id="promptOption" data-automation-label="Stale Result">Stale Result</div></div>
         </div>
       </div>`
    )

    const input = document.getElementById("skills") as HTMLInputElement
    const menu = document.getElementById("menu")!

    let pending: ReturnType<typeof setTimeout> | undefined

    input.addEventListener("input", () => {
      if (!input.value) return
      clearTimeout(pending)

      // Half a second before this query's own results replace the last set.
      pending = setTimeout(() => {
        menu.innerHTML = `<div role="option"><div data-automation-id="promptOption" data-automation-label="${input.value}">${input.value}</div></div>`

        menu.querySelector<HTMLElement>("[data-automation-id='promptOption']")!.addEventListener(
          "click",
          () => {
            const name = input.value
            document
              .getElementById("chosen")!
              .insertAdjacentHTML(
                "beforeend",
                `<li><p data-automation-id="promptOption" data-automation-label="${name}">${name}</p></li>`
              )
            input.value = ""
          }
        )
      }, 500)
    })

    return input
  }

  it("waits for this query's results instead of taking the last one's", async () => {
    const result = await selectFromCombobox(slowSearch(), "Kubernetes")

    expect(result.ok).toBe(true)
    expect(document.getElementById("chosen")!.textContent).toBe("Kubernetes")
  })

  it("never selects the result left over from the previous value", async () => {
    await selectFromCombobox(slowSearch(), "Kubernetes")

    expect(document.getElementById("chosen")!.textContent).not.toContain("Stale")
  })
})
