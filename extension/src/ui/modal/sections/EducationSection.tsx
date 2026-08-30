import { emptyEducation } from "~profile/schema"
import { Card, Checkbox, Empty, MonthInput, TextInput } from "~ui/components"
import { removeById, replaceById, type SectionProps } from "../shared"

/**
 * Education history, repeatable.
 *
 * Degree and major are stored separately even though Jobright merges them
 * into one "Accreditation" field. Workday asks for them as two distinct
 * dropdowns, and splitting a merged string back apart reliably is not
 * possible: "Bachelor of Science, Computer Science" and "Bachelor of Science
 * in Computer Science and Mathematics" do not share a delimiter rule.
 */
export function EducationSection({ profile, update }: SectionProps) {
  const items = profile.education

  const patch = (id: string, changes: Partial<(typeof items)[number]>) =>
    update({ education: replaceById(items, id, changes) })

  return (
    <>
      <div>
        <h2 className="ditto-section-title">Education</h2>
        <div className="ditto-subtle">Most recent first. Forms usually ask for only one.</div>
      </div>

      {items.length === 0 && <Empty>No education added yet.</Empty>}

      {items.map((item, index) => (
        <Card
          key={item.id}
          title={`Education ${index + 1}`}
          action={
            <button
              type="button"
              className="ditto-btn ditto-btn--ghost ditto-btn--danger"
              onClick={() => update({ education: removeById(items, item.id) })}>
              Remove
            </button>
          }>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <TextInput
              label="School"
              required
              value={item.school}
              onChange={(v) => patch(item.id, { school: v })}
              placeholder="State University"
            />

            <div className="ditto-grid ditto-grid--3">
              <TextInput
                label="Degree"
                required
                value={item.degree}
                onChange={(v) => patch(item.id, { degree: v })}
                placeholder="Bachelor of Science"
              />
              <TextInput
                label="Major"
                value={item.major}
                onChange={(v) => patch(item.id, { major: v })}
                placeholder="Computer Science"
              />
              <TextInput
                label="GPA"
                value={item.gpa}
                onChange={(v) => patch(item.id, { gpa: v })}
                placeholder="3.80"
              />
            </div>

            <div className="ditto-grid ditto-grid--2">
              <MonthInput
                label="Start Date"
                value={item.startDate}
                onChange={(v) => patch(item.id, { startDate: v })}
              />
              <MonthInput
                label={item.current ? "Expected Graduation" : "End Date"}
                value={item.endDate}
                onChange={(v) => patch(item.id, { endDate: v })}
              />
            </div>

            <Checkbox
              label="I currently study here"
              checked={item.current}
              onChange={(v) => patch(item.id, { current: v })}
            />
          </div>
        </Card>
      ))}

      <div>
        <button
          type="button"
          className="ditto-btn ditto-btn--secondary"
          onClick={() => update({ education: [...items, emptyEducation()] })}>
          + Add education
        </button>
      </div>
    </>
  )
}
