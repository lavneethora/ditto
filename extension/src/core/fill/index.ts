import { resumeToFile } from "~profile/resume"

import type { AttemptOutcome, FieldSpec } from "../types"
import type { Resolved } from "../resolve"
import { selectFromCombobox } from "./combobox"
import { attachFiles, dropFiles, isLive, safeClick, setNativeValue, fireInput, typeInto } from "./dom"
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

export async function fill(field: FieldSpec, resolved: Resolved): Promise<AttemptOutcome> {
  // Non-value outcomes pass straight through to the report.
  if (resolved.kind === "none" || resolved.kind === "opted_out") {
    return { kind: "skipped", reason: resolved.reason }
  }

  if (resolved.kind === "needs_you") {
    return { kind: "needs_you", reason: resolved.reason }
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

        typeInto(field.el as HTMLInputElement, value)
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

      case "combobox":
      case "multiselect": {
        const choice = asChoice(resolved)
        if (choice === null) return { kind: "error", reason: "Nothing sensible to select here" }

        const wanted =
          typeof choice === "boolean" ? (choice ? "Yes" : "No") : String(choice)

        const outcome = await selectFromCombobox(field.el as HTMLElement, wanted)

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
