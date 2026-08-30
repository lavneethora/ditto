import { describe, expect, it } from "vitest"

import { emptyProfile, type Profile } from "~profile/schema"
import { ALL_RULES, assertRulesAreSound, BOOLEAN_KEYS, match } from "~core/match"
import { resolve } from "~core/resolve"
import type { FieldSpec } from "~core/types"

/**
 * Guards PRD invariant 5.2.
 *
 * Work authorization and sponsorship are the only fields on a job application
 * where a wrong answer is a false legal statement rather than a typo. Forms
 * ask the same underlying question in both polarities, often on the same
 * page, so the test asserts the *resolved answer*, not just the matched key.
 * Matching the right key and then writing the opposite boolean would pass a
 * key-only test and still lie on the form.
 */

function field(label: string, extra: Partial<FieldSpec> = {}): FieldSpec {
  return {
    id: "f1",
    el: document.createElement("input"),
    kind: "radiogroup",
    label,
    required: true,
    ...extra
  }
}

/** The answer Ditto would actually put on the form, or null if it declines. */
function answerFor(label: string, profile: Profile): boolean | null {
  const matched = match(field(label))
  if (!matched) return null

  const resolved = resolve(matched, field(label), profile)
  return resolved.kind === "boolean" ? resolved.value : null
}

/** A candidate on OPT: authorized to work today, needs sponsorship later. */
function optCandidate(): Profile {
  const profile = emptyProfile()
  profile.eeo.authorizedUS = true
  profile.eeo.requiresSponsorship = true
  return profile
}

/** A citizen: authorized, never needs sponsorship. */
function citizen(): Profile {
  const profile = emptyProfile()
  profile.eeo.authorizedUS = true
  profile.eeo.requiresSponsorship = false
  return profile
}

describe("rule soundness", () => {
  it("requires every boolean-key rule to declare its polarity", () => {
    expect(() => assertRulesAreSound()).not.toThrow()
  })

  it("actually catches a rule that forgets the invert flag", () => {
    // Proves the guard has teeth rather than passing vacuously.
    expect(() =>
      assertRulesAreSound([{ key: "eeo.requiresSponsorship", test: /sponsorship/ }])
    ).toThrow(/invert/i)
  })

  it("covers every boolean key with at least one rule", () => {
    for (const key of BOOLEAN_KEYS) {
      expect(ALL_RULES.some((rule) => rule.key === key)).toBe(true)
    }
  })
})

describe("sponsorship, direct phrasings", () => {
  const DIRECT = [
    "Will you now or in the future require sponsorship for employment visa status?",
    "Do you now or in the future require sponsorship to work in the United States?",
    "Do you require visa sponsorship?",
    "Will you require sponsorship now or in the future?",
    "Do you need sponsorship for employment?",
    "Are you seeking employment sponsorship?"
  ]

  it.each(DIRECT)("answers yes for an OPT candidate: %s", (label) => {
    expect(answerFor(label, optCandidate())).toBe(true)
  })

  it.each(DIRECT)("answers no for a citizen: %s", (label) => {
    expect(answerFor(label, citizen())).toBe(false)
  })
})

describe("sponsorship, inverted phrasings", () => {
  const INVERTED = [
    "Can you work without sponsorship?",
    "Are you able to work without company sponsorship?",
    "Are you legally authorized to work in the US without sponsorship?",
    "Are you able to work in the United States without visa sponsorship?",
    "Will you be able to work without the need for sponsorship?",
    "Do you not require sponsorship for employment?"
  ]

  // The whole point of invariant 5.2: the same stored fact, opposite answers.
  it.each(INVERTED)("answers no for an OPT candidate: %s", (label) => {
    expect(answerFor(label, optCandidate())).toBe(false)
  })

  it.each(INVERTED)("answers yes for a citizen: %s", (label) => {
    expect(answerFor(label, citizen())).toBe(true)
  })
})

describe("sponsorship and authorization stay separate", () => {
  it("routes an authorization question to the authorization key", () => {
    const matched = match(field("Are you legally authorized to work in the United States?"))
    expect(matched?.key).toBe("eeo.authorizedUS")
    expect(matched?.invert).toBe(false)
  })

  it("does not derive one answer from the other", () => {
    // The case that motivates two separate booleans: both are true at once.
    const opt = optCandidate()
    expect(answerFor("Are you legally authorized to work in the US?", opt)).toBe(true)
    expect(answerFor("Will you now or in the future require sponsorship?", opt)).toBe(true)
  })

  it("treats a combined question as being about sponsorship", () => {
    // "authorized ... without sponsorship" mentions both, but the answer that
    // makes it true or false is the sponsorship one.
    const matched = match(field("Are you legally authorized to work in the US without sponsorship?"))
    expect(matched?.key).toBe("eeo.requiresSponsorship")
    expect(matched?.invert).toBe(true)
  })

  it("declines to answer when the profile has no answer on file", () => {
    const blank = emptyProfile()
    expect(answerFor("Do you require sponsorship?", blank)).toBeNull()
    expect(answerFor("Are you authorized to work in the US?", blank)).toBeNull()
  })
})

describe("field recognition", () => {
  const CASES: [string, string][] = [
    ["First Name", "personal.firstName"],
    ["Given name", "personal.firstName"],
    ["Last Name", "personal.lastName"],
    ["Surname", "personal.lastName"],
    ["Preferred First Name", "personal.preferredFirstName"],
    ["Email", "personal.email"],
    ["Email Address", "personal.email"],
    ["Phone", "personal.phone"],
    ["Phone Device Type", "personal.phoneType"],
    ["Country Code", "personal.phoneCountryCode"],
    ["Address Line 1", "personal.addressLine1"],
    ["Address Line 2", "personal.addressLine2"],
    ["City", "personal.city"],
    ["State", "personal.state"],
    ["Postal Code", "personal.postalCode"],
    ["LinkedIn Profile", "personal.linkedin"],
    ["GitHub URL", "personal.github"],
    ["School", "education[].school"],
    ["University", "education[].school"],
    ["GPA", "education[].gpa"],
    ["Degree", "education[].degree"],
    ["Field of Study", "education[].major"],
    ["Company", "work[].company"],
    ["Job Title", "work[].title"],
    ["Do you identify as LGBTQ+?", "eeo.lgbtq"],
    ["What are your pronouns?", "eeo.pronouns"],
    ["How would you describe your sexual orientation?", "eeo.sexualOrientation"],
    ["Do you have a disability?", "eeo.disability"],
    ["Are you a protected veteran?", "eeo.veteran"],
    ["Gender", "eeo.gender"],
    ["Race / Ethnicity", "eeo.race"],
    ["Are you Hispanic or Latino?", "eeo.hispanicLatino"]
  ]

  it.each(CASES)("maps %s to %s", (label, key) => {
    expect(match(field(label))?.key).toBe(key)
  })

  it("does not let 'first name' be stolen by the bare name rule", () => {
    expect(match(field("First Name"))?.key).toBe("personal.firstName")
    expect(match(field("Name"))?.key).toBe("personal.fullName")
  })

  it("prefers country code over country", () => {
    expect(match(field("Country Code"))?.key).toBe("personal.phoneCountryCode")
    expect(match(field("Country"))?.key).toBe("personal.country")
  })

  it("prefers hispanic over the generic race rule", () => {
    expect(match(field("Are you Hispanic or Latino?"))?.key).toBe("eeo.hispanicLatino")
  })

  it("returns null for an unlabelled field", () => {
    expect(match(field(""))).toBeNull()
  })
})

describe("date disambiguation by section", () => {
  it("reads a start date inside an education block as education", () => {
    const spec = field("Start Date", { kind: "month", section: "Education 1" })
    expect(match(spec)?.key).toBe("education[].startDate")
  })

  it("reads a start date inside a work block as work", () => {
    const spec = field("Start Date", { kind: "month", section: "Work Experience 1" })
    expect(match(spec)?.key).toBe("work[].startDate")
  })

  it("leaves a bare availability question unmatched", () => {
    // The Preference section was cut, so there is no stored start date and
    // nothing to write. This has to stay unmatched rather than borrowing a
    // date from education or work, which would be a claim about availability
    // the user never made. It surfaces as NEEDS YOU.
    const spec = field("When can you start?", { kind: "date" })
    expect(match(spec)).toBeNull()
  })

  it("keeps graduation dates on the education key", () => {
    const spec = field("Expected Graduation", { kind: "month", section: "Education 1" })
    expect(match(spec)?.key).toBe("education[].endDate")
  })
})

describe("repeatable entries", () => {
  it("pulls the entry matching the block index", () => {
    const profile = emptyProfile()
    profile.education = [
      { id: "a", school: "Texas Tech University", degree: "BS", major: "CS", gpa: "3.94", startDate: "", endDate: "", current: true },
      { id: "b", school: "Rice University", degree: "MS", major: "CS", gpa: "4.0", startDate: "", endDate: "", current: false }
    ]

    const second = field("School", { kind: "text", section: "Education 2", repeatIndex: 1 })
    const matched = match(second)!
    expect(resolve(matched, second, profile)).toEqual({ kind: "text", value: "Rice University" })
  })

  it("falls back to the first entry when there is no index", () => {
    const profile = emptyProfile()
    profile.work = [
      { id: "a", company: "UTHealth Houston", title: "Research Intern", location: "Houston, TX", startDate: "", endDate: "", current: false, summary: "", bullets: [] }
    ]

    const spec = field("Company", { kind: "text" })
    expect(resolve(match(spec)!, spec, profile)).toEqual({ kind: "text", value: "UTHealth Houston" })
  })

  it("leaves the end date of a current role empty", () => {
    const profile = emptyProfile()
    profile.work = [
      { id: "a", company: "Acme", title: "Engineer", location: "", startDate: "2026-06", endDate: "2026-08", current: true, summary: "", bullets: [] }
    ]

    const spec = field("End Date", { kind: "month", section: "Work Experience 1", repeatIndex: 0 })
    const resolved = resolve(match(spec)!, spec, profile)

    expect(resolved.kind).toBe("none")
  })
})

describe("voluntary demographic questions", () => {
  it("skips a question left unanswered rather than guessing", () => {
    // There is no separate opt-out any more. Leaving a voluntary question on
    // "Not answered" is the opt-out, and it must never be filled in with a
    // default: these are the user's answers to make, not Ditto's.
    const profile = emptyProfile()
    const spec = field("Do you have a disability?")
    const resolved = resolve(match(spec)!, spec, profile)

    expect(resolved.kind).toBe("none")
  })

  it("fills a question that was answered", () => {
    const profile = emptyProfile()
    profile.eeo.veteran = "no"

    const spec = field("Are you a veteran?")
    expect(resolve(match(spec)!, spec, profile)).toEqual({ kind: "tristate", value: "no" })
  })

  it("treats decline to state as a real answer, not an absence", () => {
    const profile = emptyProfile()
    profile.eeo.disability = "decline"

    const spec = field("Do you have a disability?")
    expect(resolve(match(spec)!, spec, profile)).toEqual({ kind: "tristate", value: "decline" })
  })
})

describe("saved answers", () => {
  it("matches a snippet to a differently worded question", () => {
    const profile = emptyProfile()
    profile.answers = [{ id: "a", label: "Why this company", body: "Because of the work on X." }]

    const spec = field("Why do you want to work at this company?", { kind: "textarea" })
    const matched = match(spec)

    // No rule covers this, so it falls through to the snippet matcher.
    const resolved = matched ? resolve(matched, spec, profile) : null
    expect(resolved === null || resolved.kind !== "text").toBe(true)
  })

  it("refuses to answer when no snippet is close enough", () => {
    const profile = emptyProfile()
    profile.answers = [{ id: "a", label: "Notice period", body: "Two weeks." }]

    const spec = field("Describe a time you disagreed with a manager.", { kind: "textarea" })
    const matched = match(spec)
    const resolved = matched ? resolve(matched, spec, profile) : { kind: "needs_you" as const, reason: "" }

    expect(resolved.kind).not.toBe("text")
  })
})
