import { keyLabel } from "~core/types"
import { Empty } from "~ui/components"

import { removeById, type SectionProps } from "../shared"

/**
 * Questions the user has told Ditto the meaning of.
 *
 * The packaged rules recognise a wording, and forms mean the same thing while
 * spelling it however they like. No table of phrasings ever finishes, and no
 * table anticipates the question only one company asks. So the user answers
 * that once, from the drawer, and it is recorded here.
 *
 * This list exists mainly so a mapping can be removed. Teaching without
 * unteaching is a trap: one mistaken pick would put the wrong answer on every
 * later application, silently, with no way to find out where it came from.
 *
 * Read-only apart from that. A mapping is created by correcting a real form,
 * where the question is in front of you, rather than typed from memory here.
 */
export function LearnedSection({ profile, update }: SectionProps) {
  const learned = [...profile.learned].sort((a, b) => b.createdAt - a.createdAt)

  return (
    <>
      <div>
        <h2 className="ditto-section-title">Learned Questions</h2>
        <div className="ditto-subtle">
          When Ditto does not recognise a question, pick a field for it in the drawer and it will
          answer that question everywhere from then on.
        </div>
      </div>

      {learned.length === 0 ? (
        <Empty>
          Nothing learned yet. After a fill, any row under Needs You has an "Always use…" picker.
        </Empty>
      ) : (
        learned.map((entry) => (
          <div className="ditto-card" key={entry.id}>
            <div className="ditto-learned">
              <div className="ditto-learned-main">
                <div className="ditto-learned-question">{entry.label}</div>
                <div className="ditto-subtle">
                  Answered with {keyLabel(entry.key)}
                  {entry.site && ` · taught on ${entry.site}`}
                </div>
              </div>

              <button
                type="button"
                className="ditto-btn ditto-btn--ghost"
                onClick={() => update({ learned: removeById(profile.learned, entry.id) })}>
                Forget
              </button>
            </div>
          </div>
        ))
      )}
    </>
  )
}
