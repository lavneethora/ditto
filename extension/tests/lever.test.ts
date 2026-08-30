import { readFileSync } from "node:fs"
import { resolve as resolvePath } from "node:path"
import { beforeEach, describe, expect, it } from "vitest"

import { detectAdapter, greenhouse, lever } from "~adapters"
import { analyze } from "~core/engine"
import { match } from "~core/match"
import { resolve } from "~core/resolve"
import { scan } from "~core/scan"
import { emptyProfile } from "~profile/schema"

/**
 * Tier 1 recognition against markup captured from a live Lever posting.
 *
 * Every assertion corresponds to something the real page does that a
 * reasonable guess would have gotten wrong. See the fixture's header.
 */

const FIXTURE = readFileSync(resolvePath(__dirname, "../../fixtures/lever.html"), "utf8")

beforeEach(() => {
  document.body.replaceChildren()
  document.body.insertAdjacentHTML("afterbegin", FIXTURE)
})

const fields = () => scan(document, lever)
const byLabel = (label: string) => fields().find((f) => f.label === label)

describe("detection", () => {
  it("recognizes a lever.co URL", () => {
    expect(lever.detect(document, "https://jobs.lever.co/acme/abc/apply")).toBe(true)
  })

  it("is chosen over Greenhouse for a Lever page", () => {
    // Both use form id "application-form". Before the Greenhouse fingerprint
    // was tightened, Greenhouse claimed this page and then could not fill it.
    expect(greenhouse.detect(document, "https://jobs.lever.co/acme/abc/apply")).toBe(false)
    expect(detectAdapter(document, "https://jobs.lever.co/acme/abc/apply")?.id).toBe("lever")
  })

  it("scopes scanning to the application form", () => {
    expect(lever.root?.(document)?.id).toBe("application-form")
  })
})

describe("labels, which Lever never associates with its inputs", () => {
  it("reads the standard fields despite no label-for or aria-label", () => {
    const labels = fields().map((f) => f.label)

    expect(labels).toContain("Full name")
    expect(labels).toContain("Email")
    expect(labels).toContain("Phone")
    expect(labels).toContain("Current location")
    expect(labels).toContain("Current company")
  })

  it("reads a radio group's question, not its first option", () => {
    // Each option wraps its own <label>, so resolving the group from a radio
    // returns "Yes". The question is only on .application-label.
    const group = fields().find((f) => f.kind === "radiogroup")

    expect(group?.label).toBe("Are you a citizen of a country in the EU/EFTA?")
    expect(group?.label).not.toBe("Yes")
  })

  it("keeps the required marker out of the label but keeps the requirement", () => {
    const name = byLabel("Full name")

    expect(name?.label).toBe("Full name")
    expect(name?.required).toBe(true)
  })
})

describe("matching", () => {
  it("maps the standard fields", () => {
    const cases: [string, string][] = [
      ["Full name", "personal.fullName"],
      ["Email", "personal.email"],
      ["Phone", "personal.phone"],
      ["LinkedIn URL", "personal.linkedin"],
      ["GitHub URL", "personal.github"]
    ]

    for (const [label, key] of cases) {
      expect(match(byLabel(label)!, lever.rules)?.key).toBe(key)
    }
  })

  it("reads Current location as the applicant's own, not a past job's", () => {
    // The shared rule reads a bare "location" as work[].location, which would
    // put a previous employer's city into the candidate's address field.
    const field = byLabel("Current location")!
    const matched = match(field, lever.rules)!

    expect(matched.key).toBe("personal.location")
    expect(matched.key).not.toBe("work[].location")
  })

  it("composes Current location from the stored city and state", () => {
    const profile = emptyProfile()
    profile.personal.city = "Austin"
    profile.personal.state = "Texas"

    const field = byLabel("Current location")!
    expect(resolve(match(field, lever.rules)!, field, profile)).toEqual({
      kind: "text",
      value: "Austin, Texas"
    })
  })

  it("maps Current company to the most recent employer", () => {
    expect(match(byLabel("Current company")!, lever.rules)?.key).toBe("work[].company")
  })

  it("maps the resume file input", () => {
    const file = fields().find((f) => f.kind === "file")!
    expect(match(file, lever.rules)?.key).toBe("resume")
  })

  it("answers a relocation question asked as a radio group", () => {
    const profile = emptyProfile()
    profile.preferences.willingToRelocate = true

    const field = byLabel("Are you willing to relocate for this role?")!
    expect(resolve(match(field, lever.rules)!, field, profile)).toEqual({
      kind: "boolean",
      value: true
    })
  })

  it("leaves company-specific questions unmatched", () => {
    const custom = byLabel("Are you a citizen of a country in the EU/EFTA?")!
    expect(match(custom, lever.rules)).toBeNull()
  })
})

describe("things Ditto must not touch", () => {
  it("never scans the marketing consent checkbox", () => {
    // Ticking a marketing opt-in on someone's behalf is not autofill.
    const consent = fields().find((f) => f.el.getAttribute("name")?.startsWith("consent["))
    expect(consent).toBeUndefined()
  })

  it("never scans the submit button", () => {
    expect(fields().some((f) => f.el.tagName === "BUTTON")).toBe(false)
  })

  it("never scans Lever's hidden bookkeeping inputs", () => {
    const names = fields().map((f) => f.el.getAttribute("name") ?? "")
    expect(names).not.toContain("selectedLocation")
  })
})

describe("grouped controls collapse to one question", () => {
  it("reports a check-all-that-apply group once, not once per box", () => {
    const group = fields().filter((f) => f.label === "Please check all that apply")

    expect(group).toHaveLength(1)
    expect(group[0].kind).toBe("multiselect")
    expect(group[0].options).toHaveLength(3)
  })
})

describe("recognition rate", () => {
  it("recognizes every field that maps to profile data", () => {
    const { fields: found, recognized } = analyze(document, lever)
    const unmatched = found.filter((f) => match(f, lever.rules) === null)

    // The only unmatched fields are the company-specific cards.
    expect(unmatched.every((f) => /EU\/EFTA|check all that apply/.test(f.label))).toBe(true)
    expect(recognized).toBe(found.length - unmatched.length)
  })
})
