import { describe, expect, it } from "vitest"

import { pickText } from "~core/fill/options"

/**
 * The EEO questions asked as dropdowns rather than radios.
 *
 * Option text copied off the live Stripe form on job-boards.greenhouse.io.
 * The profile stores a bare "no" or "decline"; the form offers a sentence.
 * Nothing connected the two on this path, so "no" scored zero against every
 * option and was then dropped by the length filter for being two letters
 * long. The question could not be answered, and when the user had answered it
 * themselves the panel decided the value was wrong and crossed it out.
 */

const VETERAN = [
  "I identify as one or more of the classifications of a protected veteran",
  "I am not a protected veteran",
  "I don't wish to answer"
]

const DISABILITY = [
  "Yes, I have a disability, or have had one in the past",
  "No, I do not have a disability and have not had one in the past",
  "I do not want to answer"
]

const opts = (labels: string[]) => labels.map((label) => ({ label, value: label }))

describe("a tri-state answered by a dropdown", () => {
  it("reads no as the sentence that says no", () => {
    expect(pickText(opts(VETERAN), "no")?.label).toBe("I am not a protected veteran")
  })

  it("reads decline as the sentence that declines", () => {
    expect(pickText(opts(VETERAN), "decline")?.label).toBe("I don't wish to answer")
  })

  it("does not read no as yes on a longer question", () => {
    expect(pickText(opts(DISABILITY), "no")?.label).toBe(
      "No, I do not have a disability and have not had one in the past"
    )
  })

  it("reads yes as yes", () => {
    expect(pickText(opts(DISABILITY), "yes")?.label).toBe(
      "Yes, I have a disability, or have had one in the past"
    )
  })

  it("still lets a plain option win on its own merits", () => {
    // The synonyms run after ordinary matching, so a list that simply offers
    // the word is unaffected.
    expect(pickText(opts(["Yes", "No", "Maybe"]), "no")?.label).toBe("No")
  })

  it("does not turn a country starting with No into a refusal", () => {
    expect(pickText(opts(["Norway", "Nigeria"]), "Norway")?.label).toBe("Norway")
  })
})
