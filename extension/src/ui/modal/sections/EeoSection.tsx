import { TriState } from "~profile/schema"
import { Segmented, Select, YES_NO, YES_NO_DECLINE } from "~ui/components"
import type { SectionProps } from "../shared"

const GENDERS = [
  { value: "", label: "Not answered" },
  { value: "Male", label: "Male" },
  { value: "Female", label: "Female" },
  { value: "Non-binary", label: "Non-binary" },
  { value: "Decline to state", label: "Decline to state" }
] as const

const ORIENTATIONS = [
  { value: "", label: "Not answered" },
  { value: "Heterosexual", label: "Heterosexual" },
  { value: "Gay", label: "Gay" },
  { value: "Lesbian", label: "Lesbian" },
  { value: "Bisexual", label: "Bisexual" },
  { value: "Asexual", label: "Asexual" },
  { value: "Queer", label: "Queer" },
  { value: "Decline to state", label: "Decline to state" }
] as const

const PRONOUNS = [
  { value: "", label: "Not answered" },
  { value: "He/Him", label: "He/Him" },
  { value: "She/Her", label: "She/Her" },
  { value: "They/Them", label: "They/Them" },
  { value: "Decline to state", label: "Decline to state" }
] as const

const RACES = [
  { value: "", label: "Not answered" },
  { value: "American Indian or Alaska Native", label: "American Indian or Alaska Native" },
  { value: "Asian", label: "Asian" },
  { value: "Black or African American", label: "Black or African American" },
  { value: "Hispanic or Latino", label: "Hispanic or Latino" },
  {
    value: "Native Hawaiian or Other Pacific Islander",
    label: "Native Hawaiian or Other Pacific Islander"
  },
  { value: "White", label: "White" },
  { value: "Two or More Races", label: "Two or More Races" },
  { value: "Decline to state", label: "Decline to state" }
] as const

/**
 * Equal employment answers.
 *
 * Work authorization and sponsorship are asked as two separate questions and
 * stored as two independent booleans. They are different facts: someone on OPT
 * is authorized to work today and will still need sponsorship later, so
 * deriving either answer from the other would put a false statement on an
 * application. The matcher handles the inverted phrasings ("can you work
 * without sponsorship?") with an explicit invert flag, which is why the stored
 * value can stay in one canonical direction. See PRD section 5.2.
 *
 * There is no per-question "never fill" opt-out. There used to be, and it was
 * both redundant and wrong. Redundant because leaving a question on "Not
 * answered" already makes Ditto skip it. Wrong because these questions are
 * required on some forms and optional on others, so a standing refusal to
 * answer would silently leave a required field blank and block a submission
 * the user thought was ready.
 *
 * "Decline to state" stays, because that is a real answer that many forms
 * accept, and it is different from not answering at all.
 */
export function EeoSection({ profile, update }: SectionProps) {
  const eeo = profile.eeo
  const set = (patch: Partial<typeof eeo>) => update({ eeo: { ...eeo, ...patch } })

  return (
    <>
      <div>
        <h2 className="ditto-section-title">Equal Employment</h2>
        <div className="ditto-subtle">
          The demographic questions are voluntary. Leave one on "Not answered" and Ditto skips it;
          choose "Decline to state" and it fills that, where the form offers it.
        </div>
      </div>

      <div className="ditto-card">
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <Segmented
            label="Are you authorized to work in the US?"
            required
            value={eeo.authorizedUS}
            options={YES_NO}
            onChange={(v) => set({ authorizedUS: v })}
          />

          <Segmented
            label="Will you now or in the future require sponsorship for an employment visa?"
            required
            value={eeo.requiresSponsorship}
            options={YES_NO}
            onChange={(v) => set({ requiresSponsorship: v })}
          />
        </div>
      </div>

      {/* One card per question. They were briefly merged into a single box
          when the opt-out wrapper was removed, which ran them together and
          made a list of separate voluntary questions read as one blob. */}
      <div className="ditto-card">
        <Segmented
          label="Do you have a disability?"
          value={eeo.disability}
          options={YES_NO_DECLINE}
          onChange={(v) => set({ disability: TriState.parse(v) })}
        />
      </div>

      <div className="ditto-card">
        <Segmented
          label="Are you a veteran?"
          value={eeo.veteran}
          options={YES_NO_DECLINE}
          onChange={(v) => set({ veteran: TriState.parse(v) })}
        />
      </div>

      <div className="ditto-card">
        <Segmented
          label="Are you Hispanic or Latino?"
          value={eeo.hispanicLatino}
          options={YES_NO_DECLINE}
          onChange={(v) => set({ hispanicLatino: TriState.parse(v) })}
        />
      </div>

      <div className="ditto-card">
        <Segmented
          label="Do you identify as LGBTQ+?"
          value={eeo.lgbtq}
          options={YES_NO_DECLINE}
          onChange={(v) => set({ lgbtq: TriState.parse(v) })}
        />
      </div>

      <div className="ditto-card">
        <Select
          label="Gender"
          value={eeo.gender}
          options={GENDERS}
          onChange={(v) => set({ gender: v })}
        />
      </div>

      <div className="ditto-card">
        <Select
          label="Race or Ethnicity"
          value={eeo.race}
          options={RACES}
          onChange={(v) => set({ race: v })}
        />
      </div>

      <div className="ditto-card">
        <Select
          label="Sexual Orientation"
          value={eeo.sexualOrientation}
          options={ORIENTATIONS}
          onChange={(v) => set({ sexualOrientation: v })}
        />
      </div>

      <div className="ditto-card">
        <Select
          label="Pronouns"
          value={eeo.pronouns}
          options={PRONOUNS}
          onChange={(v) => set({ pronouns: v })}
        />
      </div>

    </>
  )
}
