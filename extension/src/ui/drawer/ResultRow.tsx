import type { FillResult, FillStatus } from "~core/types"

/**
 * One field in the drawer's result list.
 *
 * The status mark is deliberately four distinct things, not two. PRD invariant
 * 5.3: a field Ditto failed on and a field the user opted out of look
 * identical if you only draw "done" and "not done", and the difference is the
 * whole reason to read the list.
 *
 * Green is used for exactly one thing, a verified fill, and is never borrowed
 * for decoration anywhere else in the UI.
 */

const MARKS: Record<FillStatus | "pending", { glyph: string; className: string; title: string }> = {
  filled: { glyph: "✓", className: "ditto-mark--filled", title: "Filled and verified" },
  error: { glyph: "✕", className: "ditto-mark--error", title: "Ditto tried and could not" },
  needs_you: { glyph: "!", className: "ditto-mark--needs", title: "Needs you" },
  skipped: { glyph: "–", className: "ditto-mark--skipped", title: "Skipped" },
  pending: { glyph: "", className: "ditto-mark--pending", title: "Waiting" }
}

export function StatusMark({ status }: { status: FillStatus | "pending" }) {
  const mark = MARKS[status]

  return (
    <span className={`ditto-mark ${mark.className}`} title={mark.title} aria-label={mark.title}>
      {mark.glyph}
    </span>
  )
}

/**
 * Clicking a row scrolls the underlying form control into view and focuses it,
 * which is the fastest way to act on a NEEDS YOU item. The drawer is a to-do
 * list for the form, so every row should take you to the thing it is about.
 */
export function ResultRow({ result, onReveal }: { result: FillResult; onReveal?: () => void }) {
  const detail = result.status === "filled" ? result.value : result.reason

  const body = (
    <>
      <StatusMark status={result.status} />
      <span className="ditto-row-label">
        {result.label || "Unlabelled field"}
        {detail && <span className="ditto-row-detail">{detail}</span>}
      </span>
    </>
  )

  if (!onReveal) {
    return <div className="ditto-row">{body}</div>
  }

  return (
    <button type="button" className="ditto-row ditto-row--action" onClick={onReveal}>
      {body}
    </button>
  )
}

export function ResultGroup({
  title,
  results,
  onReveal
}: {
  title: string
  results: FillResult[]
  onReveal?: (result: FillResult) => void
}) {
  if (results.length === 0) return null

  return (
    <div>
      <div className="ditto-group-title">
        {title} <span>({results.length})</span>
      </div>
      <div className="ditto-rows">
        {results.map((result) => (
          <ResultRow
            key={result.fieldId}
            result={result}
            onReveal={onReveal ? () => onReveal(result) : undefined}
          />
        ))}
      </div>
    </div>
  )
}
