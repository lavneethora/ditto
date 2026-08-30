import type { Profile } from "~profile/schema"

import { fill } from "./fill"
import { clickStructural } from "./fill/dom"
import { match } from "./match"
import { buildReport } from "./report"
import { resolve, resolveUnmatched } from "./resolve"
import { scan } from "./scan"
import type { Adapter, FieldSpec, FillReport, FillResult, RepeatableSection } from "./types"
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
 * The most panels Ditto will add to one section.
 *
 * A guard against a profile with a long history turning an application into a
 * wall of entries, and against an Add button that does not actually add
 * anything turning the loop into a click storm.
 */
const MAX_ADDED_ENTRIES = 8

/** How long to wait for a panel to appear after pressing Add. */
const PANEL_WAIT_MS = 1200

/** An entry the user has actually filled in, rather than an empty row. */
function hasContent(entry: Record<string, unknown>): boolean {
  return Object.entries(entry).some(
    ([field, value]) => field !== "id" && typeof value === "string" && value.trim().length > 0
  )
}

/**
 * How many entries the profile has for a section.
 *
 * Websites is not a collection in the profile: it is the three link fields,
 * which the user thinks of separately and Workday asks for as an unlabelled
 * list. Counting the ones that are filled is what decides how many boxes to
 * ask for.
 */
function entriesToPlace(profile: Profile, collection: RepeatableSection["collection"]): number {
  if (collection === "websites") {
    const { linkedin, github, website } = profile.personal
    return [linkedin, github, website].filter((link) => link.trim().length > 0).length
  }

  const entries = collection === "work" ? profile.work : profile.education
  return entries.filter((entry) => hasContent(entry as unknown as Record<string, unknown>)).length
}

/**
 * Grow the repeatable sections to fit the profile, before filling anything.
 *
 * Workday's Work Experience is a heading and an "Add" button with no fields
 * behind it, so without this a profile with three jobs has nowhere to put any
 * of them, and the step reports 100% having filled none of the history the
 * user came to enter.
 *
 * Runs before the scan rather than as another reveal pass, so the panels exist
 * by the time fields are collected and each one is filled and reported like
 * any other.
 */
async function growSections(
  doc: Document,
  adapter: Adapter,
  profile: Profile
): Promise<void> {
  for (const collection of ["work", "education", "websites"] as const) {
    const wanted = entriesToPlace(profile, collection)

    for (let added = 0; added < MAX_ADDED_ENTRIES; added++) {
      // Re-read every time rather than caching the button and the count.
      // Adding a panel re-renders the section, which replaces the Add button
      // with an identical one, and the reference from the previous iteration
      // is then detached and clicking it does nothing. Re-reading also makes
      // the panel count self-correcting if a press adds more than one.
      const section = adapter.repeatables?.(doc)?.find((s) => s.collection === collection)
      if (!section || section.present >= wanted) break

      const before = panelCount(doc)

      try {
        clickStructural(section.add)
      } catch {
        // A blocked Add button is not a reason to abandon the whole run. The
        // section stays short, and its fields are reported as needing the user.
        break
      }

      // Stop if pressing Add produced nothing, rather than pressing again.
      if (!(await waitForGrowth(doc, before))) break
    }
  }
}

function panelCount(doc: Document): number {
  return doc.querySelectorAll("[role='group'][aria-labelledby]").length
}

async function waitForGrowth(doc: Document, before: number): Promise<boolean> {
  const deadline = Date.now() + PANEL_WAIT_MS

  while (Date.now() < deadline) {
    if (panelCount(doc) > before) return true
    await new Promise((done) => setTimeout(done, 60))
  }

  return false
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
  // Make room before looking, so a panel added here is scanned, filled and
  // reported exactly like one the page shipped with.
  await growSections(doc, adapter, profile)

  const results: FillResult[] = []

  /**
   * What has already been done, by an identity that survives a re-render.
   *
   * Not the field id, which is assigned per scan and renumbers on the second
   * one. And not the element either, which is the trap: Workday replaces its
   * inputs rather than updating them, so after the first pass every field on
   * the page is a new object and the second pass fills all of them again. The
   * user sees First Name, Last Name, Address, City and Phone listed twice.
   *
   * So identity comes from what the site published, the same order relocate
   * uses. Controls carrying none of it fall back to the element, which is
   * correct for anything that did not get replaced and no worse than before
   * for anything that did.
   */
  const handledKeys = new Set<string>()
  const handledElements = new Set<Element>()

  const identityOf = (el: Element) =>
    el.getAttribute("id") || el.getAttribute("data-automation-id") || el.getAttribute("name") || ""

  const alreadyDone = (el: Element) => {
    const key = identityOf(el)
    return key ? handledKeys.has(key) : handledElements.has(el)
  }

  const remember = (el: Element) => {
    const key = identityOf(el)
    if (key) handledKeys.add(key)
    else handledElements.add(el)
  }

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

      remember(field.el as Element)

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

    queue = scan(doc, adapter).filter((field) => !alreadyDone(field.el as Element))
    total += queue.length
  }

  return buildReport({ ats: adapter.name, results, fieldsFound: total })
}
