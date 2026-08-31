import { Segmented, Select, TextInput, YES_NO } from "~ui/components"
import type { SectionProps } from "../shared"

const WORK_STATUS = [
  { value: "", label: "Not answered" },
  { value: "citizen", label: "US citizen" },
  { value: "permanentResident", label: "Permanent resident (Green Card)" },
  { value: "protected", label: "Protected person (refugee or asylee)" },
  { value: "none", label: "None of these" }
] as const

/**
 * Eligibility to work, as facts rather than as answers.
 *
 * Kept apart from Equal Employment on purpose. Those are demographics a person
 * may decline to give and no employer may act on. These are eligibility facts,
 * and a wrong one is a false statement on a legal document.
 *
 * One status covers several questions because forms ask this several ways and
 * they are NOT the same question. "Are you a US citizen?" and "Are you a
 * citizen, permanent resident, or protected person?" have different correct
 * answers, so a stored yes to one cannot answer the other. Ditto reads the
 * status and answers only what it was asked; where the status does not settle
 * the question, the field goes to NEEDS YOU rather than being guessed.
 */
export function EligibilitySection({ profile, update }: SectionProps) {
  const eligibility = profile.eligibility
  const set = (patch: Partial<typeof eligibility>) =>
    update({ eligibility: { ...eligibility, ...patch } })

  return (
    <>
      <div>
        <h2 className="ditto-section-title">Eligibility</h2>
        <div className="ditto-subtle">
          Legal questions almost every application asks. Ditto never guesses at these: anything
          your answer here does not settle is left for you.
        </div>
      </div>

      <div className="ditto-card">
        <Select
          label="Your status in the US"
          value={eligibility.status ?? ""}
          options={WORK_STATUS}
          onChange={(v) => set({ status: v === "" ? null : (v as typeof eligibility.status) })}
          hint="Answers both 'are you a US citizen' and the longer question listing citizens, green card holders and protected persons."
        />
      </div>

      <div className="ditto-card">
        <Segmented
          label="Are you at least 18 years old?"
          value={eligibility.atLeast18}
          options={YES_NO}
          onChange={(v) => set({ atLeast18: v })}
        />
      </div>

      <div className="ditto-card">
        <Segmented
          label="Do you hold permanent resident status outside the US?"
          value={eligibility.residentOutsideUS}
          options={YES_NO}
          onChange={(v) => set({ residentOutsideUS: v })}
        />

        {eligibility.residentOutsideUS === true && (
          <TextInput
            label="Which country?"
            value={eligibility.residentCountry}
            onChange={(v) => set({ residentCountry: v })}
            placeholder="Canada"
          />
        )}
      </div>
    </>
  )
}
