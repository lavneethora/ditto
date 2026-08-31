import { beforeEach, describe, expect, it } from "vitest"

import { workday } from "~adapters"
import { autofill } from "~core/engine"
import { emptyProfile } from "~profile/schema"

/**
 * Workday's own names for the skills we have confirmed against a real list.
 *
 * Ditto can find these by scoring the options, and still has to for every
 * skill not named here. The list exists because each rule added for one of
 * them broke another: framework-as-a-qualifier broke Python and Java, the
 * abbreviation rule broke Java again. Typing the exact entry takes the
 * confirmed ones off that path entirely.
 */

const alias = (value: string) => workday.alias?.(value, "skills") ?? null

describe("the names that were getting picked wrong", () => {
  it("names each one as Workday does", () => {
    expect(alias("C")).toBe("C (Programming Language)")
    expect(alias("C++")).toBe("C++ Programming Language")
    expect(alias("Java")).toBe("Java (Programming Language)")
    expect(alias("Python")).toBe("Python (Programming Language)")
    expect(alias("SQL")).toBe("Structured Query Language (SQL)")
    expect(alias("Docker")).toBe("Docker (Software)")
    expect(alias("React")).toBe("React.js")
  })

  it("does not care how the user capitalised it", () => {
    expect(alias("java")).toBe("Java (Programming Language)")
    expect(alias("MATLAB")).toBe("MATLAB")
  })

  it("says nothing about a skill it has never seen", () => {
    // The scoring handles everything else, which is most of the list.
    expect(alias("Kubernetes")).toBeNull()
    expect(alias("Rust")).toBeNull()
  })
})

describe("what the list is allowed to touch", () => {
  it("only applies to skills", () => {
    // A name for a skill is not a name for a company or a school, and the
    // same word can be both.
    expect(workday.alias?.("Java", "work[].company")).toBeNull()
    expect(workday.alias?.("R", "education[].school")).toBeNull()
  })
})

describe("using it during a fill", () => {
  beforeEach(() => {
    document.body.replaceChildren()
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div data-automation-id="applyFlowPage">
         <div data-automation-id="formField-skills">
           <label for="skills--skills">Type to Add Skills</label>
           <div data-uxi-widget-type="multiselect">
             <input id="skills--skills" type="text" placeholder="Search" data-uxi-widget-type="selectinput">
             <ul role="listbox" data-automation-id="selectedItemList" id="chosen"></ul>
           </div>
         </div>
       </div>`
    )
  })

  it("types the site's name, not the user's", async () => {
    const input = document.getElementById("skills--skills") as HTMLInputElement
    const typed: string[] = []

    input.addEventListener("keydown", (event) => {
      if ((event as KeyboardEvent).key === "Enter") typed.push(input.value)
    })

    const base = emptyProfile()
    await autofill({
      doc: document,
      adapter: workday,
      profile: { ...base, skills: ["Java"] } as never
    })

    expect(typed.some((value) => value === "Java (Programming Language)")).toBe(true)
    expect(typed).not.toContain("Java")
  })
})
