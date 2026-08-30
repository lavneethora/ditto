import { beforeEach, describe, expect, it } from "vitest"

import { workday } from "~adapters"
import { autofill } from "~core/engine"
import { clickStructural } from "~core/fill/dom"
import { emptyProfile, newId } from "~profile/schema"

/**
 * Growing a repeatable section to fit the profile.
 *
 * Workday ships Work Experience as a heading and an "Add" button with nothing
 * behind it. Without this a profile with three jobs has nowhere to put any of
 * them, and the step reports 100% having filled none of the history the user
 * came to enter.
 */

/** One Workday work panel, numbered the way its heading is. */
function panel(n: number): string {
  return `
    <div role="group" aria-labelledby="Work-${n}-panel">
      <h5 id="Work-${n}-panel">Work Experience ${n}</h5>
      <div data-automation-id="formField-jobTitle">
        <label for="w${n}-title">Job Title</label>
        <input type="text" id="w${n}-title" name="jobTitle">
      </div>
      <div data-automation-id="formField-companyName">
        <label for="w${n}-company">Company</label>
        <input type="text" id="w${n}-company" name="companyName">
      </div>
    </div>`
}

beforeEach(() => {
  document.body.replaceChildren()
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<div data-automation-id="applyFlowPage">
       <div role="group" aria-labelledby="Work-Experience-section">
         <h4 id="Work-Experience-section">Work Experience</h4>
         <div id="panels"></div>
         <button data-automation-id="add-button">Add</button>
       </div>
     </div>`
  )

  // Workday's own behaviour: each press appends one more blank panel.
  const add = document.querySelector<HTMLElement>("[data-automation-id='add-button']")!
  add.addEventListener("click", () => {
    const host = document.getElementById("panels")!
    host.insertAdjacentHTML("beforeend", panel(host.children.length + 1))
  })
})

const withJobs = (count: number) => {
  const base = emptyProfile()
  return {
    ...base,
    work: Array.from({ length: count }, (_, i) => ({
      id: newId(),
      company: `Company ${i + 1}`,
      title: `Title ${i + 1}`,
      location: "",
      startDate: "",
      endDate: "",
      current: false,
      summary: "",
      bullets: []
    }))
  }
}

describe("adding a panel per entry", () => {
  it("adds three panels for three jobs", async () => {
    await autofill({ doc: document, adapter: workday, profile: withJobs(3) as never })

    expect(document.getElementById("panels")!.children).toHaveLength(3)
  })

  it("fills each panel from its own entry, in order", async () => {
    await autofill({ doc: document, adapter: workday, profile: withJobs(3) as never })

    expect((document.getElementById("w1-company") as HTMLInputElement).value).toBe("Company 1")
    expect((document.getElementById("w2-company") as HTMLInputElement).value).toBe("Company 2")
    expect((document.getElementById("w3-company") as HTMLInputElement).value).toBe("Company 3")
  })

  it("reports the added fields like any other", async () => {
    // Added before the scan, not as an afterthought, so they are filled and
    // reported exactly like fields the page shipped with.
    const report = await autofill({
      doc: document,
      adapter: workday,
      profile: withJobs(2) as never
    })

    expect(report.filled.filter((r) => r.label === "Company")).toHaveLength(2)
  })

  it("adds nothing when the profile has no history", async () => {
    await autofill({ doc: document, adapter: workday, profile: emptyProfile() as never })

    expect(document.getElementById("panels")!.children).toHaveLength(0)
  })

  it("ignores empty rows in the profile", async () => {
    const profile = withJobs(1)
    profile.work.push({
      id: newId(),
      company: "",
      title: "",
      location: "",
      startDate: "",
      endDate: "",
      current: false,
      summary: "",
      bullets: []
    })

    await autofill({ doc: document, adapter: workday, profile: profile as never })

    expect(document.getElementById("panels")!.children).toHaveLength(1)
  })

  it("survives the section re-rendering its Add button between presses", async () => {
    // Workday replaces elements rather than updating them, so a cached button
    // reference is detached by the second press and clicking it does nothing.
    const host = document.getElementById("panels")!
    const section = document.querySelector("[role='group']")!

    const rewire = () => {
      const current = section.querySelector<HTMLElement>("[data-automation-id='add-button']")!
      const fresh = current.cloneNode(true) as HTMLElement
      current.replaceWith(fresh)
      fresh.addEventListener("click", () => {
        host.insertAdjacentHTML("beforeend", panel(host.children.length + 1))
        setTimeout(rewire, 0)
      })
    }

    const original = section.querySelector<HTMLElement>("[data-automation-id='add-button']")!
    const replacement = original.cloneNode(true) as HTMLElement
    original.replaceWith(replacement)
    replacement.addEventListener("click", () => {
      host.insertAdjacentHTML("beforeend", panel(host.children.length + 1))
      setTimeout(rewire, 0)
    })

    await autofill({ doc: document, adapter: workday, profile: withJobs(3) as never })

    expect(host.children).toHaveLength(3)
  })

  it("stops rather than clicking forever when Add does nothing", async () => {
    const add = document.querySelector<HTMLElement>("[data-automation-id='add-button']")!
    const dead = add.cloneNode(true) as HTMLElement
    add.replaceWith(dead)

    let presses = 0
    dead.addEventListener("click", () => {
      presses += 1
    })

    await autofill({ doc: document, adapter: workday, profile: withJobs(5) as never })

    expect(presses).toBe(1)
  })
})

describe("what may be pressed to grow a form", () => {
  const button = (text: string) => {
    const el = document.createElement("button")
    el.textContent = text
    return el
  }

  it("allows Add and Add Another, which are submit buttons by default", () => {
    // No type attribute means type=submit, so the ordinary gate refuses them
    // and a repeatable section could never be grown.
    expect(() => clickStructural(button("Add"))).not.toThrow()
    expect(() => clickStructural(button("Add Another"))).not.toThrow()
  })

  it("still refuses anything whose words mean submit", () => {
    expect(() => clickStructural(button("Submit"))).toThrow()
    expect(() => clickStructural(button("Submit Application"))).toThrow()
    expect(() => clickStructural(button("Create Account"))).toThrow()
  })
})
