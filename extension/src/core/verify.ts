import { readComboboxValue } from "./fill/combobox"
import { relocate } from "./fill/dom"
import { canonical } from "./label"
import type { AttemptOutcome, FieldSpec, FillResult, ProfileKey } from "./types"

/**
 * The only place a field becomes `filled`.
 *
 * PRD invariant 5.1. A Jobright screenshot shows a Workday resume dropzone
 * sitting visibly empty, with an empty `Alert:` beneath it, while the panel
 * reported 3/3 and 100% with a green check on Resume/CV. The write had
 * succeeded; the attach had not. Nobody had lied, the panel just reported the
 * attempt instead of the result.
 *
 * So a fill function can only ever report that it *wrote* something. This
 * reads the DOM back and decides whether that write survived. If it cannot
 * confirm the value is actually present, the result is `error`, never
 * `filled`. A green check the user cannot trust is worse than no check,
 * because they submit on the strength of it.
 */

/** Reads the current value back out of a control. */
function readBack(field: FieldSpec, wrote?: string): string | null {
  // The element may have been replaced rather than updated. A control that is
  // genuinely gone cannot be confirmed; one that was merely re-rendered can,
  // and reporting the two the same way calls six correct fields failures.
  const el = relocate(field.el)

  // A file field is read before the missing-element check, because the whole
  // point of the check below is that a control which is gone cannot be
  // confirmed, and an uploader that took the file DELETES its input.
  if (field.kind === "file") return readAttachedFile(field, el, wrote)

  if (!el) return null

  switch (field.kind) {
    case "text":
    case "textarea":
      return (el as HTMLInputElement).value ?? null

    case "date":
    case "month": {
      // A date split across spin buttons has no single value to read. The
      // group is a div, so reading `.value` off it returned undefined and
      // every From and To on the page was reported as refused while showing
      // the right date.
      if (el instanceof HTMLInputElement) return el.value ?? null

      // By name, not in document order: the month box comes first on screen,
      // and joining as it reads gives "06-2024" for a date written as
      // "2024-06", which then fails to match what was written.
      const parts: Record<string, string> = {}

      for (const box of el.querySelectorAll<HTMLInputElement>("input[role='spinbutton']")) {
        const which = (box.getAttribute("aria-label") ?? "").toLowerCase().trim()
        if (which) parts[which] = box.value.trim()
      }

      // A year and a month at minimum. Half a date is not a date, and
      // confirming from the month alone would pass a field the form will
      // reject.
      if (!parts.year || !parts.month) return null

      // Padded, because the widget drops a leading zero: a June written as
      // "2026-06" reads back as "2026-6", and every date on the page was
      // reported as refused over a one character difference in spelling.
      const pad = (piece: string) => piece.padStart(2, "0")

      return parts.day
        ? `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`
        : `${parts.year}-${pad(parts.month)}`
    }

    case "select": {
      const select = el as HTMLSelectElement
      const option = select.selectedOptions?.[0]
      return option ? option.textContent ?? select.value : select.value
    }

    case "radiogroup": {
      const chosen = field.options?.find((candidate) => {
        const option = { ...candidate, el: candidate.el ? relocate(candidate.el) : null }
        if (!option.el) return false

        // A real radio records its state in `checked`; an ARIA toggle records
        // it in aria-pressed or aria-checked.
        if (option.el instanceof HTMLInputElement) return option.el.checked

        return (
          option.el.getAttribute("aria-pressed") === "true" ||
          option.el.getAttribute("aria-checked") === "true"
        )
      })

      return chosen ? chosen.label : null
    }

    case "checkbox":
      return (el as HTMLInputElement).checked ? "checked" : "unchecked"

    case "combobox":
    case "multiselect": {
      // react-select clears its text input after committing and mirrors the
      // chosen value onto the container, so reading input.value here would
      // see an empty box and call a successful selection a failure.
      return readComboboxValue(el as HTMLElement) || null
    }
  }
}

/** A filename as a site prints it beside an uploader. */
const FILENAME = /[^\s/\\]+\.(?:pdf|docx?|rtf|txt)\b/i

/** Containers that wrap a file control across the four target sites. */
const UPLOADER =
  "[data-automation-id='attachments-FileUpload'], [data-field-path], [class*='upload'], [class*='attachment'], [class*='field']"

/**
 * What file the page is showing for this field, whatever became of the input.
 *
 * Three states, all of them meaning the file is attached:
 *
 *  - The input still holds it. Lever, and Greenhouse before it commits.
 *  - The input is empty and the name is printed beside it. Workday's dropzone
 *    reads the file, uploads it, and clears the control it came from.
 *  - The input is GONE. Measured on the live Greenhouse form: attaching a
 *    resume replaces the whole Attach block with a chip carrying the filename,
 *    and `getElementById("resume")` returns null a moment later.
 *
 * The third is why this runs ahead of the missing-element check in readBack.
 * That check exists because a control that vanished cannot be confirmed, which
 * is true of every kind except this one, where vanishing is the confirmation.
 * Without this the user attaches a resume, sees it named on the page, and gets
 * a red cross telling them it did not take.
 *
 * The block comes from the scan, not from a search. Looking for it by label
 * does not work here: the only label pointing at Greenhouse's resume input
 * reads "Attach", and that word disappears along with the button.
 */
/**
 * Wait for an uploader to show the file, before asking whether it did.
 *
 * Measured on the live Greenhouse form, sampling the DOM after the change
 * event:
 *
 *   at the instant change returns   input gone, block reads "Resume/CV*"
 *   +320ms                          block reads "Resume/CV* <filename>"
 *
 * The input is torn out synchronously and the chip naming the file is painted
 * a beat later, so verification ran inside a window where there was genuinely
 * nothing to find. Every lookup was returning the right answer about the
 * wrong moment, and the user got "wrote the value but the field did not
 * accept it" over a resume that was seconds from appearing.
 *
 * Polls rather than waits a fixed time, so the common case stays fast and a
 * slow upload still gets its chance. Returning without a filename is not a
 * verdict: verify reads the DOM again afterwards and decides.
 */
export async function settleFile(field: FieldSpec, wrote?: string, budgetMs = 4000): Promise<void> {
  const deadline = Date.now() + budgetMs

  while (Date.now() < deadline) {
    if (readAttachedFile(field, relocate(field.el), wrote)) return
    await new Promise((done) => setTimeout(done, 100))
  }
}

function readAttachedFile(field: FieldSpec, el: Element | null, wrote?: string): string | null {
  if (el instanceof HTMLInputElement && el.files?.[0]) return el.files[0].name

  /**
   * The name that was attached, and the name with its extension taken off.
   *
   * Sites shorten what they print. Looking for the file Ditto actually sent
   * is a better question than looking for something that LOOKS like a
   * filename, which depends on guessing the extension right and fails
   * outright on a resume saved without one.
   */
  const written = wrote ? canonical(wrote) : ""
  const stem = wrote ? canonical(wrote.replace(/\.[^.]+$/, "")) : ""

  for (const scope of scopesFor(field, el)) {
    const text = scope.textContent ?? ""
    const shown = canonical(text)

    if (written && shown.includes(written)) return wrote as string
    if (stem.length > 2 && shown.includes(stem)) return wrote as string

    const named = text.match(FILENAME)
    if (named) return named[0]
  }

  return null
}

/**
 * What the uploader is actually showing, for the failure message.
 *
 * A read-back that fails silently costs a round trip with the user every
 * time: "it shows a cross" says nothing about which of the stages missed.
 * Printing what Ditto could see makes the panel say enough to act on.
 */
function uploaderText(field: FieldSpec): string {
  for (const scope of scopesFor(field, relocate(field.el))) {
    const text = (scope.textContent ?? "").replace(/\s+/g, " ").trim()
    if (text) return text.length > 60 ? text.slice(0, 60) + "..." : text
  }

  return "nothing"
}

/**
 * Every place this field's file could be showing, best handle first.
 *
 * Three handles rather than one because each fails differently and none of
 * them fails quietly: the element is gone on Greenhouse, the container is
 * missing on a form the scan reached another way, and the label search is
 * wrong on a page that repeats a question. Trying all three costs one pass
 * over a handful of nodes and removes a whole class of false red cross.
 */
function* scopesFor(field: FieldSpec, el: Element | null): Generator<Element> {
  if (el?.isConnected) {
    const nearest = el.closest(UPLOADER)
    if (nearest) yield nearest
  }

  if (field.container?.isConnected) yield field.container

  const byLabel = uploaderShowing(field)
  if (byLabel) yield byLabel
}

/**
 * Last resort: find the uploader by the question it is under.
 *
 * Scoped to a block that both names the question and is showing a file, so a
 * page with three uploaders cannot answer for the resume with the cover
 * letter's filename. Narrowest match wins, since the containers nest.
 */
function uploaderShowing(field: FieldSpec): Element | null {
  const doc = field.el.ownerDocument
  const wanted = canonical(field.label)
  if (!doc || !wanted) return null

  let best: Element | null = null

  for (const block of Array.from(doc.querySelectorAll(UPLOADER))) {
    const text = block.textContent ?? ""
    if (!FILENAME.test(text)) continue
    if (!canonical(text).includes(wanted)) continue
    if (!best || best.contains(block)) best = block
  }

  return best
}

/**
 * Whether what came back out is what went in.
 *
 * Compared loosely, because controls legitimately reformat: a phone box turns
 * "5551234567" into "(555) 123-4567", and a select echoes the option label
 * rather than the value written. Loose here means normalized equality or
 * containment in either direction, which tolerates reformatting without
 * accepting an unrelated value.
 */
function matches(wrote: string, readBack: string): boolean {
  const a = canonical(wrote)
  const b = canonical(readBack)

  if (!a || !b) return false
  if (a === b) return true
  if (a.includes(b) || b.includes(a)) return true

  // Digit-only comparison rescues reformatted phone numbers and dates.
  const digitsA = wrote.replace(/\D/g, "")
  const digitsB = readBack.replace(/\D/g, "")

  return digitsA.length > 0 && digitsA === digitsB
}

/**
 * Promote an attempt to a result.
 *
 * `wrote` is the only outcome that can become `filled`, and only after the
 * read-back agrees.
 */
export function verify(
  field: FieldSpec,
  attempt: AttemptOutcome,
  key?: ProfileKey
): FillResult {
  const base = {
    fieldId: field.id,
    label: field.label,
    required: field.required,
    key,
    /**
     * Relocated, so a row still points somewhere after a re-render replaced
     * the node the scan captured.
     *
     * Falls back to the block the control lived in, for a site that removes
     * the control outright: Greenhouse deletes its file input on attach, and
     * a resume row with nothing to point at is a row that does nothing when
     * clicked.
     */
    el: relocate(field.el) ?? (field.container?.isConnected ? field.container : field.el)
  }

  switch (attempt.kind) {
    case "skipped":
      return { ...base, status: "skipped", reason: attempt.reason }

    case "needs_you":
      return { ...base, status: "needs_you", reason: attempt.reason }

    case "error":
      return { ...base, status: "error", reason: attempt.reason }

    case "wrote": {
      const actual = readBack(field, attempt.value)

      if (actual === null) {
        return {
          ...base,
          status: "error",
          reason:
            field.kind === "file"
              ? `Attached "${attempt.value}" but the uploader shows ${uploaderText(field)}`
              : "Wrote the value but the field did not accept it"
        }
      }

      /**
       * A multi-select is checked item by item, not as one string.
       *
       * Ditto writes "Python, Java, Docker (Software)" and the control shows
       * the same three as pills, in whatever order it likes, alongside
       * anything that was already there. Neither string contains the other, so
       * a plain comparison called a correct answer wrong: the panel listed
       * every skill it had written and put a red cross beside them.
       *
       * Every value written has to be present. Extra values are not a failure,
       * since the user may have chosen some themselves.
       */
      if (field.kind === "multiselect") {
        const shown = canonical(actual)
        const missing = attempt.value
          .split(",")
          .map((piece) => canonical(piece))
          .filter((piece) => piece && !shown.includes(piece))

        if (missing.length > 0) {
          return {
            ...base,
            status: "error",
            reason: `Wrote ${attempt.value} but the field does not show ${missing.join(", ")}`
          }
        }

        return { ...base, status: "filled", value: actual, reason: attempt.note }
      }

      if (!matches(attempt.value, actual)) {
        return {
          ...base,
          status: "error",
          reason: `Wrote "${attempt.value}" but the field shows "${actual}"`
        }
      }

      return { ...base, status: "filled", value: actual, reason: attempt.note }
    }
  }
}
