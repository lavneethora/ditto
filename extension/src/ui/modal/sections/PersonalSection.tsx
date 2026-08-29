import { Checkbox, Select, TextInput } from "~ui/components"
import type { SectionProps } from "../shared"

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

  return (
    <>
      <div>
        <h2 className="ditto-section-title">Personal</h2>
        <div className="ditto-subtle">Your legal name here. It has to match your ID.</div>
      </div>

      <div className="ditto-grid ditto-grid--3">
        <TextInput
          label="First name"
          required
          value={p.firstName}
          onChange={(v) => set({ firstName: v })}
        />
        <TextInput
          label="Middle name"
          value={p.middleName}
          onChange={(v) => set({ middleName: v })}
        />
        <TextInput
          label="Last name"
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
            label="Preferred first name"
            value={p.preferredFirstName}
            onChange={(v) => set({ preferredFirstName: v })}
          />
          <TextInput
            label="Preferred middle name"
            value={p.preferredMiddleName}
            onChange={(v) => set({ preferredMiddleName: v })}
          />
          <TextInput
            label="Preferred last name"
            value={p.preferredLastName}
            onChange={(v) => set({ preferredLastName: v })}
          />
        </div>
      )}

      <TextInput
        label="Email address"
        required
        type="email"
        value={p.email}
        onChange={(v) => set({ email: v })}
        placeholder="you@example.com"
      />

      <div className="ditto-grid ditto-grid--3">
        <Select
          label="Phone type"
          value={p.phoneType}
          options={PHONE_TYPES}
          onChange={(v) => set({ phoneType: v })}
        />
        <TextInput
          label="Country code"
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
          placeholder="832-418-0086"
        />
      </div>

      <TextInput
        label="Address line 1"
        value={p.addressLine1}
        onChange={(v) => set({ addressLine1: v })}
      />
      <TextInput
        label="Address line 2"
        value={p.addressLine2}
        onChange={(v) => set({ addressLine2: v })}
        placeholder="Apartment, suite, unit"
      />

      <div className="ditto-grid ditto-grid--3">
        <TextInput label="City" value={p.city} onChange={(v) => set({ city: v })} />
        <TextInput
          label="State"
          value={p.state}
          onChange={(v) => set({ state: v })}
          hint="Full name, not the abbreviation"
        />
        <TextInput
          label="Postal code"
          value={p.postalCode}
          onChange={(v) => set({ postalCode: v })}
        />
      </div>

      <TextInput label="Country" value={p.country} onChange={(v) => set({ country: v })} />
    </>
  )
}
