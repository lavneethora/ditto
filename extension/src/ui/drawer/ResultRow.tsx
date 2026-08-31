import { PROFILE_KEYS, keyLabel } from "~core/types"
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
/**
 * Teach Ditto what this question means.
 *
 * Offered on a row Ditto could not answer, and only there. The packaged rules
 * recognise a wording; forms mean the same thing and spell it however they
 * like, and no table of phrasings ever finishes. This is the user answering
 * that once, for good.
 *
 * A `select` rather than anything cleverer because it has to work inside a
 * shadow root on a page whose CSS is hostile, and because a list of the
 * profile's own fields is the entire vocabulary.
 */
function TeachControl({ onTeach }: { onTeach: (key: string) => void }) {
  return (
    <select
      className="ditto-teach"
      defaultValue=""
      aria-label="Always answer this question with"
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => {
        if (event.target.value) onTeach(event.target.value)
      }}>
      <option value="">Always use…</option>
      {PROFILE_KEYS.filter((key) => key !== "forms.acceptTerms").map((key) => (
        <option key={key} value={key}>
          {keyLabel(key)}
        </option>
      ))}
    </select>
  )
}

export function ResultRow({
  result,
  onReveal,
  onTeach
}: {
  result: FillResult
  onReveal?: () => void
  onTeach?: (key: string) => void
}) {
  // A filled row can still have something to say: a multi-select adds what it
  // can find, and which values it could not is worth knowing.
  const detail =
    result.status === "filled"
      ? [result.value, result.reason].filter(Boolean).join(" — ")
      : result.reason

  // Nothing to teach about a field that was filled, or one with no question
  // to key a mapping on.
  const teachable = onTeach && result.status !== "filled" && Boolean(result.label)

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
    return (
      <div className="ditto-row">
        {body}
        {teachable && <TeachControl onTeach={onTeach} />}
      </div>
    )
  }

  return (
    <div className="ditto-row ditto-row--teachable">
      <button type="button" className="ditto-row-main" onClick={onReveal}>
        {body}
      </button>
      {teachable && <TeachControl onTeach={onTeach} />}
    </div>
  )
}

export function ResultGroup({
  title,
  results,
  onReveal,
  onTeach
}: {
  title: string
  results: FillResult[]
  onReveal?: (result: FillResult) => void
  onTeach?: (result: FillResult, key: string) => void
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
            onTeach={onTeach ? (key) => onTeach(result, key) : undefined}
          />
        ))}
      </div>
    </div>
  )
}
