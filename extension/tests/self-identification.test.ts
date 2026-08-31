import { describe, expect, it } from "vitest"

import { pickText, pickTriState } from "~core/fill/options"
import { match } from "~core/match"
import { resolve } from "~core/resolve"
import type { FieldSpec } from "~core/types"
import { ProfileSchema } from "~profile/schema"

/**
 * Workday's Voluntary Disclosures, in its own words.
 *
 * Every option below was copied off a live application. Two of them broke
 * things that fixtures written from the standard three-option wording never
 * would have caught.
 */

const opts = (labels: string[]) => labels.map((label) => ({ label, value: label }))

/** Four answers, not the usual two, and two of them start affirmatively. */
const VETERAN = opts([
  "I IDENTIFY AS ONE OR MORE OF THE CLASSIFICATIONS OF PROTECTED VETERANS LISTED ABOVE",
  "I IDENTIFY AS A VETERAN, JUST NOT A PROTECTED VETERAN",
  "I AM NOT A VETERAN",
  "I DO NOT WISH TO SELF-IDENTIFY"
])

/** Every option carries the jurisdiction it applies in. */
const RACE = opts([
  "American Indian or Alaska Native (United States of America)",
  "Asian (United States of America)",
  "Black or African American (United States of America)",
  "Hispanic or Latino (United States of America)",
  "Native Hawaiian or Other Pacific Islander (United States of America)",
  "Not Classified (United States of America)",
  "Prefer not to disclose (United States of America)",
  "Two or More Races (United States of America)",
  "White (United States of America)"
])

const DISABILITY = opts([
  "Yes, I have a disability, or have had one in the past",
  "No, I do not have a disability and have not had one in the past",
  "I do not want to answer"
])

describe("the veteran question with four answers", () => {
  it("does not tell a veteran they are not one", () => {
    // "I AM NOT A VETERAN" begins with the affirmative "i am", so a plain
    // search for affirmatives took it as the yes and inverted the answer on a
    // legal self-identification.
    expect(pickTriState(VETERAN, "yes")?.label).toBe(
      "I IDENTIFY AS ONE OR MORE OF THE CLASSIFICATIONS OF PROTECTED VETERANS LISTED ABOVE"
    )
  })

  it("does not take the option that reverses itself halfway through", () => {
    // "I IDENTIFY AS A VETERAN, JUST NOT A PROTECTED VETERAN" reads as a yes
    // right up to the word that undoes it, and it sits beside the real yes.
    expect(pickTriState(VETERAN, "yes")?.label).not.toContain("JUST NOT")
  })

  it("answers no with the plain no", () => {
    expect(pickTriState(VETERAN, "no")?.label).toBe("I AM NOT A VETERAN")
  })

  it("declines in the form's own words", () => {
    // None of the existing decline phrasings reached "SELF-IDENTIFY".
    expect(pickTriState(VETERAN, "decline")?.label).toBe("I DO NOT WISH TO SELF-IDENTIFY")
  })
})

describe("race options carrying a jurisdiction", () => {
  it("reads Asian out of Asian (United States of America)", () => {
    // The tail is longer than the answer, which the scorer read as naming
    // something else, so every race option was rejected and a required
    // question went unanswered.
    expect(pickText(RACE, "Asian")?.label).toBe("Asian (United States of America)")
  })

  it("handles the multi-word ones too", () => {
    expect(pickText(RACE, "Two or More Races")?.label).toBe(
      "Two or More Races (United States of America)"
    )
    expect(pickText(RACE, "Black or African American")?.label).toBe(
      "Black or African American (United States of America)"
    )
  })

  it("still refuses a partial match dressed up in parentheses", () => {
    // The rescue requires the head to match exactly, so it cannot turn a
    // near-miss into an answer.
    expect(pickText(opts(["Asian Studies (United States of America)"]), "Asian")).toBeNull()
  })
})

describe("the disability question keeps working", () => {
  it("does not let a longer decline outrank the plain no", () => {
    // "I do not want to answer" matches the negative "i do not" more fully
    // than "No, I do not have a disability" matches "no".
    expect(pickTriState(DISABILITY, "no")?.label).toBe(
      "No, I do not have a disability and have not had one in the past"
    )
    expect(pickTriState(DISABILITY, "yes")?.label).toBe(
      "Yes, I have a disability, or have had one in the past"
    )
    expect(pickTriState(DISABILITY, "decline")?.label).toBe("I do not want to answer")
  })
})

describe("accepting the terms of applying", () => {
  const field = (label: string): FieldSpec =>
    ({ id: "t", el: document.createElement("input"), kind: "checkbox", label, required: true }) as FieldSpec

  const keyFor = (label: string) => match(field(label))?.key ?? null

  it("ticks the box without asking", () => {
    const f = field("I accept the Terms and Conditions.")
    const matched = match(f)!

    expect(matched.key).toBe("forms.acceptTerms")
    expect(resolve(matched, f, ProfileSchema.parse({}))).toEqual({ kind: "boolean", value: true })
  })

  it("covers the ways forms word it", () => {
    expect(keyFor("I have read and agree to the Privacy Policy")).toBe("forms.acceptTerms")
    expect(keyFor("I acknowledge the Terms of Service")).toBe("forms.acceptTerms")
  })

  it("does not sign the user up for anything", () => {
    // An acceptance word with no policy document behind it is a different
    // kind of box.
    expect(keyFor("I agree to receive updates about future roles")).toBeNull()
  })

  it("still refuses actual consent", () => {
    // Agreeing a policy was shown to you is an acknowledgement. Agreeing to
    // your data being processed, or to AI reading your application, is a
    // decision that stays the user's.
    expect(keyFor("Do you consent to the processing of your personal data?")).toBeNull()
    expect(
      keyFor("ADI may use artificial intelligence to review your application. Do you consent?")
    ).toBeNull()
  })

  it("does not certify anything on the user's behalf", () => {
    expect(keyFor("I certify that the information provided is true and complete")).toBeNull()
  })
})

describe("labels written in the plural", () => {
  const field = (label: string, kind: FieldSpec["kind"] = "combobox"): FieldSpec =>
    ({ id: "q", el: document.createElement("input"), kind, label, required: true }) as FieldSpec

  const keyFor = (label: string, kind?: FieldSpec["kind"]) => match(field(label, kind))?.key ?? null

  it("recognises Veterans status", () => {
    // Workday's own label. `\bveteran\b` cannot match "veterans": the
    // boundary has to fall right after the n, and there is an s there. A
    // required self-identification was skipped over one letter.
    expect(keyFor("Veterans status")).toBe("eeo.veteran")
  })

  it("still recognises the singular", () => {
    expect(keyFor("Veteran Status")).toBe("eeo.veteran")
    expect(keyFor("Are you a protected veteran?")).toBe("eeo.veteran")
  })

  it("recognises races and ethnic groups", () => {
    expect(keyFor("Race/Ethnicity")).toBe("eeo.race")
    expect(keyFor("Races")).toBe("eeo.race")
    expect(keyFor("Ethnic Groups")).toBe("eeo.race")
  })

  it("finds the question under a wall of legal text", () => {
    // Workday puts five numbered paragraphs of VEVRAA text above these
    // fields, and a label resolver can pick the lot up.
    const preamble =
      "Voluntary Self-Identification. This employer is a Government contractor subject to the Vietnam Era Veterans Readjustment Assistance Act of 1974, as amended by the Jobs for Veterans Act of 2002. Submission of this information is voluntary. Veterans status"

    expect(keyFor(preamble)).toBe("eeo.veteran")
  })
})

describe("race asked as a multi-select", () => {
  const field = (kind: FieldSpec["kind"]): FieldSpec =>
    ({ id: "r", el: document.createElement("input"), kind, label: "Race/Ethnicity", required: true }) as FieldSpec

  const answer = (kind: FieldSpec["kind"], race: string) => {
    const f = field(kind)
    return resolve(match(f)!, f, ProfileSchema.parse({ eeo: { race } }))
  }

  it("offers a list, since Two or More Races is answered by picking two", () => {
    expect(answer("multiselect", "Asian")).toEqual({ kind: "list", value: ["Asian"] })
  })

  it("still offers plain text to a single picker", () => {
    expect(answer("combobox", "Asian")).toEqual({ kind: "text", value: "Asian" })
  })

  it("says what is missing rather than skipping silently", () => {
    const f = field("multiselect")
    expect(resolve(match(f)!, f, ProfileSchema.parse({}))).toEqual({
      kind: "none",
      reason: "No race or ethnicity saved"
    })
  })
})
