import { describe, expect, it } from "vitest"

import { selectFromCombobox } from "~core/fill/combobox"

/**
 * A search box that answers slowly, filled value after value.
 *
 * Reported on a live Workday My Experience page: the skills box was "going
 * too fast, not waiting for the list".
 *
 * What is on screen straight after typing is the PREVIOUS value's results,
 * and they are perfectly stable. The wait is allowed to accept a list that
 * has not moved, on the reasoning that plenty of lists are complete when they
 * appear, but that allowance was a flat 1200ms used with budgets that differ
 * by a factor of three. On the long one it gave up a third of the way in, and
 * every skill after the first was matched against the one before it.
 */

/**
 * A Workday multiselect whose results arrive `delayMs` after the query.
 *
 * Real structure: the widget declares itself, chosen values live as
 * `promptOption` pills inside it, and the search box is cleared on commit.
 */
function slowSearchBox(delayMs: number, results: Record<string, string[]>): HTMLInputElement {
  document.body.innerHTML = `
    <div id="shell" data-uxi-widget-type="multiselect">
      <div id="pills"></div>
      <input id="skills" role="combobox" aria-controls="menu" />
      <ul id="menu" role="listbox"></ul>
    </div>`

  const input = document.getElementById("skills") as HTMLInputElement
  const menu = document.getElementById("menu")!
  const pills = document.getElementById("pills")!
  let timer: ReturnType<typeof setTimeout> | undefined

  const render = (options: string[]) => {
    menu.innerHTML = options
      .map((option) => `<li role="option" data-value="${option}">${option}</li>`)
      .join("")

    for (const item of menu.querySelectorAll<HTMLElement>("li")) {
      item.addEventListener("click", () => {
        pills.insertAdjacentHTML(
          "beforeend",
          `<div data-automation-id="promptOption" data-automation-label="${item.dataset.value}">${item.textContent}</div>`
        )
        menu.innerHTML = ""
        input.value = ""
      })
    }
  }

  input.addEventListener("input", () => {
    clearTimeout(timer)
    // The previous query's results stay on screen while this one is in flight.
    if (input.value) {
      timer = setTimeout(() => render(results[input.value.toLowerCase()] ?? []), delayMs)
    }
  })

  return input
}

describe("a box that takes its time", () => {
  it("waits for this value's results instead of taking the last one's", async () => {
    const input = slowSearchBox(1200, {
      python: ["Python (Programming Language)"],
      kubernetes: ["Kubernetes (Software)"]
    })

    await selectFromCombobox(input, "Python")
    expect(document.getElementById("pills")!.textContent).toContain("Python")

    // Straight after typing, the menu still shows the Python result. Held to
    // the old flat allowance, this returned that and matched Kubernetes
    // against it.
    await selectFromCombobox(input, "Kubernetes")
    expect(document.getElementById("pills")!.textContent).toContain("Kubernetes (Software)")
  }, 30_000)

  it("does not take the previous value when this one has no results", async () => {
    const input = slowSearchBox(1200, { python: ["Python (Programming Language)"] })

    await selectFromCombobox(input, "Python")
    await selectFromCombobox(input, "Fortran")

    // Adding the Python entry a second time would put a skill on the
    // application the user never asked for.
    const pills = document.getElementById("pills")!.textContent ?? ""
    expect(pills.match(/Python/g)?.length ?? 0).toBe(1)
  }, 30_000)
})

describe("a search that takes a full two seconds", () => {
  /**
   * Reported live, twice: "it is not waiting, it is too fast", and "if the
   * list is not populating it erases and writes again, which takes more time
   * for the list to populate".
   *
   * The second half is the worse one. Retrying is not passive: it clears the
   * box and types again, throwing away a search that was moments from
   * answering and starting the wait over.
   */
  it("waits rather than retyping the query", async () => {
    let queries = 0

    document.body.innerHTML = `
      <div id="shell" data-uxi-widget-type="multiselect">
        <div id="pills"></div>
        <input id="skills" role="combobox" aria-controls="menu" />
        <ul id="menu" role="listbox"></ul>
      </div>`

    const input = document.getElementById("skills") as HTMLInputElement
    const menu = document.getElementById("menu")!
    const pills = document.getElementById("pills")!
    let timer: ReturnType<typeof setTimeout> | undefined

    input.addEventListener("input", () => {
      // Typing is per character, and each character is an input event. What
      // counts is a typing PASS: the box being cleared and written again.
      if (!input.value) {
        queries++
        return
      }

      clearTimeout(timer)

      const asked = input.value.toLowerCase()
      timer = setTimeout(() => {
        if (asked !== "kubernetes") return
        menu.innerHTML = `<li role="option" data-value="Kubernetes (Software)">Kubernetes (Software)</li>`
        menu.querySelector("li")!.addEventListener("click", () => {
          pills.insertAdjacentHTML(
            "beforeend",
            `<div data-automation-id="promptOption" data-automation-label="Kubernetes (Software)">Kubernetes (Software)</div>`
          )
          menu.innerHTML = ""
          input.value = ""
        })
      }, 2000)
    })

    await selectFromCombobox(input, "Kubernetes")

    expect(pills.textContent).toContain("Kubernetes (Software)")

    // Typed once. A retry here would have cleared the box and restarted the
    // two second wait with less budget than the first attempt had.
    expect(queries).toBe(1)
  }, 30_000)
})
