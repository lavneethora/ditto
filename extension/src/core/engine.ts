import type { Profile } from "~profile/schema"

import { fill } from "./fill"
import { clickStructural, relocate } from "./fill/dom"
import { isConsentQuestion, match } from "./match"
import { buildReport } from "./report"
import { resolve, resolveUnmatched } from "./resolve"
import type { Resolved } from "./resolve"
import { scan } from "./scan"
import type { Adapter, FieldSpec, FillReport, FillResult, ProfileKey, RepeatableSection } from "./types"
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

/**
 * The value as the site would spell it, where the adapter knows.
 *
 * Applied here rather than inside the dropdown driver, so the driver stays
 * ignorant of which site it is on and every field gets the same treatment.
 * Anything the adapter has no name for passes through untouched.
 */
function siteSpelling(resolved: Resolved, key: ProfileKey | undefined, adapter: Adapter): Resolved {
  if (!adapter.alias || !key) return resolved

  if (resolved.kind === "text") {
    return { ...resolved, value: adapter.alias(resolved.value, key) ?? resolved.value }
  }

  if (resolved.kind === "list") {
    return {
      ...resolved,
      value: resolved.value.map((item) => adapter.alias?.(item, key) ?? item)
    }
  }

  return resolved
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

/**
 * How long to let the form settle before saying the answers again.
 *
 * Long enough for the re-render that follows the last write, including the
 * one a file attachment sets off.
 */
const SETTLE_BEFORE_REASSERT_MS = 700

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

  /**
   * Files last.
   *
   * Attaching one makes a site re-render, sometimes a beat later and
   * sometimes across the whole form, and whatever was filled in the moments
   * after it can be reset while the DOM keeps showing the text. On Ashby the
   * resume sits third and Preferred First Name fifth, and that field kept
   * coming back as unanswered on submit while everything around it passed.
   *
   * Nothing else depends on the order, so the cheapest fix is to let the
   * disruptive write happen when there is nothing left to disrupt.
   */
  const filesLast = (fields: FieldSpec[]) => [
    ...fields.filter((field) => field.kind !== "file"),
    ...fields.filter((field) => field.kind === "file")
  ]

  /** Everything Ditto wrote, in the order it wrote it. */
  const landed: { field: FieldSpec; written: Resolved }[] = []

  let queue = filesLast(scan(doc, adapter))
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

      /**
       * Consent is the user's to give, before anything else is considered.
       *
       * Checked here rather than left to the rules, because the rules are the
       * problem: one of Workday's AI consent questions matched
       * `work[].company`, off the words "how Company processes your personal
       * data" in the privacy notice at the bottom of it. A saved snippet could
       * do the same. A consent given by a filler is not a consent, and the
       * person it binds is the user.
       */
      const resolved = isConsentQuestion(field.label)
        ? ({ kind: "needs_you", reason: "This one is your decision to make" } as const)
        : matched
          ? resolve(matched, field, profile)
          : // Unmatched open-text questions still get a shot at a saved answer,
            // since covering questions the rules cannot anticipate is the point
            // of snippets.
            resolveUnmatched(field, profile)

      const written = siteSpelling(resolved, matched?.key, adapter)
      const attempt = await fill(field, written)
      const result = verify(field, attempt, matched?.key)

      // Kept so the value can be reasserted once the form has settled.
      if (attempt.kind === "wrote") landed.push({ field, written })

      results.push(result)
      onProgress?.(results.length, total, result)

      // Only yield after a write. Skipped fields touched nothing, so there is
      // nothing for React to commit and no reason to pay for a frame.
      if (attempt.kind === "wrote") await yieldToBrowser()
    }

    if (shouldCancel?.()) break

    queue = filesLast(scan(doc, adapter).filter((field) => !alreadyDone(field.el as Element)))
    total += queue.length
  }

  if (!shouldCancel?.()) await reassert(landed)

  return buildReport({ ats: adapter.name, results, fieldsFound: total })
}

/**
 * Write the simple answers a second time, once the form has stopped moving.
 *
 * Some forms drop an answer they were given. Ashby rejected Preferred First
 * Name as unanswered on one run and Email on the next, with a radio joining
 * them on a third: the same fill, a different casualty each time, which is a
 * race rather than a broken field. Re-reading is no help, because the DOM
 * still shows the value; what was lost is the site's own record of it.
 *
 * So this does not check anything. It says it again, after everything else has
 * finished and the last re-render has had time to land, on the controls where
 * saying it twice is free: typing into a box and pressing a radio that is
 * already pressed both leave exactly the state they found.
 *
 * Dropdowns and files are left alone. Re-choosing an option is slow, and on a
 * control that accepts several values it would add a second copy rather than
 * confirm the first.
 */
async function reassert(landed: { field: FieldSpec; written: Resolved }[]): Promise<void> {
  const repeatable = landed.filter(({ field }) =>
    ["text", "textarea", "date", "month", "radiogroup", "checkbox"].includes(field.kind)
  )

  if (repeatable.length === 0) return

  await new Promise((done) => setTimeout(done, SETTLE_BEFORE_REASSERT_MS))

  for (const { field, written } of repeatable) {
    const el = relocate(field.el as Element)
    if (!el) continue

    try {
      await fill({ ...field, el: el as FieldSpec["el"] }, written)
    } catch {
      // A field that has since become unfillable is not worth failing over:
      // the report already said what happened the first time.
    }
  }
}
