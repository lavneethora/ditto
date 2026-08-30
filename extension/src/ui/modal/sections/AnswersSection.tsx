import { newId } from "~profile/schema"
import { TextArea } from "~ui/components"
import type { SectionProps } from "../shared"

/**
 * The reusable open-text questions.
 *
 * Fixed, not user-defined, and that is the point. A saved answer is only worth
 * saving if it is the same on every application, which rules out anything
 * about a specific employer: "Why this company?" has a different answer every
 * time, so storing one guarantees sending the wrong one.
 *
 * What survives that filter is logistics. Start date, timeline constraints and
 * a general note are true regardless of who is asking, so they are worth
 * writing once.
 *
 * The `id` is stable and the `label` is phrased the way forms phrase it,
 * because core/resolve.ts matches a saved answer to a question by word overlap
 * between the two.
 */
export const ANSWER_PROMPTS = [
  {
    id: "earliest-start",
    label: "When is the earliest you would want to start working with us?",
    placeholder: "June 2027, after I graduate.",
    hint: "Asked as free text far more often than as a date picker."
  },
  {
    id: "timeline",
    label: "Do you have any deadlines or timeline considerations we should be aware of?",
    placeholder: "I have an offer deadline of 15 March.",
    hint: "Leave blank if none. Ditto skips an empty answer rather than writing 'N/A'."
  },
  {
    id: "additional-info",
    label: "Additional Information",
    placeholder: "Anything else worth knowing.",
    hint: "Matches the catch-all box at the end of most applications."
  }
] as const

/**
 * Saved answers.
 *
 * This is the deliberate alternative to generating answers. Ditto fills a
 * matching saved answer and puts every other open-text question under NEEDS
 * YOU, where the user writes it themselves.
 *
 * The reason is not technical. An answer submitted under someone's name is
 * their statement to an employer, and a plausible paragraph they never read is
 * a bad thing to have signed.
 */
export function AnswersSection({ profile, update }: SectionProps) {
  const bodyFor = (label: string) =>
    profile.answers.find((a) => a.label === label)?.body ?? ""

  const setAnswer = (label: string, body: string) => {
    const existing = profile.answers.find((a) => a.label === label)

    const answers = existing
      ? profile.answers.map((a) => (a.label === label ? { ...a, body } : a))
      : [...profile.answers, { id: newId(), label, body }]

    update({ answers })
  }

  const answered = ANSWER_PROMPTS.filter((p) => bodyFor(p.label).trim()).length

  return (
    <>
      <div>
        <h2 className="ditto-section-title">Answers</h2>
        <div className="ditto-subtle">
          Optional. These are the open questions whose answer is the same on every application, so
          they are worth writing once. Anything left blank is skipped, never guessed.
        </div>
      </div>

      {ANSWER_PROMPTS.map((prompt) => (
        <div className="ditto-card" key={prompt.id}>
          <TextArea
            label={prompt.label}
            value={bodyFor(prompt.label)}
            onChange={(v) => setAnswer(prompt.label, v)}
            placeholder={prompt.placeholder}
            hint={prompt.hint}
            rows={3}
          />
        </div>
      ))}

      <div className="ditto-subtle">
        {answered} of {ANSWER_PROMPTS.length} answered. Questions specific to one employer, like
        "Why this company?", stay under NEEDS YOU on the form itself: a stored answer to those
        would be the wrong answer everywhere except where it was written.
      </div>
    </>
  )
}
