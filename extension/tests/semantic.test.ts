import { describe, expect, it } from "vitest"

import { SEMANTIC_THRESHOLD, nearestKey, vectorFor } from "~core/semantic/rank"

/**
 * The semantic tier, decided by arithmetic.
 *
 * Producing a vector needs the 23MB model, which lives in the extension's
 * offscreen document. Everything decided HERE is a dot product against the
 * shipped phrasings, so it is testable without loading any of that.
 */

const of = (phrasing: string) => {
  const v = vectorFor(phrasing)
  if (!v) throw new Error(`no shipped vector for "${phrasing}"`)
  return v
}

describe("finding the nearest key", () => {
  it("returns the key a phrasing was written for", () => {
    expect(nearestKey(of("where did you go to school"))?.key).toBe("education[].school")
    expect(nearestKey(of("who do you currently work for"))?.key).toBe("work[].company")
    expect(nearestKey(of("what are your salary expectations"))?.key).toBe(
      "preferences.desiredSalary"
    )
  })

  it("scores an exact phrasing at one", () => {
    // Normalised vectors, so a phrasing against itself is a perfect cosine.
    const match = nearestKey(of("postal code"))

    expect(match?.key).toBe("personal.postalCode")
    expect(match!.score).toBeCloseTo(1, 2)
  })

  it("says which phrasing it matched", () => {
    expect(nearestKey(of("please attach your cv"))?.of).toBe("please attach your cv")
  })
})

describe("what the model is never allowed to answer", () => {
  /**
   * The measurement that set the threshold: "Are you a citizen of any one of
   * these countries: Cuba, Iran, North Korea, or Syria" scored 0.542 against
   * "country of citizenship", higher than several correct matches. The model
   * reads it as asking WHICH citizenship. It is a screening question with a
   * yes or no answer, and getting it backwards is a false statement on a
   * federal form.
   */
  it("ships no phrasings for eligibility or equal employment", () => {
    expect(vectorFor("country of citizenship")).toBeNull()
    expect(vectorFor("veteran status")).toBeNull()
  })

  it("cannot return one of those keys at any threshold", () => {
    for (const phrasing of ["where did you go to school", "postal code", "job title"]) {
      const match = nearestKey(of(phrasing), 0)
      expect(match?.key).not.toMatch(/^(eligibility|eeo|forms)\./)
    }
  })
})

describe("the threshold", () => {
  it("refuses a vector that is near nothing", () => {
    // Orthogonal to everything shipped.
    const nowhere = new Array(384).fill(0)
    nowhere[0] = 1

    expect(nearestKey(nowhere)).toBeNull()
  })

  it("sits between the two measured sets", () => {
    // Correct matches on unseen labels ran 0.44 to 0.75; questions no profile
    // can answer topped out at 0.438.
    expect(SEMANTIC_THRESHOLD).toBeGreaterThan(0.438)
    expect(SEMANTIC_THRESHOLD).toBeLessThan(0.49)
  })

  it("is honoured", () => {
    const v = of("postal code")

    expect(nearestKey(v, 0.99)).not.toBeNull()
    expect(nearestKey(v, 1.01)).toBeNull()
  })
})
