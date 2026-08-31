import { readFileSync } from "node:fs"
import { resolve as resolvePath } from "node:path"
import { beforeEach, describe, expect, it } from "vitest"

import { selectFromCombobox } from "~core/fill/combobox"

/**
 * The Voluntary Disclosures and Self Identify steps, which are almost entirely
 * tri-state questions asked as Workday listboxes.
 *
 * The structure is the real one, reused from the country menu fixture: a
 * toggle button, and a menu portalled to a body-level div outside the form.
 * What changes here is the option text, which is where these steps are hard:
 * the profile stores "no" and the form offers a sentence.
 *
 * The synonym table that resolves that was reachable only from the radio path
 * until recently. Greenhouse asks these as react-select; Workday asks them as
 * this widget. Both have to arrive at the same answer.
 */

const MENU = readFileSync(
  resolvePath(__dirname, "../../fixtures/workday-country-menu.html"),
  "utf8"
)

/** Rebuild the real menu with a different set of options in it. */
function ask(question: string, options: string[]): HTMLButtonElement {
  document.body.replaceChildren()
  document.body.insertAdjacentHTML("afterbegin", MENU)

  const list = document.querySelector("ul[role='listbox']")!
  const template = list.querySelector("li[role='option']:not([aria-disabled='true'])")!

  for (const stale of list.querySelectorAll("li[role='option'][aria-disabled='true']")) {
    stale.remove()
  }

  const built = options.map((label) => {
    const option = template.cloneNode(true) as HTMLElement
    option.removeAttribute("aria-selected")
    for (const node of option.querySelectorAll("*")) {
      if (node.children.length === 0) node.textContent = label
    }
    if (option.children.length === 0) option.textContent = label
    return option
  })

  template.remove()
  list.append(...built)

  const trigger = document.getElementById("country--country") as HTMLButtonElement
  trigger.setAttribute("aria-label", question)

  for (const option of list.querySelectorAll<HTMLElement>("li[role='option']")) {
    option.addEventListener("click", () => {
      trigger.textContent = option.textContent!.trim()
      trigger.setAttribute("aria-expanded", "false")
      option.closest("[data-popper-placement]")?.remove()
    })
  }

  return trigger
}

/** Workday's own wording on these two steps. */
const VETERAN = [
  "I IDENTIFY AS ONE OR MORE OF THE CLASSIFICATIONS OF A PROTECTED VETERAN",
  "I AM NOT A PROTECTED VETERAN",
  "I DON'T WISH TO ANSWER"
]

const DISABILITY = [
  "Yes, I have a disability, or have had one in the past",
  "No, I do not have a disability and have not had one in the past",
  "I do not want to answer"
]

describe("a tri-state asked by a Workday listbox", () => {
  beforeEach(() => {
    document.body.replaceChildren()
  })

  it("answers the veteran question with no", async () => {
    const trigger = ask("Veteran Status", VETERAN)

    const result = await selectFromCombobox(trigger, "no")

    expect(result.ok).toBe(true)
    expect(trigger.textContent).toBe("I AM NOT A PROTECTED VETERAN")
  })

  it("answers the veteran question with a decline", async () => {
    const trigger = ask("Veteran Status", VETERAN)

    const result = await selectFromCombobox(trigger, "decline")

    expect(result.ok).toBe(true)
    expect(trigger.textContent).toBe("I DON'T WISH TO ANSWER")
  })

  it("does not read the disability no as a yes", async () => {
    // Both options open with the word they contradict, so a loose match here
    // puts the wrong answer on a legally meaningful question.
    const trigger = ask("Disability Status", DISABILITY)

    const result = await selectFromCombobox(trigger, "no")

    expect(result.ok).toBe(true)
    expect(trigger.textContent).toBe(
      "No, I do not have a disability and have not had one in the past"
    )
  })

  it("answers the disability question with yes", async () => {
    const trigger = ask("Disability Status", DISABILITY)

    const result = await selectFromCombobox(trigger, "yes")

    expect(result.ok).toBe(true)
    expect(trigger.textContent).toBe("Yes, I have a disability, or have had one in the past")
  })

  it("reports the option's own words, not the word it was asked for", async () => {
    // Verification compares this against what the page shows. Reporting "no"
    // here is what put a red cross on a correctly answered question.
    const trigger = ask("Veteran Status", VETERAN)

    const result = await selectFromCombobox(trigger, "no")

    expect(result.value).toBe("I AM NOT A PROTECTED VETERAN")
  })
})
