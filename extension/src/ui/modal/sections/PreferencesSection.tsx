import { Chips, Field, Segmented, Select, TextInput, YES_NO } from "~ui/components"
import type { SectionProps } from "../shared"

const HEARD_FROM = [
  { value: "", label: "Not answered" },
  { value: "LinkedIn", label: "LinkedIn" },
  { value: "Indeed", label: "Indeed" },
  { value: "Company Website", label: "Company Website" },
  { value: "Job Board", label: "Job Board" },
  { value: "Referral", label: "Referral" },
  { value: "Career Fair", label: "Career Fair" },
  { value: "University", label: "University" },
  { value: "Other", label: "Other" }
] as const

/**
 * Application preferences.
 *
 * "How did you hear about us?" earns a spot here because it is required on
 * most Workday forms and is a searchable dropdown rather than a text box,
 * which makes it one of the more common reasons a fill stalls partway.
 */
export function PreferencesSection({ profile, update }: SectionProps) {
  const prefs = profile.preferences
  const set = (patch: Partial<typeof prefs>) => update({ preferences: { ...prefs, ...patch } })

  return (
    <>
      <div>
        <h2 className="ditto-section-title">Preferences</h2>
        <div className="ditto-subtle">Answers to the questions almost every form asks.</div>
      </div>

      <Select
        label="How did you hear about us?"
        value={prefs.howDidYouHear}
        options={HEARD_FROM}
        onChange={(v) => set({ howDidYouHear: v })}
        hint="Required on most Workday forms."
      />

      <div className="ditto-grid ditto-grid--2">
        <TextInput
          label="Desired salary"
          value={prefs.desiredSalary}
          onChange={(v) => set({ desiredSalary: v })}
          placeholder="Negotiable"
          hint="Free text. Some forms only accept digits."
        />

        <Field label="Earliest start date">
          <input
            className="ditto-input"
            type="date"
            value={prefs.earliestStartDate}
            onChange={(e) => set({ earliestStartDate: e.target.value })}
          />
        </Field>
      </div>

      <Segmented
        label="Are you willing to relocate?"
        value={prefs.willingToRelocate}
        options={YES_NO}
        onChange={(v) => set({ willingToRelocate: v })}
      />

      <Chips
        label="Preferred locations"
        values={prefs.locations}
        onChange={(v) => set({ locations: v })}
        placeholder="Austin, TX"
        hint="Used when a form asks where you want to work."
      />
    </>
  )
}
