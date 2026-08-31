import { describe, expect, it } from "vitest"

import { keyLabel } from "~core/types"
import { match } from "~core/match"
import type { FieldSpec, ProfileKey } from "~core/types"
import { canonical } from "~core/label"

/**
 * Questions the user has told Ditto the meaning of.
 *
 * The packaged rules recognise a wording. Forms mean the same thing and spell
 * it however they like, and no table of phrasings converges: there is always
 * another form, and always a company asking something only it asks. So the
 * user answers that once and it holds.
 *
 * The mapping points at a profile FIELD, not at the text that was typed. A
 * stored answer goes quietly stale when the profile changes; a stored mapping
 * follows it.
 */

const field = (label: string, kind: FieldSpec["kind"] = "text"): FieldSpec =>
  ({ id: "q", el: document.createElement("input"), kind, label, required: true }) as FieldSpec

const taught = (label: string, key: ProfileKey) => [{ label: canonical(label), key }]

const keyFor = (label: string, learned: { label: string; key: string }[] = []) =>
  match(field(label), [], undefined, learned)?.key ?? null

describe("the question is kept as the form asked it", () => {
  it("matches on the canonical form while storing the original", () => {
    // Stored for display, canonicalised only when compared. The list showed
    // "what is your handle on github" for a question that was asked as
    // "What is your handle on GitHub?".
    const learned = [{ label: "What is your handle on GitHub?", key: "personal.github" }]

    expect(keyFor("What is your handle on GitHub?", learned)).toBe("personal.github")
    expect(keyFor("what is your handle on github", learned)).toBe("personal.github")
  })
})

describe("a question the user has explained", () => {
  it("is answered from the field they chose", () => {
    const learned = taught("What is your handle on GitHub", "personal.github")

    expect(keyFor("What is your handle on GitHub", learned)).toBe("personal.github")
  })

  it("holds however the next form spells it", () => {
    // Taught once, and put through the same spellings the rules get.
    const learned = taught("Alma Mater", "education[].school")

    expect(keyFor("Alma Mater", learned)).toBe("education[].school")
    expect(keyFor("alma mater", learned)).toBe("education[].school")
    expect(keyFor("Alma Maters", learned)).toBe("education[].school")
  })

  it("outranks a rule that would have answered differently", () => {
    // A pattern is a guess about what forms tend to call things. This is the
    // person whose application it is, saying what this one asks.
    expect(keyFor("Country")).toBe("personal.country")
    expect(keyFor("Country", taught("Country", "eligibility.residentCountry"))).toBe(
      "eligibility.residentCountry"
    )
  })

  it("may answer the questions a guess never could", () => {
    // The danger with eligibility and equal-employment keys was never the key
    // itself, it was answering without being told. Being told is the whole
    // mechanism here.
    const learned = taught("Have you served in the armed services of any nation", "eeo.veteran")

    expect(keyFor("Have you served in the armed services of any nation", learned)).toBe("eeo.veteran")
  })

  it("still refuses consent, whatever it was taught", () => {
    // Consent is refused before anything else is considered, including this.
    const learned = taught("Do you consent to the processing of your personal data", "eeo.gender")

    expect(keyFor("Do you consent to the processing of your personal data", learned)).toBeNull()
  })

  it("prefers the more specific of two overlapping lessons", () => {
    const learned = [
      { label: canonical("Start date"), key: "work[].startDate" },
      { label: canonical("Start date at your current employer"), key: "work[].startDate" },
      { label: canonical("Start date"), key: "preferences.earliestStart" }
    ]

    // Longest taught label first, so a general lesson cannot swallow a
    // specific one that happens to contain it.
    expect(keyFor("Start date at your current employer", learned)).toBe("work[].startDate")
  })

  it("changes nothing when nothing has been taught", () => {
    expect(keyFor("Alma Mater", [])).toBe("education[].school")
    expect(keyFor("Some question nobody has explained", [])).toBeNull()
  })

  it("ignores a half-written entry rather than matching everything", () => {
    expect(keyFor("Anything", [{ label: "", key: "personal.firstName" }])).toBeNull()
    expect(keyFor("Anything", [{ label: "anything", key: "" }])).toBeNull()
  })
})

describe("the picker names fields the way a person would", () => {
  it("reads a key as a section and a field", () => {
    expect(keyLabel("personal.firstName")).toBe("Personal · First Name")
    expect(keyLabel("eeo.veteran")).toBe("Equal Employment · Veteran")
    expect(keyLabel("eligibility.residentCountry")).toBe("Eligibility · Resident Country")
  })

  it("does not mangle acronyms into words", () => {
    // "Linkedin" and "Authorized Us" in a picker read as a bug.
    expect(keyLabel("personal.linkedin")).toBe("Personal · LinkedIn")
    expect(keyLabel("personal.github")).toBe("Personal · GitHub")
    expect(keyLabel("eeo.authorizedUS")).toBe("Equal Employment · Authorized US")
    expect(keyLabel("education[].gpa")).toBe("Education (each entry) · GPA")
  })

  it("splits a number off the word before it", () => {
    expect(keyLabel("personal.addressLine1")).toBe("Personal · Address Line 1")
    expect(keyLabel("eligibility.atLeast18")).toBe("Eligibility · At Least 18")
  })

  it("leaves joining words lowercase", () => {
    expect(keyLabel("eligibility.boundByAgreements")).toBe("Eligibility · Bound by Agreements")
    expect(keyLabel("preferences.willingToRelocate")).toBe("Preferences · Willing to Relocate")
  })

  it("says when a field belongs to a repeated block", () => {
    expect(keyLabel("work[].company")).toBe("Work (each entry) · Company")
  })

  it("handles a key with no section", () => {
    expect(keyLabel("skills")).toBe("Skills")
  })
})
