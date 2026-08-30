import { COUNTRIES, subdivisionLabel, subdivisionsFor } from "~profile/geo"
import { Checkbox, Select, TextInput } from "~ui/components"
import type { SectionProps } from "../shared"

/**
 * Builds a Select's options, keeping any saved value that is not in the list.
 *
 * Without this, a value typed before the list existed (or one from a country
 * whose subdivisions Ditto does not carry) would render as a blank select and
 * be silently overwritten on the next save. Losing a saved answer without
 * saying so is worse than showing an unusual one.
 */
function withCurrent(
  values: readonly string[],
  current: string,
  placeholder: string
): { value: string; label: string }[] {
  const options = [{ value: "", label: placeholder }]

  if (current && !values.includes(current)) {
    options.push({ value: current, label: `${current} (saved)` })
  }

  return [...options, ...values.map((v) => ({ value: v, label: v }))]
}

const PHONE_TYPES = [
  { value: "mobile" as const, label: "Mobile" },
  { value: "home" as const, label: "Home" },
  { value: "work" as const, label: "Work" }
]

/**
 * Name, contact and address.
 *
 * The preferred-name block is collapsed behind a checkbox because that is how
 * Workday and Greenhouse both present it, and filling a preferred name the
 * user never asked for changes how they are addressed in an interview.
 */
export function PersonalSection({ profile, update }: SectionProps) {
  const p = profile.personal
  const set = (patch: Partial<typeof p>) => update({ personal: { ...p, ...patch } })

  const states = subdivisionsFor(p.country)
  const stateLabel = subdivisionLabel(p.country)

  return (
    <>
      <div>
        <h2 className="ditto-section-title">Personal</h2>
        <div className="ditto-subtle">Your legal name here. It has to match your ID.</div>
      </div>

      <div className="ditto-grid ditto-grid--3">
        <TextInput
          label="First Name"
          required
          value={p.firstName}
          onChange={(v) => set({ firstName: v })}
        />
        <TextInput
          label="Middle Name"
          value={p.middleName}
          onChange={(v) => set({ middleName: v })}
        />
        <TextInput
          label="Last Name"
          required
          value={p.lastName}
          onChange={(v) => set({ lastName: v })}
        />
      </div>

      <Checkbox
        label="I have a preferred name"
        checked={p.hasPreferredName}
        onChange={(v) => set({ hasPreferredName: v })}
      />

      {p.hasPreferredName && (
        <div className="ditto-grid ditto-grid--3">
          <TextInput
            label="Preferred First Name"
            value={p.preferredFirstName}
            onChange={(v) => set({ preferredFirstName: v })}
          />
          <TextInput
            label="Preferred Middle Name"
            value={p.preferredMiddleName}
            onChange={(v) => set({ preferredMiddleName: v })}
          />
          <TextInput
            label="Preferred Last Name"
            value={p.preferredLastName}
            onChange={(v) => set({ preferredLastName: v })}
          />
        </div>
      )}

      <TextInput
        label="Email Address"
        required
        type="email"
        value={p.email}
        onChange={(v) => set({ email: v })}
        placeholder="you@example.com"
      />

      <div className="ditto-grid ditto-grid--3">
        <Select
          label="Phone Type"
          value={p.phoneType}
          options={PHONE_TYPES}
          onChange={(v) => set({ phoneType: v })}
        />
        <TextInput
          label="Country Code"
          value={p.phoneCountryCode}
          onChange={(v) => set({ phoneCountryCode: v })}
          placeholder="+1"
        />
        <TextInput
          label="Phone"
          required
          type="tel"
          value={p.phone}
          onChange={(v) => set({ phone: v })}
          placeholder="(555) 123-4567"
        />
      </div>

      <TextInput
        label="Address Line"
        value={p.addressLine1}
        onChange={(v) => set({ addressLine1: v })}
        placeholder="123 Main Street"
      />
      <TextInput
        label="Address Line 2"
        value={p.addressLine2}
        onChange={(v) => set({ addressLine2: v })}
        placeholder="Apartment, suite, unit"
      />

      <div className="ditto-grid ditto-grid--3">
        <Select
          label="Country"
          value={p.country}
          options={withCurrent(COUNTRIES, p.country, "Select a country")}
          onChange={(country) => {
            // A state from the old country is wrong under the new one, so drop
            // it rather than write "Texas" onto a Canadian address. Only when
            // it is genuinely invalid: switching between two countries that
            // both use free text should not throw the answer away.
            const next = subdivisionsFor(country)
            const stillValid =
              next.length === 0 || next.some((sub) => sub.name === p.state)

            set({ country, state: stillValid ? p.state : "" })
          }}
        />

        {states.length > 0 ? (
          <Select
            label={stateLabel}
            value={p.state}
            options={withCurrent(
              states.map((sub) => sub.name),
              p.state,
              `Select a ${stateLabel.toLowerCase()}`
            )}
            onChange={(v) => set({ state: v })}
          />
        ) : (
          // Most countries have no fixed subdivision list a form would offer,
          // so free text is the honest control there.
          <TextInput
            label={stateLabel}
            value={p.state}
            onChange={(v) => set({ state: v })}
            hint="Full name, not the abbreviation"
          />
        )}

        <TextInput label="City" value={p.city} onChange={(v) => set({ city: v })} />
      </div>

      <div className="ditto-grid ditto-grid--2">
        <TextInput label="County" value={p.county} onChange={(v) => set({ county: v })} />
        <TextInput
          label="Postal Code"
          value={p.postalCode}
          onChange={(v) => set({ postalCode: v })}
        />
      </div>

      {/*
        Links live here rather than in a section of their own. That is where
        Jobright puts them, and it is where a form asks for them: straight
        after the address, as part of how someone is reached.
      */}
      <TextInput
        label="LinkedIn URL"
        value={p.linkedin}
        onChange={(v) => set({ linkedin: v })}
        placeholder="https://linkedin.com/in/yourname"
      />
      <TextInput
        label="GitHub URL"
        value={p.github}
        onChange={(v) => set({ github: v })}
        placeholder="https://github.com/yourname"
      />
      <TextInput
        label="Website URL"
        value={p.website}
        onChange={(v) => set({ website: v })}
        placeholder="https://yoursite.com"
      />
    </>
  )
}
