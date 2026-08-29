import { emptyWork } from "~profile/schema"
import { Card, Checkbox, Empty, MonthInput, TextArea, TextInput } from "~ui/components"
import { removeById, replaceById, type SectionProps } from "../shared"

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
                placeholder="UTHealth Houston"
              />
              <TextInput
                label="Job title"
                required
                value={item.title}
                onChange={(v) => patch(item.id, { title: v })}
                placeholder="Research Intern"
              />
            </div>

            <TextInput
              label="Location"
              value={item.location}
              onChange={(v) => patch(item.id, { location: v })}
              placeholder="Houston, TX"
            />

            <div className="ditto-grid ditto-grid--2">
              <MonthInput
                label="Start date"
                value={item.startDate}
                onChange={(v) => patch(item.id, { startDate: v })}
              />
              <MonthInput
                label="End date"
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

            <TextArea
              label="Summary"
              value={item.summary}
              onChange={(v) => patch(item.id, { summary: v })}
              placeholder="What you built and what it changed."
              hint="Some forms paste this into a description box. Keep it a few lines."
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
