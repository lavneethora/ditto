import { emptyAnswer, newId } from "~profile/schema"
import { Card, Empty, TextArea, TextInput } from "~ui/components"
import { removeById, replaceById, type SectionProps } from "../shared"

/** Starter labels for the open-text questions that recur across applications. */
const SUGGESTED = [
  "Why this company",
  "Why this role",
  "Additional information",
  "Notice period",
  "Salary expectations"
]

/**
 * Saved answers for open-text questions.
 *
 * This is the deliberate alternative to generating answers. Ditto fills the
 * closest matching snippet and puts every unmatched open-text question under
 * NEEDS YOU.
 *
 * The reason is not technical. An answer submitted under the user's name is
 * the user's statement to an employer, and a plausible-sounding paragraph
 * they never read is a bad thing to have signed. Writing it once and reusing
 * it keeps the words theirs.
 */
export function AnswersSection({ profile, update }: SectionProps) {
  const items = profile.answers

  const patch = (id: string, changes: Partial<(typeof items)[number]>) =>
    update({ answers: replaceById(items, id, changes) })

  const usedLabels = new Set(items.map((a) => a.label.toLowerCase()))
  const unused = SUGGESTED.filter((label) => !usedLabels.has(label.toLowerCase()))

  return (
    <>
      <div>
        <h2 className="ditto-section-title">Answers</h2>
        <div className="ditto-subtle">
          Write these once and Ditto reuses them. Questions with no matching answer are listed
          under NEEDS YOU instead of being guessed.
        </div>
      </div>

      {items.length === 0 && <Empty>No saved answers yet.</Empty>}

      {items.map((item) => (
        <Card
          key={item.id}
          action={
            <button
              type="button"
              className="ditto-btn ditto-btn--ghost ditto-btn--danger"
              onClick={() => update({ answers: removeById(items, item.id) })}>
              Remove
            </button>
          }>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <TextInput
              label="Question"
              value={item.label}
              onChange={(v) => patch(item.id, { label: v })}
              placeholder="Why this company"
              hint="Ditto matches this against the wording on the form, so keep it plain."
            />
            <TextArea
              label="Your answer"
              value={item.body}
              onChange={(v) => patch(item.id, { body: v })}
              rows={5}
              placeholder="Write it the way you would say it."
            />
          </div>
        </Card>
      ))}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <button
          type="button"
          className="ditto-btn ditto-btn--secondary"
          onClick={() => update({ answers: [...items, emptyAnswer()] })}>
          + Add answer
        </button>

        {unused.map((label) => (
          <button
            key={label}
            type="button"
            className="ditto-btn ditto-btn--ghost"
            onClick={() =>
              update({ answers: [...items, { id: newId(), label, body: "" }] })
            }>
            + {label}
          </button>
        ))}
      </div>
    </>
  )
}
