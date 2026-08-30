import { readFileSync } from "node:fs"
import { resolve as resolvePath } from "node:path"
import { beforeEach, describe, expect, it } from "vitest"

import { workday } from "~adapters"
import { match } from "~core/match"
import { scan } from "~core/scan"

/**
 * Step 3, My Experience, from a live tenant.
 *
 * The step where recognition stops being a useful measure. Work Experience,
 * Certifications, Languages and Websites are a heading and an "Add" button
 * with no fields behind them, so a profile with three jobs has nowhere to put
 * any of them and Ditto scores 100% on a step it has largely not filled.
 */

const FIXTURE = readFileSync(
  resolvePath(__dirname, "../../fixtures/workday-my-experience.html"),
  "utf8"
)

beforeEach(() => {
  document.body.replaceChildren()
  document.body.insertAdjacentHTML("afterbegin", FIXTURE)
})

const fields = () => scan(document, workday)
const byLabel = (label: string) => fields().find((f) => f.label === label)
const keyFor = (label: string) =>
  match(byLabel(label)!, workday.rules ?? [], workday.key?.bind(workday))?.key ?? null

describe("what exists before anything is added", () => {
  it("finds only the education panel, the skills box and the resume", () => {
    expect(fields().map((f) => f.label)).toEqual([
      "School or University",
      "Degree",
      "Field of Study",
      "Type to Add Skills",
      "Resume/CV"
    ])
  })

  it("finds no work experience fields at all", () => {
    // Not a matching failure. There is nothing on the page to match: the
    // section is a heading and an Add button.
    expect(fields().some((f) => f.section?.startsWith("Work"))).toBe(false)
  })
})

describe("the education panel", () => {
  it("maps the three fields by their automation ids", () => {
    expect(keyFor("School or University")).toBe("education[].school")
    expect(keyFor("Degree")).toBe("education[].degree")
    // Workday calls the major a Field of Study.
    expect(keyFor("Field of Study")).toBe("education[].major")
  })

  it("pairs the panel with the first education entry", () => {
    // From the "Education 1" heading. The instance number in
    // data-fkit-id="education-16--school" is arbitrary and not an index.
    expect(byLabel("Degree")!.repeatIndex).toBe(0)
  })
})

describe("the resume upload", () => {
  it("recognizes it even though its wrapper is named formField- with nothing after", () => {
    // The convention that identifies every other field yields an empty string
    // here, so this one falls through to the file-input rule.
    expect(keyFor("Resume/CV")).toBe("resume")
    expect(byLabel("Resume/CV")!.kind).toBe("file")
  })

  it("knows it is required, from the label on the widget's container", () => {
    // The asterisk is in a label the FileUpload div points at with
    // aria-labelledby. Read from the hidden input alone there is no label at
    // all, and a required resume reports itself optional, which is the
    // progress bar lying in the direction that costs the user.
    expect(byLabel("Resume/CV")!.required).toBe(true)
  })
})

describe("the wizard", () => {
  it("names the step from the heading", () => {
    expect(workday.step?.(document)).toBe("My Experience")
  })

  it("offers the forward button and never the Back one", () => {
    const next = workday.nextControl?.(document)

    expect(next?.textContent).toBe("Save and Continue")
    expect(next?.getAttribute("data-automation-id")).toBe("pageFooterNextButton")
  })
})
