import { beforeEach, describe, expect, it } from "vitest"

import { readComboboxValue, selectFromCombobox } from "~core/fill/combobox"

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

describe("a box whose search only runs on Enter", () => {
  /**
   * The step that was missing, and the one everything else was built on the
   * absence of.
   *
   * Workday's School box shows nothing at all for a query sitting complete in
   * the input. The list appears only once the query is submitted, which is
   * what the instructions above the field describe: type the name, press
   * Enter, then choose. Ditto typed, waited for a list that was never coming,
   * concluded there were no results, and pressed Enter afterwards only as a
   * way of committing an option it had already failed to find.
   */

  /** Nothing is listed until Enter runs the search. */
  function searchOnEnter(labels: string[]): HTMLInputElement {
    document.body.replaceChildren()
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div data-uxi-widget-type="multiselect">
         <input id="school" type="text" placeholder="Search">
         <ul role="listbox" data-automation-id="selectedItemList" id="chosen"></ul>
       </div>
       <div data-popper-placement="top"><div id="results"></div></div>`
    )

    const input = document.getElementById("school") as HTMLInputElement
    let listed = false

    input.addEventListener("keydown", (event) => {
      if ((event as KeyboardEvent).key !== "Enter") return

      if (!listed) {
        // First Enter runs the search and renders the results.
        listed = true
        document.getElementById("results")!.innerHTML =
          `<div data-automation-id="activeListContainer" role="listbox">${labels.map(row).join("")}</div>`
        return
      }

      // Later Enter takes the highlighted row.
      const taken = labels[0]
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

  it("runs the search, then takes the result", async () => {
    const input = searchOnEnter(["Texas Tech University"])

    const result = await selectFromCombobox(input, "Texas Tech University")

    expect(result.ok).toBe(true)
    expect(document.getElementById("chosen")!.textContent).toBe("Texas Tech University")
  })

  it("does not send Enter to a box that filters as you type", async () => {
    // Lever's location typeahead filters live and must not be sent an Enter
    // it did not ask for, so the short look comes first and only an empty
    // list earns the keystroke.
    document.body.replaceChildren()
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div>
         <input id="loc" class="location-input" type="text">
         <div class="dropdown-container">
           <div class="dropdown-results"><div class="dropdown-location">Lubbock, TX, USA</div></div>
         </div>
       </div>`
    )

    const input = document.getElementById("loc") as HTMLInputElement
    let enters = 0
    input.addEventListener("keydown", (event) => {
      if ((event as KeyboardEvent).key === "Enter") enters += 1
    })

    document.querySelector<HTMLElement>(".dropdown-location")!.addEventListener("click", () => {
      input.value = "Lubbock, TX, USA"
    })

    const result = await selectFromCombobox(input, "Lubbock, Texas")

    expect(result.ok).toBe(true)
    expect(enters).toBe(0)
  })
})

describe("a query sitting in the box is not a filled field", () => {
  /**
   * The failure underneath every "it isn't choosing" report.
   *
   * On a search box with nothing selected, the read-back falls through to
   * `input.value`, which holds the query. The query is the label being
   * searched for, so the very first check passed: commit reported success
   * having selected nothing, and the field was reported filled while sitting
   * empty on screen. Ditto was not failing to choose so much as believing it
   * already had.
   */

  it("does not report success when nothing was selected", async () => {
    document.body.replaceChildren()
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div data-uxi-widget-type="multiselect">
         <input id="school" type="text" placeholder="Search">
         <ul role="listbox" data-automation-id="selectedItemList" id="chosen"></ul>
       </div>
       <div data-popper-placement="top">
         <div data-automation-id="activeListContainer" role="listbox">
           ${row("Texas Tech University")}
         </div>
       </div>`
    )

    // No handler anywhere: nothing can be selected by any gesture.
    const result = await selectFromCombobox(
      document.getElementById("school") as HTMLInputElement,
      "Texas Tech University"
    )

    expect(result.ok).toBe(false)
    expect(document.getElementById("chosen")!.textContent).toBe("")
  })

  it("reads an unselected multiselect as empty, not as its search text", async () => {
    document.body.replaceChildren()
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div data-uxi-widget-type="multiselect">
         <input id="school" type="text" value="Texas Tech University">
         <ul role="listbox" data-automation-id="selectedItemList" id="chosen"></ul>
       </div>`
    )

    expect(readComboboxValue(document.getElementById("school")!)).toBe("")
  })
})
