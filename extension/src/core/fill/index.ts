import { resumeToFile } from "~profile/resume"

import { canonical } from "../label"
import type { AttemptOutcome, FieldSpec } from "../types"
import type { Resolved } from "../resolve"
import { dismissMenu, heldAs, readComboboxValue, selectFromCombobox } from "./combobox"
import {
  attachFiles,
  dropFiles,
  fireInput,
  isLive,
  safeClick,
  setNativeValue,
  typeInto,
  typeSequentially
} from "./dom"
import { pickOption } from "./options"

/**
 * Writes a resolved value into a control.
 *
 * Every path returns `{ kind: "wrote" }` at best. Nothing here may claim a
 * field is filled: that judgement belongs to verify.ts, after reading the DOM
 * back. See PRD invariant 5.1.
 */

/**
 * Reformat a stored date for the control that will receive it.
 *
 * Profile dates are ISO ("2027-05", "2027-05-15") because that is unambiguous
 * in storage. Forms want something else, and a text box that receives
 * "2027-05" reads as a malformed year to a recruiter.
 */
export function formatDate(value: string, kind: FieldSpec["kind"]): string {
  const month = value.match(/^(\d{4})-(\d{2})$/)
  const full = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)

  if (kind === "month") {
    if (month) return value
    if (full) return `${full[1]}-${full[2]}`
    return value
  }

  if (kind === "date") {
    if (full) return value
    // A month-precision value has to pick a day; the first is the convention.
    if (month) return `${value}-01`
    return value
  }

  // Text input.
  if (full) return `${full[2]}/${full[3]}/${full[1]}`
  if (month) return `${month[2]}/${month[1]}`
  return value
}

/** Convert a resolved value into the plain string a text control wants. */
function asText(resolved: Resolved, kind: FieldSpec["kind"]): string | null {
  switch (resolved.kind) {
    case "text":
      return /^\d{4}-\d{2}(-\d{2})?$/.test(resolved.value)
        ? formatDate(resolved.value, kind)
        : resolved.value
    case "boolean":
      return resolved.value ? "Yes" : "No"
    case "tristate":
      return resolved.value === "decline" ? "Decline to state" : resolved.value === "yes" ? "Yes" : "No"
    case "list":
      return resolved.value.join(", ")
    default:
      return null
  }
}

/**
 * The one part of a date a field is asking for.
 *
 * Forms split dates across their own boxes: "Start date year" wants 2022, not
 * 2022-09 and not 09/2022. Writing the whole thing leaves a required year
 * empty or rejected, which is how an education start date the profile holds
 * went unanswered.
 *
 * Only when the label names exactly one part. "Start date (MM/YYYY)" names
 * two and gets the formatted value as before.
 */
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
]

/**
 * The ways a control might want one part of a date, best first.
 *
 * A month box that is a dropdown lists names, not numbers: writing "05" into
 * a list of Januarys and Mays matches nothing, and "Please select your
 * graduation month" went unanswered. A month box that is a text field wants
 * the number. Offering both, in the order a form is most likely to use them,
 * costs nothing and covers either.
 */
function dateChoices(label: string, value: string): string[] | null {
  const piece = datePiece(label, value)
  if (piece === null) return null

  const asked = canonical(label)
  if (!/\bmonth\b/.test(asked)) return [piece]

  const index = Number(piece)
  const name = MONTH_NAMES[index - 1]

  return name ? [name, piece, String(index)] : [piece]
}

function datePiece(label: string, value: string): string | null {
  const iso = value.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/)
  if (!iso) return null

  const asked = canonical(label)
  const parts = [
    /\byear\b/.test(asked) ? "year" : null,
    /\bmonth\b/.test(asked) ? "month" : null,
    /\bday\b/.test(asked) ? "day" : null
  ].filter(Boolean)

  if (parts.length !== 1) return null

  if (parts[0] === "year") return iso[1]
  if (parts[0] === "month") return iso[2]

  return iso[3] ?? null
}

/** The comparable value for option picking. */
function asChoice(resolved: Resolved): string | boolean | null {
  switch (resolved.kind) {
    case "boolean":
      return resolved.value
    case "tristate":
      return resolved.value
    case "text":
      return resolved.value
    default:
      return null
  }
}

/**
 * Whether a control holds more than one value at a time.
 *
 * A multi-select says so in its markup: a `<select multiple>`, a widget that
 * keeps chosen values as removable pills, or a group of checkboxes. Anything
 * else is one answer, however many the profile has to offer.
 */
function acceptsMany(field: FieldSpec): boolean {
  if (field.kind === "multiselect") return true

  const el = field.el as HTMLElement
  if (el instanceof HTMLSelectElement && el.multiple) return true

  return Boolean(
    el.closest?.("[data-uxi-widget-type='multiselect']") ||
      el.parentElement?.querySelector?.(
        "[data-automation-id='selectedItemList'], [class*='multiValue'], [class*='multi-value']"
      )
  )
}

/**
 * Add several values to one control, one at a time.
 *
 * A skills box takes many entries, and each is a separate open, type and
 * pick. Partial success is reported as success with what actually went in,
 * because a form that took eight of twelve skills is not a failed field, and
 * the read-back still has to agree before any of it counts as filled.
 */
async function selectMany(el: HTMLElement, values: string[]): Promise<AttemptOutcome> {
  const wanted = values.filter((value) => value.trim().length > 0)
  if (wanted.length === 0) return { kind: "skipped", reason: "Nothing saved to add here" }

  const added: string[] = []
  const refused: string[] = []

  for (const value of wanted) {
    const outcome = await selectFromCombobox(el, value)

    /**
     * Judged by the control, not by the attempt.
     *
     * Several gestures can land the value, and on a box where Enter runs the
     * search the search itself sometimes commits what was typed. The attempt
     * then reports failure over an entry that is sitting right there, and the
     * next value types over a box that already did its job. Asking the
     * control what it holds is both simpler and the same standard the report
     * is held to.
     */
    /**
     * Judged only by what the control holds, and named the way IT names it.
     *
     * Not by whether the attempt believed it worked: FastAPI was listed as
     * written while the box plainly did not contain it. And not in the
     * profile's own words either, because a taxonomy renames what it is
     * given, so reporting "Python" against a field reading "Python
     * (Programming Language)" made the panel call a correct box a mismatch.
     */
    const landed = heldAs(readComboboxValue(el), value)

    if (landed) added.push(landed)
    else refused.push(value)
  }

  // Close up after the last value. Nothing else will: the results of whichever
  // entry went in last otherwise sit open over the rest of the form.
  dismissMenu(el)

  if (added.length === 0) {
    return {
      kind: "needs_you",
      reason: `None of your saved entries are offered here (tried ${wanted.length})`
    }
  }

  return {
    kind: "wrote",
    value: added.join(", "),
    note: refused.length > 0 ? `not offered here: ${refused.join(", ")}` : undefined
  }
}

/**
 * Whether this uploader is already showing the file Ditto is about to attach.
 *
 * Compared on the name without its extension, because sites print what they
 * were given and some of them trim it.
 */
function fileAlreadyThere(field: FieldSpec, filename: string): boolean {
  const input = field.el instanceof HTMLInputElement ? field.el : null
  if (input?.files?.length) return true

  const stem = canonical(filename.replace(/\.[^.]+$/, ""))
  if (stem.length < 3) return false

  const block = field.container?.isConnected
    ? field.container
    : (field.el as Element).isConnected
      ? (field.el as Element).closest("[class*='upload'], [class*='attachment'], [data-automation-id]")
      : null

  return canonical(block?.textContent ?? "").includes(stem)
}

/** The dropdown path, shared by comboboxes and multi-selects. */
async function fillCombobox(field: FieldSpec, resolved: Resolved): Promise<AttemptOutcome> {
  const choice = asChoice(resolved)
  if (choice === null) return { kind: "error", reason: "Nothing sensible to select here" }

  const wanted = typeof choice === "boolean" ? (choice ? "Yes" : "No") : String(choice)
  const outcome = await selectFromCombobox(field.el as HTMLElement, wanted)

  if (!outcome.ok) {
    return { kind: "error", reason: outcome.reason ?? "Could not set this dropdown" }
  }

  /**
   * Report what the control holds, not what it was asked for.
   *
   * A dropdown answers in its own words: Ditto asks for "no" and the form
   * records "I am not a protected veteran". Reporting the request meant
   * verification compared "no" against that sentence, found no relationship
   * between them, and put a red cross on a question that was answered
   * correctly. The value the user can see is the one worth checking.
   */
  const showing = readComboboxValue(field.el as HTMLElement)

  return { kind: "wrote", value: showing || outcome.value || wanted }
}

export async function fill(field: FieldSpec, resolved: Resolved): Promise<AttemptOutcome> {
  // Non-value outcomes pass straight through to the report.
  if (resolved.kind === "none") {
    return { kind: "skipped", reason: resolved.reason }
  }

  if (resolved.kind === "needs_you") {
    return { kind: "needs_you", reason: resolved.reason }
  }

  /**
   * A list only goes into a control that holds more than one value.
   *
   * "Select the top three engineer profile types. First preference:" is one
   * choice out of six, and pouring a skills list into it tried every skill in
   * turn against options none of them could match. A single choice gets a
   * single value, and if that value is not on offer the question goes to the
   * user, which is the honest outcome.
   */
  /**
   * A control asking for one part of a date, offered that part in the
   * spellings it might use.
   */
  if (resolved.kind === "text" && (field.kind === "select" || field.kind === "combobox")) {
    const choices = dateChoices(field.label, resolved.value)

    if (choices) {
      for (const choice of choices) {
        const outcome = await fill({ ...field, kind: field.kind }, { kind: "text", value: choice })
        if (outcome.kind === "wrote") return outcome
      }

      return {
        kind: "needs_you",
        reason: `Nothing here matches "${choices[0]}"`
      }
    }
  }

  if (resolved.kind === "list" && !acceptsMany(field)) {
    const first = resolved.value.find((item) => item.trim().length > 0)
    if (!first) return { kind: "skipped", reason: "Nothing saved to put here" }

    resolved = { kind: "text", value: first }
  }

  /**
   * An uploader that already holds the file is done, not broken.
   *
   * Checked ahead of the liveness guard below, because a site that takes a
   * file often removes the input it came from: Greenhouse deletes it outright.
   * Judged after that guard, a resume that is visibly attached reads as a
   * field that vanished.
   */
  if (field.kind === "file" && resolved.kind === "file") {
    if (fileAlreadyThere(field, resolved.value.filename)) {
      return { kind: "wrote", value: resolved.value.filename }
    }
  }

  if (!isLive(field.el)) {
    return { kind: "error", reason: "The field disappeared before it could be filled" }
  }

  try {
    switch (field.kind) {
      case "text":
      case "textarea":
      case "date":
      case "month": {
        const value = asText(resolved, field.kind)
        if (value === null) return { kind: "error", reason: "Nothing sensible to write here" }

        // A box asking for one part of a date gets that part.
        const piece = resolved.kind === "text" ? datePiece(field.label, resolved.value) : null
        if (piece !== null) {
          await typeInto(field.el as HTMLInputElement | HTMLTextAreaElement, piece)
          return { kind: "wrote", value: piece }
        }

        // Workday spreads a date across separate MM and YYYY spin buttons
        // inside a group, so there is no single input to write to.
        //
        // Given the STORED value, not the formatted one. Formatting pads
        // "2024-06" out to "2024-06-01" so a single date input has a full
        // date to accept, and for split boxes that invented day would be
        // typed into a box of its own, asserting a start date the user never
        // gave. See PRD 5.2.
        // Only a date can be split, and only a date. A textarea is not an
        // HTMLInputElement either, so testing the element alone sent every
        // textarea on every ATS into the date filler to be told it had no
        // boxes to write into.
        const split =
          (field.kind === "date" || field.kind === "month") &&
          !(field.el instanceof HTMLInputElement)

        if (split) {
          return await fillDateParts(field.el, resolved.kind === "text" ? resolved.value : value)
        }

        await typeInto(field.el as HTMLInputElement | HTMLTextAreaElement, value)
        return { kind: "wrote", value }
      }

      case "select": {
        const choice = asChoice(resolved)
        if (choice === null) return { kind: "error", reason: "Nothing sensible to select here" }

        const option = pickOption(field.options ?? [], choice)
        if (!option) {
          return {
            kind: "needs_you",
            reason: `No option here matches "${String(choice)}"`
          }
        }

        const select = field.el as HTMLSelectElement
        setNativeValue(select, option.value)
        fireInput(select)

        return { kind: "wrote", value: option.label }
      }

      case "radiogroup": {
        const choice = asChoice(resolved)
        if (choice === null) return { kind: "error", reason: "Nothing sensible to select here" }

        const option = pickOption(field.options ?? [], choice)
        if (!option?.el) {
          return {
            kind: "needs_you",
            reason: `No option here matches "${String(choice)}"`
          }
        }

        safeClick(option.el)
        return { kind: "wrote", value: option.label }
      }

      case "checkbox": {
        if (resolved.kind !== "boolean") {
          return { kind: "needs_you", reason: "This checkbox needs your judgement" }
        }

        const box = field.el as HTMLInputElement
        if (box.checked !== resolved.value) safeClick(box)

        return { kind: "wrote", value: resolved.value ? "checked" : "unchecked" }
      }

      case "file": {
        if (resolved.kind !== "file") {
          return { kind: "error", reason: "Expected a file for this field" }
        }

        const file = resumeToFile(resolved.value)

        if (field.el instanceof HTMLInputElement) {
          attachFiles(field.el, [file])
        } else {
          dropFiles(field.el, [file])
        }

        return { kind: "wrote", value: resolved.value.filename }
      }

      case "multiselect": {
        // A group of checkboxes is ticked, not opened. Routing it through the
        // dropdown driver would look for a menu that does not exist and then
        // report that it could not open one.
        const boxes = field.options?.filter((option) => option.el instanceof HTMLInputElement) ?? []

        if (boxes.length > 0) {
          const choice = asChoice(resolved)
          if (choice === null) {
            return { kind: "needs_you", reason: "This question needs your judgement" }
          }

          const option = pickOption(boxes, choice)
          if (!option?.el) {
            return { kind: "needs_you", reason: `No option here matches "${String(choice)}"` }
          }

          const box = option.el as HTMLInputElement
          if (!box.checked) safeClick(box)

          return { kind: "wrote", value: option.label }
        }

        // A <select multiple> falls through to the dropdown path.
        return fillCombobox(field, resolved)
      }

      case "combobox": {
        // A list is many selections in one control, not one comma-joined
        // string. Skills is the case: asChoice had no answer for a list, so
        // the whole field came back as "nothing sensible to select here"
        // while the profile held a dozen skills the box was asking for.
        if (resolved.kind === "list") {
          return await selectMany(field.el as HTMLElement, resolved.value)
        }

        const choice = asChoice(resolved)
        if (choice === null) return { kind: "error", reason: "Nothing sensible to select here" }

        const wanted =
          typeof choice === "boolean" ? (choice ? "Yes" : "No") : String(choice)

        const outcome = await selectFromCombobox(field.el as HTMLElement, wanted)
        dismissMenu(field.el as HTMLElement)

        if (!outcome.ok) {
          // This is the "Country: could not open the dropdown" case. Reporting
          // it as an error rather than a fill is the whole point.
          return { kind: "error", reason: outcome.reason ?? "Could not set this dropdown" }
        }

        return { kind: "wrote", value: outcome.value ?? wanted }
      }
    }
  } catch (error) {
    return {
      kind: "error",
      reason: error instanceof Error ? error.message : "Could not write to this field"
    }
  }
}

/**
 * Write a date into the separate boxes a site has split it across.
 *
 * Workday's From and To are a `role="group"` holding an MM spin button and a
 * YYYY one, each labelled by `aria-label`. Each part is written on its own,
 * because the widget keeps its state per section and a single string typed
 * into the first box is either rejected or silently truncated.
 *
 * Parts the profile has no answer for are left alone rather than zeroed: a
 * stored "2024-06" has no day in it, and writing 01 into a day box invents a
 * date the user never gave.
 */
async function fillDateParts(group: HTMLElement, value: string): Promise<AttemptOutcome> {
  const parts = Array.from(group.querySelectorAll<HTMLInputElement>("input[role='spinbutton']"))
  if (parts.length === 0) {
    return { kind: "error", reason: "This date has no boxes to write into" }
  }

  // "2024-06" and "2024-06-15", the two shapes the profile stores.
  const [year, month, day] = value.split("-")
  if (!year || !month) {
    return { kind: "error", reason: `Could not read "${value}" as a date` }
  }

  const forPart: Record<string, string | undefined> = { month, year, day }
  let written = 0

  for (const part of parts) {
    const which = (part.getAttribute("aria-label") ?? "").toLowerCase().trim()
    const text = forPart[which]
    if (!text) continue

    // Typed, not assigned. A spin button keeps its own state and updates it
    // from keystrokes: setting the value put 06/2026 on screen while
    // Workday's model still had no year, and it rejected the field as
    // "Invalid Date: 06/" over boxes that visibly read correctly.
    await typeSequentially(part, text, 0)
    part.dispatchEvent(new Event("change", { bubbles: true }))
    written += 1
  }

  if (written === 0) {
    return { kind: "error", reason: "None of this date's boxes could be identified" }
  }

  return { kind: "wrote", value }
}
