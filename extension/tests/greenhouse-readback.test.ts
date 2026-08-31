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
