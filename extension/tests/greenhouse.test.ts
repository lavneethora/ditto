import { readFileSync } from "node:fs"
import { resolve as resolvePath } from "node:path"
import { beforeEach, describe, expect, it } from "vitest"

import { greenhouse } from "~adapters/greenhouse"
import { analyze } from "~core/engine"
import { match } from "~core/match"
import { scan } from "~core/scan"

/**
 * Tier 1 recognition, run against markup captured from a live Greenhouse
 * board rather than markup written to make the engine look good.
 *
 * Every assertion here corresponds to something the real page does that a
 * reasonable guess would have gotten wrong. See the fixture's header comment.
 */

const FIXTURE = readFileSync(
  resolvePath(__dirname, "../../fixtures/greenhouse-react.html"),
  "utf8"
)

function load(): Document {
  document.body.replaceChildren()
  document.body.insertAdjacentHTML("afterbegin", FIXTURE)
  return document
}

function fieldByLabel(doc: Document, label: string) {
  return scan(doc, greenhouse).find((f) => f.label === label)
}

beforeEach(() => {
  load()
})

describe("detection", () => {
  it("does not claim a page by the shared form id alone", () => {
    // Lever's form is also id="application-form". Fingerprinting on that made
    // Greenhouse claim every Lever page and then fail to fill it, so markup
    // detection now requires a marker that is actually Greenhouse's own.
    expect(greenhouse.detect(document, "https://example.com/careers")).toBe(false)
  })

  it("recognizes a greenhouse.io URL", () => {
    expect(greenhouse.detect(document, "https://job-boards.greenhouse.io/anthropic/jobs/1")).toBe(true)
  })

  it("scopes scanning to the application form", () => {
    expect(greenhouse.root?.(document)?.id).toBe("application-form")
  })
})

describe("scanning the real form", () => {
  it("finds the visible application fields", () => {
    const labels = scan(document, greenhouse).map((f) => f.label)

    expect(labels).toContain("First Name")
    expect(labels).toContain("Last Name")
    expect(labels).toContain("Email")
    expect(labels).toContain("Phone")
    expect(labels).toContain("Country")
  })

  it("strips the required asterisk from the label but keeps the requirement", () => {
    const first = fieldByLabel(document, "First Name")

    // The raw label is "First Name*", with the marker in a nested span.
    expect(first?.label).toBe("First Name")
    expect(first?.required).toBe(true)
  })

  it("does not scan react-select's hidden required proxy input", () => {
    // react-select renders <input required aria-hidden="true"> to drive native
    // validation. Treating it as a field would report a permanently unfillable
    // required question.
    const fields = scan(document, greenhouse)
    const proxies = fields.filter((f) => f.el.getAttribute("aria-hidden") === "true")

    expect(proxies).toHaveLength(0)
  })

  it("does not scan the submit button", () => {
    const fields = scan(document, greenhouse)
    expect(fields.some((f) => f.el.tagName === "BUTTON")).toBe(false)
  })

  it("labels the resume field from its enclosing group, not the Attach button", () => {
    // The input's own label is "Attach", which is shared with three sibling
    // buttons and tells the user nothing.
    const fields = scan(document, greenhouse)
    const file = fields.find((f) => f.kind === "file")

    expect(file?.label).toBe("Resume/CV")
  })

  it("sees both dropdowns as comboboxes, not text inputs", () => {
    const fields = scan(document, greenhouse)
    const comboboxes = fields.filter((f) => f.kind === "combobox")

    // The country field and the custom question are both react-select.
    expect(comboboxes.length).toBeGreaterThanOrEqual(2)
  })
})

describe("matching the real form", () => {
  it("uses the autocomplete attribute for names and email", () => {
    const first = fieldByLabel(document, "First Name")!
    const last = fieldByLabel(document, "Last Name")!
    const email = fieldByLabel(document, "Email")!

    expect(match(first, greenhouse.rules)?.key).toBe("personal.firstName")
    expect(match(first, greenhouse.rules)?.rule).toBe("autocomplete")
    expect(match(last, greenhouse.rules)?.key).toBe("personal.lastName")
    expect(match(email, greenhouse.rules)?.key).toBe("personal.email")
  })

  it("reads Country inside the phone fieldset as the dialling code", () => {
    // The single most damaging mismatch on this form: the label says
    // "Country" but it sits inside <fieldset class="phone-input"> with
    // <legend>Phone</legend>, so it is the phone country, not the mailing
    // address country.
    const country = fieldByLabel(document, "Country")!

    expect(country.section).toBe("Phone")
    expect(match(country, greenhouse.rules)?.key).toBe("personal.phoneCountryCode")
    expect(match(country, greenhouse.rules)?.key).not.toBe("personal.country")
  })

  it("maps the phone field to the phone number", () => {
    const phone = fieldByLabel(document, "Phone")!
    expect(match(phone, greenhouse.rules)?.key).toBe("personal.phone")
  })

  it("maps the file input to the resume", () => {
    const file = scan(document, greenhouse).find((f) => f.kind === "file")!
    expect(match(file, greenhouse.rules)?.key).toBe("resume")
  })

  it("leaves a company-specific question unmatched rather than guessing", () => {
    // "Please note that you will not be considered unless you complete the
    // Constellation application form." has no profile answer. Inventing one
    // would put words in the user's mouth.
    const fields = scan(document, greenhouse)
    const custom = fields.find((f) => f.label.startsWith("Please note"))

    expect(custom).toBeDefined()
    expect(match(custom!, greenhouse.rules)).toBeNull()
  })
})

describe("recognition rate", () => {
  it("recognizes every field that maps to profile data", () => {
    const { fields, recognized } = analyze(document, greenhouse)

    // Five of the six scanned fields map to the profile. The sixth is the
    // company-specific question, which correctly does not.
    const unrecognized = fields.filter((f) => match(f, greenhouse.rules) === null)

    expect(unrecognized.every((f) => f.label.startsWith("Please note"))).toBe(true)
    expect(recognized).toBe(fields.length - unrecognized.length)
    expect(recognized).toBeGreaterThanOrEqual(5)
  })
})
