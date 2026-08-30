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
 * The drawer groups errors under NEEDS YOU, because from the user's side both
 * mean "this one is still on you". They stay separate in the data so the
 * percentage cannot be inflated and so a failure is still identifiable as a
 * failure rather than a choice.
 */
export function actionableItems(report: FillReport): FillResult[] {
  return [...report.errors, ...report.needsYou].sort((a, b) => {
    if (a.required !== b.required) return a.required ? -1 : 1
    return 0
  })
}

/** "9/11 required filled" */
export function summaryLine(report: FillReport): string {
  return `${report.requiredFilled}/${report.requiredTotal} required filled`
}
