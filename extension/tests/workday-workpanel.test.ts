import { readFileSync } from "node:fs"
import { resolve as resolvePath } from "node:path"
import { beforeEach, describe, expect, it } from "vitest"

import { workday } from "~adapters"
import { fill } from "~core/fill"
import { match } from "~core/match"
import { scan } from "~core/scan"
import { verify } from "~core/verify"
import type { FieldSpec } from "~core/types"

/**
 * A Work Experience panel, which exists only after Add has been pressed.
 *
 * The dates here are the widget the rest of the engine was not built for: a
 * `role="group"` holding two `<input role="spinbutton">` with no type, behind
 * MM and YYYY display divs.
 */

const PANEL = readFileSync(
  resolvePath(__dirname, "../../fixtures/workday-work-panel.html"),
  "utf8"
)

beforeEach(() => {
  document.body.replaceChildren()
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<div data-automation-id="applyFlowPage">
       <div role="group" aria-labelledby="Work-Experience-section">
         <h4 id="Work-Experience-section">Work Experience</h4>
         ${PANEL}
       </div>
     </div>`
  )
})

const fields = () => scan(document, workday)
const byLabel = (label: string) => fields().find((f) => f.label === label)!
const keyFor = (label: string) =>
  match(byLabel(label), workday.rules ?? [], workday.key?.bind(workday))?.key ?? null

describe("a split date is one field", () => {
  it("does not report Month and Year as fields of their own", () => {
    // Two spin buttons per date, two dates: four rows called Month and Year
    // that no profile has an answer for, while the real question is never
    // asked.
    expect(fields().map((f) => f.label)).toEqual([
      "Job Title",
      "Company",
      "Location",
      "I currently work here",
      "From",
      "To",
      "Role Description"
    ])
  })

  it("is a month, because no day is asked for", () => {
    expect(byLabel("From").kind).toBe("month")
    expect(byLabel("To").kind).toBe("month")
  })

  it("takes its label from the legend above the group", () => {
    expect(byLabel("From").el.getAttribute("data-automation-id")).toBe("dateInputWrapper")
  })
})

describe("which entry the panel belongs to", () => {
  it("puts every field in the same block, dates included", () => {
    // The legend labelling a date is not also its section. Resolved from the
    // group itself, each date reported "From" or "To" as its block, and the
    // repeat index then counted dates instead of jobs.
    for (const field of fields()) {
      expect(field.section).toBe("Work Experience 1")
      expect(field.repeatIndex).toBe(0)
    }
  })

  it("does not read the previous field's legend as its section", () => {
    // A legend scopes to its own fieldset. Found inside a preceding sibling
    // it is that sibling's label, and "To" reported its section as "From".
    expect(byLabel("To").section).not.toBe("From")
  })
})

describe("the panel's fields", () => {
  it("maps all seven, including both dates", () => {
    expect(keyFor("Job Title")).toBe("work[].title")
    expect(keyFor("Company")).toBe("work[].company")
    expect(keyFor("Location")).toBe("work[].location")
    expect(keyFor("I currently work here")).toBe("work[].current")
    expect(keyFor("Role Description")).toBe("work[].summary")
  })

  it("reads the dates as the job's, not the education entry's", () => {
    // Workday uses formField-startDate in both blocks, so one mapping serves
    // both and the panel decides which key it is. A declared key used to skip
    // that rewrite, which put a job's start date into an education entry.
    expect(keyFor("From")).toBe("work[].startDate")
    expect(keyFor("To")).toBe("work[].endDate")
  })
})

describe("writing a date into separate boxes", () => {
  const write = async (label: string, value: string) =>
    fill(byLabel(label) as FieldSpec, { kind: "text", value })

  const part = (which: string) =>
    document.querySelector<HTMLInputElement>(
      `#workExperience-7--startDate-dateSection${which}-input`
    )!

  it("puts the month and the year in their own boxes", async () => {
    const outcome = await write("From", "2024-06")

    expect(outcome.kind).toBe("wrote")
    expect(part("Month").value).toBe("06")
    expect(part("Year").value).toBe("2024")
  })

  it("refuses a value it cannot read as a date", async () => {
    const outcome = await write("From", "sometime in 2024")

    expect(outcome.kind).toBe("error")
  })

  it("leaves a box the profile has no answer for alone", async () => {
    // A stored "2024-06" has no day in it, and writing 01 into a day box
    // invents a date the user never gave.
    document
      .querySelector("[data-automation-id='dateInputWrapper']")!
      .insertAdjacentHTML(
        "beforeend",
        `<input role="spinbutton" aria-label="Day" id="day-box" value="">`
      )

    await write("From", "2024-06")

    expect((document.getElementById("day-box") as HTMLInputElement).value).toBe("")
  })
})

describe("counting panels in a section", () => {
  /**
   * Reported live: a profile with three jobs got one panel. Every date inside
   * a panel is also a `role="group"` with an `aria-labelledby`, so one filled
   * panel counted as three and the growth stopped believing it was done.
   */

  const section = () =>
    document.querySelector("[role='group'][aria-labelledby='Work-Experience-section']")!

  beforeEach(() => {
    // repeatables only claims a section it can grow, so it needs the button.
    section().insertAdjacentHTML(
      "beforeend",
      `<button data-automation-id="add-button">Add Another</button>`
    )
  })

  it("counts one panel, not the two dates inside it", () => {
    // The raw count is deliberately asserted too, so the reason this is not
    // just querySelectorAll stays visible.
    expect(section().querySelectorAll("[role='group'][aria-labelledby]")).toHaveLength(3)

    const work = workday.repeatables?.(document)?.find((s) => s.collection === "work")
    expect(work?.present).toBe(1)
  })
})

describe("confirming what was written", () => {
  /**
   * All three reported live, all fields the user could see were filled while
   * the panel called them refused. A read-back that describes its own blind
   * spot rather than the page is worse than no read-back: it teaches the user
   * to ignore the one report that is supposed to be trustworthy.
   */

  const dateGroup = () =>
    document.querySelector<HTMLElement>("[data-automation-id='dateInputWrapper']")!

  it("reads a split date back out of its boxes", async () => {
    const field = byLabel("From")
    await fill(field as FieldSpec, { kind: "text", value: "2024-06" })

    // The group is a div, so reading .value off it returns undefined, and
    // every From and To was reported as refused while showing the date.
    expect(verify(field as FieldSpec, { kind: "wrote", value: "2024-06" }).status).toBe("filled")
  })

  it("still refuses a date that did not go in", async () => {
    const field = byLabel("To")

    expect(verify(field as FieldSpec, { kind: "wrote", value: "2024-06" }).status).toBe("error")
  })

  it("does not confirm from a half-written date", () => {
    const group = dateGroup()
    const month = group.querySelector<HTMLInputElement>("[data-automation-id='dateSectionMonth-input']")!
    month.value = "06"

    const field = byLabel("From")

    expect(verify(field as FieldSpec, { kind: "wrote", value: "2024-06" }).status).toBe("error")
  })
})
