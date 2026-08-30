import type { Profile } from "~profile/schema"

import { fill } from "./fill"
import { match } from "./match"
import { buildReport } from "./report"
import { resolve, resolveUnmatched } from "./resolve"
import { scan } from "./scan"
import type { Adapter, FieldSpec, FillReport, FillResult } from "./types"
import { verify } from "./verify"

/**
 * The autofill pass: scan, match, resolve, fill, verify, report.
 *
 * Each field goes through the whole pipeline before the next one starts, and
 * the run yields to the event loop between fields. That is not politeness: all
 * four target ATS are React apps that re-render on change, and writing thirty
 * fields in one synchronous burst gives React no chance to commit between
 * them. Fields end up verified against a DOM that has not caught up, which
 * produces exactly the kind of false `filled` invariant 5.1 exists to prevent.
 */

export interface AutofillOptions {
  doc: Document
  adapter: Adapter
  profile: Profile
  /** Called after each field so the drawer can show live progress. */
  onProgress?: (done: number, total: number, latest: FillResult) => void
  /** Checked between fields so the user can cancel a run in flight. */
  shouldCancel?: () => boolean
}

/** Lets the browser paint and lets React commit before the next write. */
function yieldToBrowser(): Promise<void> {
  return new Promise((done) => setTimeout(done, 0))
}

/**
 * Scan without filling.
 *
 * Backs the drawer's "30 fields found, 17 Ditto recognises" line, and is what
 * `npm run score` measures, since recognition is where an ATS redesign breaks
 * things first.
 */
export function analyze(doc: Document, adapter: Adapter): {
  fields: FieldSpec[]
  recognized: number
} {
  const fields = scan(doc, adapter)
  const recognized = fields.filter((field) => match(field, adapter.rules ?? []) !== null).length

  return { fields, recognized }
}

export async function autofill({
  doc,
  adapter,
  profile,
  onProgress,
  shouldCancel
}: AutofillOptions): Promise<FillReport> {
  const fields = scan(doc, adapter)
  const results: FillResult[] = []

  for (const [index, field] of fields.entries()) {
    if (shouldCancel?.()) break

    const matched = match(field, adapter.rules ?? [])

    // Unmatched open-text questions still get a shot at a saved answer, since
    // covering questions the rules cannot anticipate is the point of snippets.
    const resolved = matched
      ? resolve(matched, field, profile)
      : resolveUnmatched(field, profile)

    const attempt = fill(field, resolved)
    const result = verify(field, attempt, matched?.key)

    results.push(result)
    onProgress?.(index + 1, fields.length, result)

    // Only yield after a write. Skipped fields touched nothing, so there is
    // nothing for React to commit and no reason to pay for a frame.
    if (attempt.kind === "wrote") await yieldToBrowser()
  }

  return buildReport({ ats: adapter.name, results, fieldsFound: fields.length })
}
