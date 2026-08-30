import { describe, expect, it } from "vitest"
import { resolve } from "~core/resolve"
import { emptyProfile, newId } from "~profile/schema"
import type { FieldSpec } from "~core/types"

const entry = (over: Record<string, unknown>) => ({
  id: newId(), company: "C", title: "T", location: "", startDate: "", endDate: "",
  current: false, summary: "", bullets: [], ...over
})

const field = { repeatIndex: 0 } as FieldSpec
const matched = { key: "work[].summary" as const, invert: false, rule: "x" }

/**
 * Reported live: every Role Description across a three job history came back
 * empty, reported as "no experience summary saved", while the user could see
 * the bullets sitting in their profile.
 *
 * The paragraph and the bullets are stored separately on purpose, because a
 * Workday textarea wants prose and a resume-style box wants lines. But an
 * empty paragraph next to a filled bullet list is not nothing on file.
 */
describe("a role description", () => {
  it("prefers the saved paragraph", () => {
    const p = { ...emptyProfile(), work: [entry({ summary: "A paragraph.", bullets: ["b1"] })] }
    expect(resolve(matched, field, p as never)).toEqual({ kind: "text", value: "A paragraph." })
  })

  it("falls back to the bullets as lines", () => {
    const p = { ...emptyProfile(), work: [entry({ bullets: ["Built it", "Shipped it"] })] }
    expect(resolve(matched, field, p as never)).toEqual({
      kind: "text",
      value: "Built it\nShipped it"
    })
  })

  it("is nothing on file when neither is saved", () => {
    const p = { ...emptyProfile(), work: [entry({})] }
    expect(resolve(matched, field, p as never).kind).toBe("none")
  })

  it("ignores blank bullets", () => {
    const p = { ...emptyProfile(), work: [entry({ bullets: ["", "  "] })] }
    expect(resolve(matched, field, p as never).kind).toBe("none")
  })
})
