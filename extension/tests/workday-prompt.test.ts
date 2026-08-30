import { beforeEach, describe, expect, it } from "vitest"

import { selectFromCombobox } from "~core/fill/combobox"

/**
 * Workday's search-backed prompt list, captured from a live School box.
 *
 * A React Virtualized listbox whose rows nest three deep: a `role="option"`
 * holding a `promptLeafNode` holding a `promptOption` carrying the text. Every
 * one of those matches the option selectors, so one row arrived as three
 * options and the one Ditto pressed was the outermost. Clicking the outer row
 * never reaches the leaf; clicking the leaf bubbles through all of them.
 */

/** One row, nested exactly as Workday nests it. */
function row(label: string): string {
  return `
    <div id="menuItem-${label}" data-automation-id="menuItem" role="option" aria-label="${label}" class="css-kbbc15">
      <div data-automation-id="promptLeafNode" data-uxi-widget-type="multiselectlistitem">
        <div data-automation-id="promptOption" data-automation-label="${label}">${label}</div>
      </div>
    </div>`
}

function prompt(rows: string[], { handlerOn }: { handlerOn: "leaf" | "row" }): HTMLInputElement {
  document.body.replaceChildren()
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<div data-uxi-widget-type="multiselect">
       <input id="school" type="text" placeholder="Search">
       <ul role="listbox" data-automation-id="selectedItemList" id="chosen"></ul>
     </div>
     <div data-popper-placement="top">
       <div data-automation-id="activeListContainer" role="listbox" class="ReactVirtualized__Grid">
         <div class="ReactVirtualized__Grid__innerScrollContainer" role="presentation">
           ${rows.join("")}
         </div>
       </div>
     </div>`
  )

  const input = document.getElementById("school") as HTMLInputElement
  const selector =
    handlerOn === "leaf" ? "[data-automation-id='promptOption']" : "[role='option']"

  for (const target of document.querySelectorAll<HTMLElement>(selector)) {
    target.addEventListener("click", () => {
      const name = target.getAttribute("data-automation-label") ?? target.getAttribute("aria-label")!
      document
        .getElementById("chosen")!
        .insertAdjacentHTML(
          "beforeend",
          `<li><p data-automation-id="promptOption" data-automation-label="${name}">${name}</p></li>`
        )
      input.value = ""
    })
  }

  return input
}

beforeEach(() => {
  document.body.replaceChildren()
})

describe("choosing from a nested prompt row", () => {
  it("selects it when the handler is on the innermost node", async () => {
    // The case that was failing live: the option was visible and Ditto
    // pressed the row around it.
    const input = prompt([row("Texas Tech University")], { handlerOn: "leaf" })

    const result = await selectFromCombobox(input, "Texas Tech University")

    expect(result.ok).toBe(true)
    expect(document.getElementById("chosen")!.textContent).toContain("Texas Tech")
  })

  it("still selects it when the handler is on the row", async () => {
    // Pressing the leaf bubbles, so this works either way.
    const input = prompt([row("Texas Tech University")], { handlerOn: "row" })

    expect((await selectFromCombobox(input, "Texas Tech University")).ok).toBe(true)
  })

  it("reads one option per row, not three", async () => {
    // Nested matches meant a two result list looked like six options.
    const input = prompt([row("Texas Tech University"), row("Texas A&M University")], {
      handlerOn: "leaf"
    })

    const result = await selectFromCombobox(input, "Texas A&M University")

    expect(result.value).toBe("Texas A&M University")
    expect(document.getElementById("chosen")!.children).toHaveLength(1)
  })
})

describe("the row that says there is nothing", () => {
  it("never selects No Items", async () => {
    // Workday says it in words, not in a class name: an ordinary
    // role="option" reading "No Items." with nothing else to mark it.
    const input = prompt([row("No Items.")], { handlerOn: "leaf" })

    const result = await selectFromCombobox(input, "Texas Tech University")

    expect(result.ok).toBe(false)
    expect(document.getElementById("chosen")!.children).toHaveLength(0)
  })
})

describe("a widget that only commits on Enter", () => {
  /**
   * Reported live, repeatedly. Workday's School box shows "Search Results (2)"
   * with the exact match highlighted, Ditto presses the option, and the field
   * stays empty. Its own instructions say to type the name and press Enter,
   * and that is the only gesture the widget honours.
   */

  /** Results appear and highlight the top hit; only Enter commits. */
  function enterOnly(labels: string[]): HTMLInputElement {
    document.body.replaceChildren()
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div data-uxi-widget-type="multiselect">
         <input id="school" type="text" placeholder="Search">
         <ul role="listbox" data-automation-id="selectedItemList" id="chosen"></ul>
       </div>
       <div data-popper-placement="top">
         <div data-automation-id="activeListContainer" role="listbox">
           ${labels.map(row).join("")}
         </div>
       </div>`
    )

    const input = document.getElementById("school") as HTMLInputElement

    // The top hit starts highlighted and ArrowDown moves it, which is what
    // makes Enter a specific gesture rather than a guess.
    let highlighted = 0

    input.addEventListener("keydown", (event) => {
      const key = (event as KeyboardEvent).key

      if (key === "ArrowDown") {
        highlighted = Math.min(highlighted + 1, labels.length - 1)
        return
      }

      if (key !== "Enter") return

      const taken = labels[highlighted]
      document
        .getElementById("chosen")!
        .insertAdjacentHTML(
          "beforeend",
          `<li><p data-automation-id="promptOption" data-automation-label="${taken}">${taken}</p></li>`
        )
      input.value = ""
    })

    return input
  }

  it("takes the exact top hit with Enter", async () => {
    const input = enterOnly(["Texas Tech University", "Texas Tech University Health Sciences Center"])

    const result = await selectFromCombobox(input, "Texas Tech University")

    expect(result.ok).toBe(true)
    expect(document.getElementById("chosen")!.textContent).toBe("Texas Tech University")
  })

  it("walks the highlight down to its option before pressing Enter", async () => {
    // Enter takes whatever is highlighted, and on a multi-select a wrong guess
    // is not a wrong value but an extra one sitting alongside the right one
    // with nothing to remove it.
    const input = enterOnly(["Texas Tech University Health Sciences Center", "Texas Tech University"])

    const result = await selectFromCombobox(input, "Texas Tech University")

    expect(result.ok).toBe(true)
    expect(document.getElementById("chosen")!.textContent).toBe("Texas Tech University")
  })
})
