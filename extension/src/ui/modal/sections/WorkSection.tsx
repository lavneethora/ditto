import { emptyWork } from "~profile/schema"
import { Card, Checkbox, Empty, MonthInput, TextArea, TextInput } from "~ui/components"
import { removeById, replaceById, type SectionProps } from "../shared"

/**
 * Bulleted job description, kept separate from the paragraph summary.
 *
 * The two serve different form shapes: Workday wants prose in one box, while a
 * resume-style textarea wants lines. Deriving one from the other loses
 * information in both directions, so both are stored.
 */
function Bullets({
  values,
  onChange
}: {
  values: string[]
  onChange: (values: string[]) => void
}) {
  return (
    <div className="ditto-field">
      <span className="ditto-label">Job Description</span>

      {values.map((bullet, index) => (
        <div key={index} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <span style={{ paddingTop: 10, color: "var(--ditto-text-muted)" }}>&bull;</span>
          <textarea
            className="ditto-textarea"
            style={{ minHeight: 52 }}
            value={bullet}
            placeholder="What you did and what changed because of it."
            onChange={(e) =>
              onChange(values.map((v, i) => (i === index ? e.target.value : v)))
            }
          />
          <button
            type="button"
            className="ditto-icon-btn"
            aria-label="Remove bullet"
            onClick={() => onChange(values.filter((_, i) => i !== index))}>
            &times;
          </button>
        </div>
      ))}

      <div>
        <button
          type="button"
          className="ditto-btn ditto-btn--ghost"
          onClick={() => onChange([...values, ""])}>
          + Add bullet point
        </button>
      </div>
    </div>
  )
}

/**
 * Work history, repeatable.
 *
 * The end date is disabled rather than hidden when "I currently work here" is
 * checked, so the stored value stays visible. Workday asks for a current role
 * with an empty end date and rejects the row if both are set.
 */
export function WorkSection({ profile, update }: SectionProps) {
  const items = profile.work

  const patch = (id: string, changes: Partial<(typeof items)[number]>) =>
    update({ work: replaceById(items, id, changes) })

  return (
    <>
      <div>
        <h2 className="ditto-section-title">Work Experience</h2>
        <div className="ditto-subtle">Most recent first. Internships count.</div>
      </div>

      {items.length === 0 && <Empty>No work experience added yet.</Empty>}

      {items.map((item, index) => (
        <Card
          key={item.id}
          title={`Work Experience ${index + 1}`}
          action={
            <button
              type="button"
              className="ditto-btn ditto-btn--ghost ditto-btn--danger"
              onClick={() => update({ work: removeById(items, item.id) })}>
              Remove
            </button>
          }>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="ditto-grid ditto-grid--2">
              <TextInput
                label="Company"
                required
                value={item.company}
                onChange={(v) => patch(item.id, { company: v })}
                placeholder="Acme Corporation"
              />
              <TextInput
                label="Job Title"
                required
                value={item.title}
                onChange={(v) => patch(item.id, { title: v })}
                placeholder="Software Engineer Intern"
              />
            </div>

            <TextInput
              label="Location"
              value={item.location}
              onChange={(v) => patch(item.id, { location: v })}
              placeholder="Austin, TX"
            />

            <div className="ditto-grid ditto-grid--2">
              <MonthInput
                label="Start Date"
                value={item.startDate}
                onChange={(v) => patch(item.id, { startDate: v })}
              />
              <MonthInput
                label="End Date"
                value={item.current ? "" : item.endDate}
                disabled={item.current}
                onChange={(v) => patch(item.id, { endDate: v })}
                hint={item.current ? "Left blank while this is your current role" : undefined}
              />
            </div>

            <Checkbox
              label="I currently work here"
              checked={item.current}
              onChange={(v) => patch(item.id, { current: v })}
            />

            {/* Deliberately short. The bullets below are the primary way to
                describe a role; this is the fallback for the minority of forms
                that want one paragraph, so it should not invite an essay. */}
            <TextArea
              label="Experience Summary"
              value={item.summary}
              onChange={(v) => patch(item.id, { summary: v })}
              placeholder="Summarize your experience"
              rows={2}
            />

            <Bullets
              values={item.bullets}
              onChange={(bullets) => patch(item.id, { bullets })}
            />
          </div>
        </Card>
      ))}

      <div>
        <button
          type="button"
          className="ditto-btn ditto-btn--secondary"
          onClick={() => update({ work: [...items, emptyWork()] })}>
          + Add work experience
        </button>
      </div>
    </>
  )
}
