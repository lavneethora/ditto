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
