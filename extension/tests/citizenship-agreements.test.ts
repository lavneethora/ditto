import { describe, expect, it } from "vitest"

import { match } from "~core/match"
import { resolve } from "~core/resolve"
import type { FieldSpec } from "~core/types"
import { ProfileSchema } from "~profile/schema"

/**
 * Two facts a profile had no room for, and the questions that need them.
 *
 * Both are legal declarations rather than preferences, so the bar is the one
 * in PRD 5.2: answer from something the user stored, or hand the question
 * back. Nothing adjacent counts as an answer. Permanent residency in India
 * says nothing about which passport someone carries, and a form asking about
 * non-competes is not answered by a work history.
 */

const profileWith = (eligibility: Record<string, unknown>) =>
  ProfileSchema.parse({ eligibility })

const ask = (label: string, kind: FieldSpec["kind"] = "radiogroup"): FieldSpec =>
  ({ id: "q", el: document.createElement("input"), kind, label, required: true }) as FieldSpec

const answerTo = (label: string, eligibility: Record<string, unknown>, kind?: FieldSpec["kind"]) => {
  const field = ask(label, kind)
  const matched = match(field)
  if (!matched) return { key: null, resolved: null }
  return { key: matched.key, resolved: resolve(matched, field, profileWith(eligibility)) }
}

const SANCTIONS = "Are you a citizen of any one of these countries: Cuba, Iran, North Korea, or Syria?"

describe("the screening question that lists countries", () => {
  it("answers no when none of the listed countries is on the passport", () => {
    const { key, resolved } = answerTo(SANCTIONS, { citizenships: ["India"] })

    expect(key).toBe("eligibility.citizenOfNamedCountries")
    expect(resolved).toEqual({ kind: "boolean", value: false })
  })

  it("answers yes when one of them is", () => {
    const { resolved } = answerTo(SANCTIONS, { citizenships: ["Iran", "Canada"] })

    expect(resolved).toEqual({ kind: "boolean", value: true })
  })

  it("hands it back when no citizenship is saved", () => {
    // The question is recognised; there is simply nothing to answer it with.
    const { key, resolved } = answerTo(SANCTIONS, {})

    expect(key).toBe("eligibility.citizenOfNamedCountries")
    expect(resolved?.kind).toBe("none")
  })

  it("does not infer citizenship from residency", () => {
    // The whole point. Someone can be a permanent resident of India and a
    // citizen of one of the listed countries.
    const { resolved } = answerTo(SANCTIONS, {
      residentOutsideUS: true,
      residentCountry: "India"
    })

    expect(resolved?.kind).toBe("none")
  })

  it("hands back a question that names a region rather than countries", () => {
    // "EU/EFTA" would mean knowing the membership list rather than reading
    // one, and a wrong answer here is a false legal statement.
    const { resolved } = answerTo("Are you a citizen of any of the countries in the EU/EFTA?", {
      citizenships: ["India"]
    })

    expect(resolved?.kind).toBe("needs_you")
  })

  it("does not steal the plain US citizenship question", () => {
    const { key } = answerTo("Are you a US citizen?", { citizenships: ["India"] })

    expect(key).toBe("eligibility.usCitizen")
  })
})

describe("the non-compete question", () => {
  const NDA =
    "Are you bound by any agreements with your current or previous employer that limit your actions after leaving their company? If yes, share the specific type of agreement and when it expires."

  it("answers the toggle from the stored yes or no", () => {
    const { key, resolved } = answerTo(NDA, { boundByAgreements: false })

    expect(key).toBe("eligibility.boundByAgreements")
    expect(resolved).toEqual({ kind: "boolean", value: false })
  })

  it("writes the details when the same question is a text box", () => {
    // "Yes" alone does not answer a question asking which agreement and until
    // when.
    const { resolved } = answerTo(
      NDA,
      {
        boundByAgreements: true,
        agreementDetails: "Non-solicitation agreement with Acme Corp, expires March 2027."
      },
      "textarea"
    )

    expect(resolved).toEqual({
      kind: "text",
      value: "Non-solicitation agreement with Acme Corp, expires March 2027."
    })
  })

  it("writes a plain no into the box when there is nothing to declare", () => {
    const { resolved } = answerTo(NDA, { boundByAgreements: false }, "textarea")

    expect(resolved).toEqual({ kind: "text", value: "No" })
  })

  it("asks for the details rather than writing a bare yes", () => {
    const { resolved } = answerTo(NDA, { boundByAgreements: true }, "textarea")

    expect(resolved?.kind).toBe("needs_you")
  })

  it("recognises the question by its named agreements too", () => {
    const { key } = answerTo("Do you have a non-compete with a current employer?", {})

    expect(key).toBe("eligibility.boundByAgreements")
  })
})

describe("which passport, asked plainly", () => {
  it("fills a country of citizenship box", () => {
    const { key, resolved } = answerTo("Country of citizenship", { citizenships: ["India"] }, "text")

    expect(key).toBe("eligibility.citizenships")
    expect(resolved).toEqual({ kind: "text", value: "India" })
  })

  it("gives a dropdown one country and a text box all of them", () => {
    const held = { citizenships: ["India", "Canada"] }

    expect(answerTo("Nationality", held, "combobox").resolved).toEqual({
      kind: "text",
      value: "India"
    })
    expect(answerTo("Nationality", held, "text").resolved).toEqual({
      kind: "text",
      value: "India, Canada"
    })
  })
})

/**
 * Workday's export control screening, which arrives one question at a time.
 *
 * Confirmed on a live application: answering the first reveals a second, and
 * answering that reveals a third. Each is a separate field that does not exist
 * until the one before it is answered.
 */
describe("the chain of screening questions", () => {
  const FIRST =
    "Are you a citizen of any one of these countries: Cuba, Iran, North Korea, or Syria?"

  const SECOND =
    "Are you a citizen of any of the following countries: Group D (Armenia, Azerbaijan, Belarus, Burma (Myanmar), Cambodia, China (PRC), Georgia, Hong Kong, Iraq, Kazakhstan, Kyrgyzstan, Laos, Libya, Macau, Moldova, Mongolia, Nicaragua, Russia, Tajikistan, Turkmenistan, Ukraine (RU Occupied regions, Donetsk, Kherson, Luhansk, Zaporizhzhia), Uzbekistan, Venezuela, Vietnam)"

  const THIRD = "Please add your Country of Citizenship or Countries of Citizenship if dual"

  it("answers the long list the same way as the short one", () => {
    expect(answerTo(SECOND, { citizenships: ["India"] })).toEqual({
      key: "eligibility.citizenOfNamedCountries",
      resolved: { kind: "boolean", value: false }
    })
  })

  it("says yes when a passport is on the long list", () => {
    expect(answerTo(SECOND, { citizenships: ["Russia"] }).resolved).toEqual({
      kind: "boolean",
      value: true
    })
  })

  it("does not read the third question as another screening list", () => {
    // It asks WHICH, not WHETHER. Answering it with a yes or no would put a
    // boolean into a country field.
    expect(answerTo(THIRD, { citizenships: ["India"] }, "multiselect").key).toBe(
      "eligibility.citizenships"
    )
  })

  it("gives the multi-select every passport", () => {
    expect(answerTo(THIRD, { citizenships: ["India", "Canada"] }, "multiselect").resolved).toEqual({
      kind: "list",
      value: ["India", "Canada"]
    })
  })

  it("keeps the three questions on three different keys", () => {
    const held = { citizenships: ["India"] }
    const keys = [FIRST, SECOND, THIRD].map((q) => answerTo(q, held, "multiselect").key)

    expect(keys).toEqual([
      "eligibility.citizenOfNamedCountries",
      "eligibility.citizenOfNamedCountries",
      "eligibility.citizenships"
    ])
  })
})

describe("the country someone is a permanent resident of", () => {
  it("is not their mailing address", () => {
    // Living in Texas with permanent residency in India got "United States of
    // America" onto an export control form, because nothing routed to the key
    // that knew the answer.
    const { key, resolved } = answerTo(
      "Please add your Country of Permanent Residency",
      { residentOutsideUS: true, residentCountry: "India" },
      "combobox"
    )

    expect(key).toBe("eligibility.residentCountry")
    expect(resolved).toEqual({ kind: "text", value: "India" })
  })

  it("leaves a plain country of residence as the address country", () => {
    // That one usually does mean where you live now.
    expect(answerTo("Country of Residence", {}, "combobox").key).toBe("personal.country")
    expect(answerTo("Country", {}, "combobox").key).toBe("personal.country")
  })
})

describe("the third question is a text box, not a picker", () => {
  const THIRD = "Please add your Country of Citizenship or Countries of Citizenship if dual"

  it("writes one country plainly", () => {
    expect(answerTo(THIRD, { citizenships: ["India"] }, "text").resolved).toEqual({
      kind: "text",
      value: "India"
    })
  })

  it("writes both when the box invites both", () => {
    // The label asks for countries plural if dual, so a text box gets the lot
    // rather than the first one.
    expect(answerTo(THIRD, { citizenships: ["India", "Canada"] }, "text").resolved).toEqual({
      kind: "text",
      value: "India, Canada"
    })
  })
})
