import { describe, expect, it } from "vitest"

import { match } from "~core/match"
import { resolve } from "~core/resolve"
import type { FieldSpec, ProfileKey } from "~core/types"
import { emptyProfile } from "~profile/schema"

/**
 * Work eligibility, which forms ask several ways that are not the same
 * question.
 *
 * "Are you a US citizen?" and "Are you a citizen, permanent resident, or
 * protected person?" have different correct answers, so a stored yes to one
 * cannot answer the other. A wrong answer here is a false statement on a legal
 * document, which is why nothing is inferred across them and an unsettled
 * question goes to the user. See PRD 5.2.
 */

const field = (label: string): FieldSpec =>
  ({ id: "f", el: document.createElement("input"), kind: "radiogroup", label, required: true }) as FieldSpec

const keyFor = (label: string) => match(field(label), [])?.key ?? null

const profile = (over: Record<string, unknown>) => {
  const base = emptyProfile()
  return { ...base, eligibility: { ...base.eligibility, ...over } }
}

const answer = (key: ProfileKey, over: Record<string, unknown>) =>
  resolve({ key, invert: false, rule: "test" }, field("x"), profile(over) as never)

describe("telling the questions apart", () => {
  it("reads the compound question as the compound one", () => {
    // It contains the words "US citizen", and answering it as though it asked
    // only about citizenship tells a green card holder to say no.
    expect(
      keyFor(
        "Are you any of the following: US Citizen, Permanent resident of the United States (Green Card), or, Protected person under 8 USC 1324b(a)(3)?"
      )
    ).toBe("eligibility.citizenOrResidentOrProtected")
  })

  it("reads a plain citizenship question as citizenship", () => {
    expect(keyFor("Are you a US citizen?")).toBe("eligibility.usCitizen")
  })

  it("reads the question about residency elsewhere as its own", () => {
    // Also contains "permanent resident", and is the opposite question.
    expect(keyFor("Do you hold Legal Permanent Resident Status in a country outside the US?")).toBe(
      "eligibility.residentOutsideUS"
    )
  })

  it("reads an age question", () => {
    expect(keyFor("Are you at least 18 years old?")).toBe("eligibility.atLeast18")
    expect(keyFor("Are you 18 years of age or older?")).toBe("eligibility.atLeast18")
  })
})

describe("answering from one stored status", () => {
  it("says yes to both questions for a citizen", () => {
    expect(answer("eligibility.usCitizen", { status: "citizen" })).toEqual({
      kind: "boolean",
      value: true
    })
    expect(answer("eligibility.citizenOrResidentOrProtected", { status: "citizen" })).toEqual({
      kind: "boolean",
      value: true
    })
  })

  it("says no to citizenship and yes to the compound for a green card holder", () => {
    // The case that makes storing the status rather than an answer necessary.
    expect(answer("eligibility.usCitizen", { status: "permanentResident" })).toEqual({
      kind: "boolean",
      value: false
    })
    expect(
      answer("eligibility.citizenOrResidentOrProtected", { status: "permanentResident" })
    ).toEqual({ kind: "boolean", value: true })
  })

  it("says yes to the compound for a protected person", () => {
    expect(answer("eligibility.citizenOrResidentOrProtected", { status: "protected" })).toEqual({
      kind: "boolean",
      value: true
    })
  })

  it("says no to everything for none of the above", () => {
    expect(answer("eligibility.citizenOrResidentOrProtected", { status: "none" })).toEqual({
      kind: "boolean",
      value: false
    })
  })
})

describe("refusing to guess", () => {
  it("answers nothing when no status is saved", () => {
    expect(answer("eligibility.usCitizen", {}).kind).toBe("none")
    expect(answer("eligibility.citizenOrResidentOrProtected", {}).kind).toBe("none")
  })

  it("answers nothing about age until it is answered", () => {
    expect(answer("eligibility.atLeast18", {}).kind).toBe("none")
    expect(answer("eligibility.atLeast18", { atLeast18: true })).toEqual({
      kind: "boolean",
      value: true
    })
  })

  it("keeps a saved no as a no rather than as unanswered", () => {
    expect(answer("eligibility.atLeast18", { atLeast18: false })).toEqual({
      kind: "boolean",
      value: false
    })
  })
})
