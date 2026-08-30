import { describe, expect, it } from "vitest"

import { actionableItems, buildReport, summaryLine } from "~core/report"
import type { FillResult, FillStatus } from "~core/types"

/**
 * Guards PRD invariant 5.3: skipped, needs_you and error are three distinct
 * states, and only `filled` counts toward the progress bar.
 *
 * Collapsing them makes the percentage lie in the direction that costs the
 * user. A field Ditto silently failed on would look identical to one they
 * deliberately opted out of, and the bar would read higher than the form
 * actually is.
 */

function result(status: FillStatus, required = true, overrides: Partial<FillResult> = {}): FillResult {
  return {
    fieldId: Math.random().toString(36).slice(2),
    label: "Field",
    required,
    status,
    key: "personal.firstName",
    ...overrides
  }
}

describe("the percentage counts only verified fills", () => {
  it("matches the Jobright reading of 9/11 at 82%", () => {
    const results = [
      ...Array.from({ length: 9 }, () => result("filled")),
      result("needs_you"),
      result("skipped")
    ]

    const report = buildReport({ ats: "Greenhouse", results, fieldsFound: 30 })

    expect(report.requiredFilled).toBe(9)
    expect(report.requiredTotal).toBe(11)
    expect(report.percent).toBe(82)
    expect(summaryLine(report)).toBe("9/11 required filled")
  })

  it("does not let a skipped field inflate the bar", () => {
    const withSkips = buildReport({
      ats: "Greenhouse",
      results: [result("filled"), result("skipped"), result("skipped")],
      fieldsFound: 3
    })

    expect(withSkips.percent).toBe(33)
  })

  it("does not let an error inflate the bar", () => {
    const withErrors = buildReport({
      ats: "Greenhouse",
      results: [result("filled"), result("error"), result("error")],
      fieldsFound: 3
    })

    expect(withErrors.percent).toBe(33)
  })

  it("treats a form with no required fields as complete", () => {
    const report = buildReport({
      ats: "Greenhouse",
      results: [result("needs_you", false)],
      fieldsFound: 1
    })

    expect(report.percent).toBe(100)
    expect(report.requiredTotal).toBe(0)
  })

  it("ignores optional fields in the required count", () => {
    const report = buildReport({
      ats: "Greenhouse",
      results: [result("filled", true), result("filled", false), result("needs_you", false)],
      fieldsFound: 3
    })

    expect(report.requiredTotal).toBe(1)
    expect(report.requiredFilled).toBe(1)
    expect(report.percent).toBe(100)
  })
})

describe("the three non-filled states stay distinct", () => {
  const results = [
    result("filled"),
    result("needs_you", true, { reason: "No saved answer matches" }),
    result("skipped", true, { reason: "You chose never to fill this" }),
    result("error", true, { reason: "could not open the dropdown" })
  ]

  const report = buildReport({ ats: "Greenhouse", results, fieldsFound: 4 })

  it("keeps each in its own bucket", () => {
    expect(report.filled).toHaveLength(1)
    expect(report.needsYou).toHaveLength(1)
    expect(report.skipped).toHaveLength(1)
    expect(report.errors).toHaveLength(1)
  })

  it("does not fold an error into skipped", () => {
    // The distinction the user needs: one of these was their choice, and the
    // other is Ditto failing.
    expect(report.skipped[0].reason).toMatch(/never to fill/)
    expect(report.errors[0].reason).toMatch(/dropdown/)
  })

  it("accounts for every result exactly once", () => {
    const total =
      report.filled.length + report.needsYou.length + report.skipped.length + report.errors.length

    expect(total).toBe(results.length)
  })
})

describe("actionable items", () => {
  it("surfaces errors and needs-you together, required first", () => {
    const report = buildReport({
      ats: "Greenhouse",
      results: [
        result("filled"),
        result("needs_you", false, { label: "Optional question" }),
        result("error", true, { label: "Country" }),
        result("skipped", true)
      ],
      fieldsFound: 4
    })

    const items = actionableItems(report)

    expect(items.map((i) => i.label)).toEqual(["Country", "Optional question"])
    // A skipped field is not something the user has to act on.
    expect(items.some((i) => i.status === "skipped")).toBe(false)
  })
})

describe("recognition counts", () => {
  it("counts fields the matcher found a home for", () => {
    const report = buildReport({
      ats: "Greenhouse",
      results: [
        result("filled", true, { key: "personal.firstName" }),
        result("needs_you", true, { key: undefined }),
        result("skipped", true, { key: "eeo.gender" })
      ],
      fieldsFound: 30
    })

    expect(report.fieldsFound).toBe(30)
    expect(report.fieldsRecognized).toBe(2)
  })
})
