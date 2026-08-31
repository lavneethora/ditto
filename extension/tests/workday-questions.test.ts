import { readFileSync } from "node:fs"
import { resolve as resolvePath } from "node:path"
import { beforeEach, describe, expect, it } from "vitest"

import { workday } from "~adapters"
import { autofill } from "~core/engine"
import { isConsentQuestion, match } from "~core/match"
import { scan } from "~core/scan"
import { emptyProfile } from "~profile/schema"

/**
 * Workday's Application Questions, captured from a live tenant.
 *
 * Every field here is named `formField-<UUID>`, because these questions are
 * configured per employer, so the page is matched entirely on its labels. The
 * labels are rich text: paragraphs, bullet lists, a privacy notice.
 */

const FIXTURE = readFileSync(
  resolvePath(__dirname, "../../fixtures/workday-questions.html"),
  "utf8"
)

beforeEach(() => {
  document.body.replaceChildren()
  document.body.insertAdjacentHTML("afterbegin", FIXTURE)
})

const fields = () => scan(document, workday)
const find = (fragment: string) => fields().find((f) => f.label.includes(fragment))!
const keyFor = (fragment: string) =>
  match(find(fragment), workday.rules ?? [], workday.key?.bind(workday))?.key ?? null

describe("questions with no name to go on", () => {
  it("finds all ten", () => {
    expect(fields()).toHaveLength(10)
  })

  it("knows every one is required", () => {
    // The asterisk is inside the legend's rich text, usually at the end of the
    // last bullet rather than near the control. Without reading the legend,
    // ten required questions all reported themselves optional.
    expect(fields().every((f) => f.required)).toBe(true)
  })
})

describe("telling the work questions apart", () => {
  it("reads the compound eligibility question as the compound one", () => {
    expect(keyFor("Are you any of the following")).toBe(
      "eligibility.citizenOrResidentOrProtected"
    )
  })

  it("reads residency elsewhere as its own question", () => {
    expect(keyFor("outside the US")).toBe("eligibility.residentOutsideUS")
  })

  it("reads authorisation as authorisation, not as a green card", () => {
    // The question explains itself by listing who qualifies: "U.S. citizens,
    // lawful permanent residents (green card holders), asylees and refugees".
    // Every one of those phrases belongs to another rule, and one of them won.
    expect(keyFor("authorized to work")).toBe("eeo.authorizedUS")
  })

  it("reads sponsorship asked as a verb", () => {
    // "Will you need to be sponsored for a work visa" never says sponsorship.
    expect(keyFor("sponsored for a work visa")).toBe("eeo.requiresSponsorship")
  })

  it("reads the age question", () => {
    expect(keyFor("at least 18")).toBe("eligibility.atLeast18")
  })
})

describe("questions Ditto has no business answering", () => {
  it("recognises a request for consent", () => {
    expect(isConsentQuestion("By selecting Yes, you consent to the use of AI tools.")).toBe(true)
    expect(isConsentQuestion("Your consent is voluntary.")).toBe(true)
    expect(isConsentQuestion("Do you consent to a background check?")).toBe(true)
  })

  it("does not mistake an ordinary question for one", () => {
    expect(isConsentQuestion("Are you at least 18 years old?")).toBe(false)
    expect(isConsentQuestion("Are you bound by any agreements with your employer?")).toBe(false)
  })

  it("claims neither AI consent question", () => {
    // One of them matched work[].company, off the words "how Company
    // processes your personal data" in the privacy notice at the bottom.
    expect(keyFor("artificial intelligence")).toBeNull()
    expect(keyFor("additional and future job openings")).toBeNull()
  })

  it("leaves them for the user even with a profile that answers everything", async () => {
    const base = emptyProfile()
    const report = await autofill({
      doc: document,
      adapter: workday,
      profile: {
        ...base,
        eligibility: { status: "citizen", atLeast18: true, residentOutsideUS: false, residentCountry: "" },
        eeo: { ...base.eeo, authorizedUS: true, requiresSponsorship: false }
      } as never
    })

    const consent = report.needsYou.filter((r) => /artificial intelligence|future job openings/.test(r.label))

    expect(consent).toHaveLength(2)
    expect(consent.every((r) => /your decision/i.test(r.reason ?? ""))).toBe(true)
  })
})

describe("employer-specific questions", () => {
  it("leaves the ones no profile can answer", () => {
    // Relatives at the company, commitments elsewhere. Real questions with
    // real answers, and neither is a fact Ditto holds.
    expect(keyFor("relatives working")).toBeNull()
    expect(keyFor("commitments to another organization")).toBeNull()
  })

  it("now answers the non-compete question, which the profile records", () => {
    // This used to sit with the two above. The profile gained a field for it,
    // so the question moved from "nobody can answer this" to "answered from
    // something the user stored".
    expect(keyFor("bound by any agreements")).toBe("eligibility.boundByAgreements")
  })
})
