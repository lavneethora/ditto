import { readFileSync } from "node:fs"
import { resolve as resolvePath } from "node:path"
import { beforeEach, describe, expect, it } from "vitest"

import { ashby, detectAdapter } from "~adapters"
import { analyze } from "~core/engine"
import { match } from "~core/match"
import { resolve } from "~core/resolve"
import { scan } from "~core/scan"
import { emptyProfile } from "~profile/schema"

/**
 * Tier 1 recognition against markup captured from a live Ashby posting.
 */

const FIXTURE = readFileSync(resolvePath(__dirname, "../../fixtures/ashby.html"), "utf8")

beforeEach(() => {
  document.body.replaceChildren()
  document.body.insertAdjacentHTML("afterbegin", FIXTURE)
})

const fields = () => scan(document, ashby)
const byLabel = (label: string) => fields().find((f) => f.label === label)
const keyFor = (label: string) =>
  match(byLabel(label)!, ashby.rules, ashby.key?.bind(ashby))?.key

describe("detection", () => {
  it("recognizes an ashbyhq.com URL", () => {
    expect(detectAdapter(document, "https://jobs.ashbyhq.com/acme/abc/application")?.id).toBe("ashby")
  })

  it("recognizes the form by its markup", () => {
    expect(ashby.detect(document, "https://careers.example.com")).toBe(true)
  })
})

describe("the data-field-path shortcut", () => {
  it("names the core fields exactly, without reading a label", () => {
    // An exact identifier the site publishes, so a copy change to any of
    // these labels cannot break the mapping.
    expect(keyFor("Full Name")).toBe("personal.fullName")
    expect(keyFor("Email")).toBe("personal.email")
    expect(keyFor("Location")).toBe("personal.location")
  })

  it("reports that it came from the adapter rather than a pattern", () => {
    const matched = match(byLabel("Full Name")!, ashby.rules, ashby.key?.bind(ashby))
    expect(matched?.rule).toBe("adapter key")
  })

  it("falls back to labels for company-specific fields", () => {
    // These carry a UUID field path, which means nothing to us.
    expect(keyFor("Phone")).toBe("personal.phone")
    expect(keyFor("LinkedIn Profile")).toBe("personal.linkedin")
  })

  it("maps the resume file input", () => {
    const file = fields().find((f) => f.kind === "file")!
    expect(match(file, ashby.rules, ashby.key?.bind(ashby))?.key).toBe("resume")
  })
})

describe("groups whose option labels are siblings", () => {
  it("reads the question, not the list of options", () => {
    // Each option's <label for> sits beside its input rather than around it,
    // so removing only ancestor rows leaves every option in the question.
    const group = fields().find((f) => f.kind === "radiogroup")!

    expect(group.label).toBe("What pronouns would you like our team to use when addressing you?")
    expect(group.label).not.toMatch(/He\/Him|She\/Her/)
  })

  it("answers it from the stored pronouns", () => {
    const profile = emptyProfile()
    profile.eeo.pronouns = "He/Him"

    const group = fields().find((f) => f.kind === "radiogroup")!
    const matched = match(group, ashby.rules, ashby.key?.bind(ashby))!

    expect(matched.key).toBe("eeo.pronouns")
    expect(resolve(matched, group, profile)).toEqual({ kind: "text", value: "He/Him" })
  })
})

describe("checkbox groups whose options have different names", () => {
  it("reports one question, not one per option", () => {
    // Ashby names each box after its own option text and relies on a shared
    // fieldset, so grouping by name alone produces a row per option.
    const groups = fields().filter((f) => f.kind === "multiselect")

    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe("How did you hear about us?")
    expect(groups[0].options).toHaveLength(3)
  })

  it("maps to how you heard about them", () => {
    const group = fields().find((f) => f.kind === "multiselect")!
    expect(match(group, ashby.rules, ashby.key?.bind(ashby))?.key).toBe("preferences.howDidYouHear")
  })
})

describe("things Ditto must not touch", () => {
  it("never scans the recaptcha field", () => {
    expect(fields().some((f) => f.el.getAttribute("name") === "g-recaptcha-response")).toBe(false)
  })

  it("never scans the submit button", () => {
    expect(fields().some((f) => f.el.tagName === "BUTTON")).toBe(false)
  })
})

describe("location is a dropdown wearing a text input's clothes", () => {
  it("is scanned as a combobox", () => {
    expect(byLabel("Location")?.kind).toBe("combobox")
  })

  it("resolves to the applicant's own location", () => {
    const profile = emptyProfile()
    profile.personal.city = "Lubbock"
    profile.personal.state = "Texas"

    const field = byLabel("Location")!
    const matched = match(field, ashby.rules, ashby.key?.bind(ashby))!

    expect(resolve(matched, field, profile)).toEqual({ kind: "text", value: "Lubbock, Texas" })
  })
})

describe("recognition rate", () => {
  it("recognizes every field that maps to profile data", () => {
    const { fields: found, recognized } = analyze(document, ashby)
    expect(recognized).toBeGreaterThanOrEqual(found.length - 1)
  })
})
