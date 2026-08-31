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
function readBack(field: FieldSpec): string | null {
  // The element may have been replaced rather than updated. A control that is
  // genuinely gone cannot be confirmed; one that was merely re-rendered can,
  // and reporting the two the same way calls six correct fields failures.
  const el = relocate(field.el)
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

    case "file": {
      const input = el instanceof HTMLInputElement ? el : null
      const file = input?.files?.[0]
      if (file) return file.name

      /**
       * The uploader having taken the file and emptied the input.
       *
       * Workday's dropzone reads the file, uploads it, and lists it by name
       * beside the control; the input it came from is left empty. Reading only
       * `input.files` then reports a refusal over a resume that is visibly
       * attached, which is the read-back describing its own blind spot rather
       * than the page.
       */
      const uploader = el.closest(
        "[data-automation-id='attachments-FileUpload'], [data-field-path], [class*='upload'], [class*='attachment'], [class*='field']"
      )

      const listed = uploader?.textContent?.trim()
      const named = listed?.match(/[^\s/\\]+\.(?:pdf|docx?|rtf|txt)\b/i)

      return named ? named[0] : null
    }

    case "combobox":
    case "multiselect": {
      // react-select clears its text input after committing and mirrors the
      // chosen value onto the container, so reading input.value here would
      // see an empty box and call a successful selection a failure.
      return readComboboxValue(el as HTMLElement) || null
    }
  }
}

/**
 * Whether what came back out is what went in.
 *
 * Compared loosely, because controls legitimately reformat: a phone box turns
 * "8324180086" into "(832) 418-0086", and a select echoes the option label
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
    key
  }

  switch (attempt.kind) {
    case "skipped":
      return { ...base, status: "skipped", reason: attempt.reason }

    case "needs_you":
      return { ...base, status: "needs_you", reason: attempt.reason }

    case "error":
      return { ...base, status: "error", reason: attempt.reason }

    case "wrote": {
      const actual = readBack(field)

      if (actual === null) {
        return {
          ...base,
          status: "error",
          reason: "Wrote the value but the field did not accept it"
        }
      }

      if (!matches(attempt.value, actual)) {
        return {
          ...base,
          status: "error",
          reason: `Wrote "${attempt.value}" but the field shows "${actual}"`
        }
      }

      return { ...base, status: "filled", value: actual }
    }
  }
}
