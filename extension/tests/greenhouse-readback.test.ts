import { beforeEach, describe, expect, it } from "vitest"

import { readComboboxValue } from "~core/fill/combobox"
import { pickText } from "~core/fill/options"
import type { FieldSpec } from "~core/types"
import { verify } from "~core/verify"

/**
 * Greenhouse, where the same complaint kept coming back: a field is filled on
 * screen and the panel puts a red cross beside it.
 *
 * Every case was the read-back looking in the wrong place, never the fill.
 */

beforeEach(() => {
  document.body.replaceChildren()
})

describe("a react-select that has been chosen", () => {
  it("reads the value beside the search box, not the empty search box", () => {
    // react-select clears its input after a selection and paints the answer
    // next to it. Ditto only looked under a `__control` ancestor, which exists
    // only when a site sets classNamePrefix, and Greenhouse does not.
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div class="field">
         <div class="css-1hb7zxy-singleValue">Texas Tech University</div>
         <input id="school" role="combobox" value="">
       </div>`
    )

    expect(readComboboxValue(document.getElementById("school")!)).toBe("Texas Tech University")
  })

  it("does not read the placeholder as a value", () => {
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div class="field">
         <div class="css-1jqq78o-placeholder">Select...</div>
         <input id="school" role="combobox" value="">
       </div>`
    )

    expect(readComboboxValue(document.getElementById("school")!)).toBe("")
  })
})

describe("a resume the uploader has taken", () => {
  const field = (el: Element): FieldSpec =>
    ({ id: "r", el, kind: "file", label: "Resume", required: true }) as FieldSpec

  it("reads the filename the page is showing", () => {
    // Greenhouse empties the input and lists the file beside it.
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div class="field">
         <input type="file" id="resume">
         <div class="attachment">Hora_Lavneet_Resume.pdf  Delete</div>
       </div>`
    )

    const result = verify(field(document.getElementById("resume")!), {
      kind: "wrote",
      value: "Hora_Lavneet_Resume.pdf"
    })

    expect(result.status).toBe("filled")
  })

  it("still refuses when nothing was attached", () => {
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div class="field"><input type="file" id="resume"><div class="attachment">No file chosen</div></div>`
    )

    const result = verify(field(document.getElementById("resume")!), {
      kind: "wrote",
      value: "Hora_Lavneet_Resume.pdf"
    })

    expect(result.status).toBe("error")
  })
})

describe("two schools that differ by one word", () => {
  const options = (...labels: string[]) => labels.map((label) => ({ label, value: label }))

  it("never answers Texas Tech with Arkansas Tech", () => {
    // Two words in common out of three was enough to pass, and a school
    // nobody attended went onto an application.
    expect(
      pickText(options("Arkansas Tech University"), "Texas Tech University")
    ).toBeNull()
  })

  it("takes the right one when both are offered", () => {
    const list = options("Arkansas Tech University", "Texas Tech University")

    expect(pickText(list, "Texas Tech University")?.label).toBe("Texas Tech University")
  })

  it("still answers a value with its shorter form", () => {
    expect(pickText(options("United States"), "United States of America")?.label).toBe(
      "United States"
    )
  })
})

describe("a react-select whose parts have no names", () => {
  /**
   * Emotion builds class names like `css-1hb7zxy` with nothing in them to
   * match on, so the singleValue lookup finds nothing and the read-back falls
   * through to the search box, which is empty after a selection.
   *
   * That is worse than a wrong report. When the value cannot be read, commit
   * believes its click failed and moves on to pressing arrow keys and Enter,
   * which is how a Discipline of "Computer Science" ended up as "Fashion".
   */

  it("reads the value the field is left showing", () => {
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div class="field">
         <label for="discipline">Discipline*</label>
         <div class="css-1pahdxg-control">
           <div class="css-1d8n9bt"><div class="css-qc6sy">Computer Science</div></div>
           <input id="discipline" role="combobox" value="">
           <div class="css-1hb7zxy-indicatorContainer"><svg></svg></div>
         </div>
       </div>`
    )

    expect(readComboboxValue(document.getElementById("discipline")!)).toBe("Computer Science")
  })

  it("reads nothing from a field that has not been chosen", () => {
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div class="field">
         <label for="discipline">Discipline*</label>
         <div class="css-1pahdxg-control">
           <div class="css-1wa3eu0-placeholder">Select...</div>
           <input id="discipline" role="combobox" value="">
         </div>
       </div>`
    )

    expect(readComboboxValue(document.getElementById("discipline")!)).toBe("")
  })

  it("does not mistake an open results list for the answer", () => {
    // Lever renders its results as siblings of the box, and reading those as
    // the value reported a selection nobody made.
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div>
         <input id="loc" class="location-input" type="text">
         <div class="dropdown-container">
           <div class="dropdown-location">Lubbock, TX, USA</div>
         </div>
       </div>`
    )

    expect(readComboboxValue(document.getElementById("loc")!)).toBe("")
  })

  it("does not read a long description as a value", () => {
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div class="field">
         <div class="helper">We ask this because we are always aiming to keep our school list inclusive of all institutions, and your answer helps us do that.</div>
         <input id="q" role="combobox" value="">
       </div>`
    )

    expect(readComboboxValue(document.getElementById("q")!)).toBe("")
  })
})

describe("a dialling code", () => {
  const options = (...labels: string[]) => labels.map((label) => ({ label, value: label }))

  it("finds the country carrying it", () => {
    // "+1" is one short token in a three word option, so the ordinary overlap
    // test rejected it for not accounting for enough of the option, and the
    // phone country field went unanswered.
    expect(pickText(options("United Kingdom +44", "United States +1"), "+1")?.label).toBe(
      "United States +1"
    )
  })

  it("does not take a different code", () => {
    expect(pickText(options("Australia +61", "Norfolk Island +672"), "+1")).toBeNull()
  })

  it("does not loosen matching for ordinary one-word values", () => {
    // The rule is for codes only: a name still has to account for most of the
    // option it matches.
    expect(pickText(options("Documentum Java"), "Java")).toBeNull()
  })
})
