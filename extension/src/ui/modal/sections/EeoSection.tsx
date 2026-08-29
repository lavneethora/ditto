import type { ReactNode } from "react"

import { TriState } from "~profile/schema"
import { Checkbox, Segmented, Select, YES_NO, YES_NO_DECLINE } from "~ui/components"
import type { SectionProps } from "../shared"

const GENDERS = [
  { value: "", label: "Not answered" },
  { value: "Male", label: "Male" },
  { value: "Female", label: "Female" },
  { value: "Non-binary", label: "Non-binary" },
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
 * Two things here are load-bearing rather than presentational.
 *
 * First, work authorization and sponsorship are asked as two separate
 * questions and stored as two independent booleans. They are different facts.
 * Someone on OPT is authorized to work today and will still need sponsorship
 * later, so deriving either answer from the other would put a false statement
 * on an application. The matcher handles the inverted phrasings ("can you
 * work without sponsorship?") with an explicit invert flag, which is why the
 * stored value can stay in one canonical direction. See PRD section 5.2.
 *
 * Second, every demographic question carries its own "never fill" opt-out.
 * These are voluntary by law, and a blank is a legitimate answer. Anything
 * opted out of is reported as SKIPPED during a fill, never guessed and never
 * quietly defaulted to "decline".
 */
export function EeoSection({ profile, update }: SectionProps) {
  const eeo = profile.eeo
  const set = (patch: Partial<typeof eeo>) => update({ eeo: { ...eeo, ...patch } })

  const isOptedOut = (key: string) => eeo.neverFill.includes(key)

  const toggleOptOut = (key: string, optOut: boolean) =>
    set({
      neverFill: optOut ? [...eeo.neverFill, key] : eeo.neverFill.filter((k) => k !== key)
    })

  return (
    <>
      <div>
        <h2 className="ditto-section-title">Equal Employment</h2>
        <div className="ditto-subtle">
          The demographic questions are voluntary. Anything you opt out of is left blank and
          reported as skipped.
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
            hint="Kept separate from the question above on purpose. Both can be yes."
          />
        </div>
      </div>

      <DemographicQuestion
        label="Do you have a disability?"
        optKey="disability"
        optedOut={isOptedOut("disability")}
        onOptOut={toggleOptOut}>
        <Segmented
          label="Do you have a disability?"
          value={eeo.disability}
          options={YES_NO_DECLINE}
          onChange={(v) => set({ disability: TriState.parse(v) })}
        />
      </DemographicQuestion>

      <DemographicQuestion
        label="Are you a veteran?"
        optKey="veteran"
        optedOut={isOptedOut("veteran")}
        onOptOut={toggleOptOut}>
        <Segmented
          label="Are you a veteran?"
          value={eeo.veteran}
          options={YES_NO_DECLINE}
          onChange={(v) => set({ veteran: TriState.parse(v) })}
        />
      </DemographicQuestion>

      <DemographicQuestion
        label="Gender"
        optKey="gender"
        optedOut={isOptedOut("gender")}
        onOptOut={toggleOptOut}>
        <Select
          label="Gender"
          value={eeo.gender}
          options={GENDERS}
          onChange={(v) => set({ gender: v })}
        />
      </DemographicQuestion>

      <DemographicQuestion
        label="Race or ethnicity"
        optKey="race"
        optedOut={isOptedOut("race")}
        onOptOut={toggleOptOut}>
        <Select label="Race or ethnicity" value={eeo.race} options={RACES} onChange={(v) => set({ race: v })} />
      </DemographicQuestion>

      <DemographicQuestion
        label="Are you Hispanic or Latino?"
        optKey="hispanicLatino"
        optedOut={isOptedOut("hispanicLatino")}
        onOptOut={toggleOptOut}>
        <Segmented
          label="Are you Hispanic or Latino?"
          value={eeo.hispanicLatino}
          options={YES_NO_DECLINE}
          onChange={(v) => set({ hispanicLatino: TriState.parse(v) })}
        />
      </DemographicQuestion>
    </>
  )
}

/**
 * Wraps one voluntary question with its opt-out. When opted out the input is
 * removed rather than disabled, so there is no half-live control implying the
 * value might still be sent.
 */
function DemographicQuestion({
  label,
  optKey,
  optedOut,
  onOptOut,
  children
}: {
  label: string
  optKey: string
  optedOut: boolean
  onOptOut: (key: string, optOut: boolean) => void
  children: ReactNode
}) {
  return (
    <div className="ditto-card">
      {optedOut ? (
        <div className="ditto-subtle" style={{ marginBottom: 12 }}>
          <strong style={{ color: "var(--ditto-text)" }}>{label}</strong>
          <div style={{ marginTop: 4 }}>Ditto will leave this blank and report it as skipped.</div>
        </div>
      ) : (
        <div style={{ marginBottom: 12 }}>{children}</div>
      )}

      <Checkbox
        label="Never fill this"
        checked={optedOut}
        onChange={(v) => onOptOut(optKey, v)}
      />
    </div>
  )
}
