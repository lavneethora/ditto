import { describe, expect, it } from "vitest"

import { normalizeWording, singularize } from "~core/label"
import { match } from "~core/match"
import type { FieldSpec } from "~core/types"

/**
 * The same question, written differently.
 *
 * Forms mean the same thing and spell it however they like, and the rules are
 * written once. Finding each spelling as a user hits it does not converge:
 * Workday labels its veteran question "Veterans status", and `\bveteran\b`
 * cannot match "veterans" because the word boundary has to fall right after
 * the n. A required legal self-identification was skipped over one letter.
 *
 * So the label is tried as written, and only if nothing matched at all, again
 * with every word reduced to its singular. Being a fallback is what makes it
 * safe: a label that already matched keeps its match.
 */

const field = (label: string): FieldSpec =>
  ({ id: "q", el: document.createElement("input"), kind: "combobox", label, required: true }) as FieldSpec

const keyFor = (label: string) => match(field(label))?.key ?? null

describe("a rule written once, in the singular", () => {
  for (const [plural, key] of [
    ["Veterans status", "eeo.veteran"],
    ["Races", "eeo.race"],
    ["Ethnic Groups", "eeo.race"],
    ["Disabilities", "eeo.disability"],
    ["Countries of Citizenship", "eligibility.citizenships"],
    ["Websites", "personal.website"],
    ["Phone Numbers", "personal.phone"],
    ["Previous Employers", "work[].company"],
    ["Schools Attended", "education[].school"]
  ] as const) {
    it(`recognises "${plural}"`, () => {
      expect(keyFor(plural)).toBe(key)
    })
  }

  it("leaves the singular spellings exactly as they were", () => {
    expect(keyFor("Veteran Status")).toBe("eeo.veteran")
    expect(keyFor("Race/Ethnicity")).toBe("eeo.race")
    expect(keyFor("Website")).toBe("personal.website")
  })
})

describe("the fallback cannot change an existing answer", () => {
  it("does not let a list of who qualifies steal the question", () => {
    // Caught by an existing test when this ran in one pass rather than as a
    // fallback. "U.S. citizens, lawful permanent residents (green card
    // holders)" explains who may work; singularising it made the rule about
    // being a permanent resident reachable, and it outranked the question
    // that was actually being asked.
    expect(keyFor("Are you legally authorized to work")).toBe("eeo.authorizedUS")
  })

  it("does not invent a match for a label that means nothing to Ditto", () => {
    expect(keyFor("Status")).toBeNull()
    expect(keyFor("Notes")).toBeNull()
  })
})

describe("the singulariser knows what is not a plural", () => {
  it("leaves words that merely end in s", () => {
    // Each of these ends in a pattern the rules would otherwise strip, and
    // each turns up in a form label.
    expect(singularize("status")).toBe("status")
    expect(singularize("business address")).toBe("business address")
    expect(singularize("previous employer")).toBe("previous employer")
    expect(singularize("yes")).toBe("yes")
  })

  it("handles the endings that do change", () => {
    expect(singularize("countries")).toBe("country")
    expect(singularize("addresses")).toBe("address")
    expect(singularize("veterans")).toBe("veteran")
    expect(singularize("disabilities")).toBe("disability")
  })
})

describe("the same question, paraphrased", () => {
  /**
   * Vocabulary rather than morphology. "Alma Mater" and "School" share no
   * letters, so no amount of stemming connects them, and adding a regex per
   * phrasing does not converge because there is always another form.
   */
  for (const [reworded, key] of [
    ["Alma Mater", "education[].school"],
    ["Family Name", "personal.lastName"],
    ["Given Name", "personal.firstName"],
    ["Surname", "personal.lastName"],
    ["Nickname", "personal.preferredFirstName"],
    ["Mobile Number", "personal.phone"],
    ["Telephone", "personal.phone"],
    ["Zip Code", "personal.postalCode"],
    ["Postcode", "personal.postalCode"],
    ["Field of Study", "education[].major"],
    ["Qualification", "education[].degree"],
    ["Employer", "work[].company"],
    ["Position Title", "work[].title"],
    ["Remuneration", "preferences.desiredSalary"],
    ["Ethnic Background", "eeo.race"],
    ["Gender Identity", "eeo.gender"],
    ["Nationality", "eligibility.citizenships"],
    ["Curriculum Vitae", "resume"],
    ["Do you have the right to work in the US?", "eeo.authorizedUS"],
    ["Will you require visa sponsorship?", "eeo.requiresSponsorship"],
    ["Are you bound by a restrictive covenant?", "eligibility.boundByAgreements"]
  ] as const) {
    it(`recognises "${reworded}"`, () => {
      expect(keyFor(reworded)).toBe(key)
    })
  }

  it("handles a label that is reworded AND pluralised", () => {
    // Neither normalisation reaches these alone.
    expect(keyFor("Alma Maters")).toBe("education[].school")
    expect(keyFor("Ethnic Backgrounds")).toBe("eeo.race")
    expect(keyFor("Employers")).toBe("work[].company")
  })

  it("rewrites the longest phrase first", () => {
    // "family name" has to be rewritten before "name" gets a chance.
    expect(normalizeWording("family name")).toBe("last name")
    expect(normalizeWording("given name")).toBe("first name")
  })

  it("does not rewrite a word inside another word", () => {
    // "cv" is a synonym for resume; "cvs" and "mcv" are not.
    expect(normalizeWording("mcv level")).toBe("mcv level")
  })

  it("changes nothing when there is nothing to change", () => {
    expect(normalizeWording("first name")).toBe("first name")
  })
})
