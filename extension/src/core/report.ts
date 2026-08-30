import type { FillReport, FillResult } from "./types"

/**
 * Buckets results for the drawer.
 *
 * PRD invariant 5.3. `skipped`, `needs_you` and `error` stay three separate
 * things. Collapsing them into "not filled" makes the progress bar lie in the
 * direction that costs the user: a field Ditto silently failed on would look
 * identical to one they deliberately opted out of.
 *
 * Only `filled` counts toward the percentage, and `filled` is only reachable
 * through verify.ts.
 */

export function buildReport({
  ats,
  results,
  fieldsFound
}: {
  ats: string
  results: FillResult[]
  fieldsFound: number
}): FillReport {
  const filled = results.filter((r) => r.status === "filled")
  const needsYou = results.filter((r) => r.status === "needs_you")
  const skipped = results.filter((r) => r.status === "skipped")
  const errors = results.filter((r) => r.status === "error")

  const required = results.filter((r) => r.required)
  const requiredFilled = required.filter((r) => r.status === "filled").length

  return {
    ats,
    fieldsFound,
    // Recognized means the matcher found a home for it, whatever happened next.
    fieldsRecognized: results.filter((r) => r.key !== undefined).length,
    requiredTotal: required.length,
    requiredFilled,
    percent: required.length === 0 ? 100 : Math.round((requiredFilled / required.length) * 100),
    filled,
    needsYou,
    skipped,
    errors
  }
}

/**
 * Everything still on the user, in one list.
 *
 * Errors, unanswered questions and skipped fields are three different things
 * to Ditto and one thing to the person filling the form: an empty field they
 * have to deal with. Splitting them across two lists meant an optional
 * question Ditto had no answer for sat under a "Skipped" heading that reads
 * as "handled", when it is not.
 *
 * The four states stay distinct in the data, so the percentage still counts
 * only verified fills, and each row keeps its own mark so the reason is still
 * visible. Only the grouping changed.
 */
export function actionableItems(report: FillReport): FillResult[] {
  return [...report.errors, ...report.needsYou, ...report.skipped].sort((a, b) => {
    // Required first, then errors ahead of the rest: a field Ditto tried and
    // failed on is more likely to need a workaround than one it never had an
    // answer for.
    if (a.required !== b.required) return a.required ? -1 : 1

    const rank = (result: FillResult) =>
      result.status === "error" ? 0 : result.status === "needs_you" ? 1 : 2

    return rank(a) - rank(b)
  })
}

/** "9/11 required filled" */
export function summaryLine(report: FillReport): string {
  return `${report.requiredFilled}/${report.requiredTotal} required filled`
}
