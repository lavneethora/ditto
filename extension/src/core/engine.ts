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
  const recognized = fields.filter((field) => match(field, adapter.rules ?? [], adapter.key?.bind(adapter)) !== null).length

  return { fields, recognized }
}

export async function autofill({
  doc,
  adapter,
  profile,
  onProgress,
  shouldCancel
}: AutofillOptions): Promise<FillReport> {
  const results: FillResult[] = []

  // Identity by element, because field ids are assigned per scan and a second
  // scan would renumber everything it already did.
  const handled = new Set<Element>()

  let queue = scan(doc, adapter)
  let total = queue.length

  /**
   * Passes, because answering one field can create another.
   *
   * Workday hides the preferred-name boxes behind an "I have a preferred name"
   * checkbox, so on a single pass Ditto ticks the box and then finishes,
   * leaving the two fields it just revealed empty and unreported. The same
   * shape turns up wherever a form asks a follow-up: a sponsorship question
   * that opens a date box, a "previously employed here" that asks when.
   *
   * Bounded at two. One extra pass covers a follow-up; anything deeper is a
   * form that rewrites itself as you fill it, and looping until the DOM
   * settles risks not stopping at all.
   */
  for (let pass = 0; pass < 2 && queue.length > 0; pass++) {
    for (const field of queue) {
      if (shouldCancel?.()) break

      handled.add(field.el as Element)

      const matched = match(field, adapter.rules ?? [], adapter.key?.bind(adapter))

      // Unmatched open-text questions still get a shot at a saved answer, since
      // covering questions the rules cannot anticipate is the point of snippets.
      const resolved = matched
        ? resolve(matched, field, profile)
        : resolveUnmatched(field, profile)

      const attempt = await fill(field, resolved)
      const result = verify(field, attempt, matched?.key)

      results.push(result)
      onProgress?.(results.length, total, result)

      // Only yield after a write. Skipped fields touched nothing, so there is
      // nothing for React to commit and no reason to pay for a frame.
      if (attempt.kind === "wrote") await yieldToBrowser()
    }

    if (shouldCancel?.()) break

    queue = scan(doc, adapter).filter((field) => !handled.has(field.el as Element))
    total += queue.length
  }

  return buildReport({ ats: adapter.name, results, fieldsFound: total })
}
