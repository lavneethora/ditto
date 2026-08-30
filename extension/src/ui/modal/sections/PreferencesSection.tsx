import { Segmented, Select, TextInput, YES_NO } from "~ui/components"
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
  { value: "Handshake", label: "Handshake" },
  { value: "Other", label: "Other" }
] as const

/**
 * Application preferences.
 *
 * Three fields, held to the same test as the Answers section: only questions
 * whose answer is the same on every application. That rules out anything
 * about a specific employer, and it rules out the earliest start date, which
 * lives in Answers as free text because that is how forms ask it. Keeping a
 * date here as well would be two sources of truth for one question.
 */
export function PreferencesSection({ profile, update }: SectionProps) {
  const prefs = profile.preferences
  const set = (patch: Partial<typeof prefs>) => update({ preferences: { ...prefs, ...patch } })

  return (
    <>
      <div>
        <h2 className="ditto-section-title">Preferences</h2>
        <div className="ditto-subtle">
          Optional. The few questions almost every application asks whose answer never changes.
        </div>
      </div>

      <div className="ditto-card">
        {/* One Yes/No covers both form shapes: a dropdown gets the matching
            option, a free-text box gets the word "Yes" or "No". */}
        <Segmented
          label="Are you open to relocation?"
          value={prefs.willingToRelocate}
          options={YES_NO}
          onChange={(v) => set({ willingToRelocate: v })}
        />
      </div>

      <div className="ditto-card">
        <Select
          label="How did you hear about us?"
          value={prefs.howDidYouHear}
          options={HEARD_FROM}
          onChange={(v) => set({ howDidYouHear: v })}
          hint="Required on most Workday forms."
        />
      </div>

      <div className="ditto-card">
        <TextInput
          label="Desired Salary"
          value={prefs.desiredSalary}
          onChange={(v) => set({ desiredSalary: v })}
          placeholder="Negotiable"
          hint="Free text. Some forms accept only digits."
        />
      </div>
    </>
  )
}
