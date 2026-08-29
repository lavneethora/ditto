import { Chips, TextInput } from "~ui/components"
import type { SectionProps } from "../shared"

/**
 * Profile links.
 *
 * This replaces Jobright's "Sign-up Information" section, which only exists
 * because Jobright has accounts. Ditto has none, but LinkedIn and GitHub are
 * asked for on nearly every application, so the slot is worth keeping.
 */
export function LinksSection({ profile, update }: SectionProps) {
  const links = profile.links
  const set = (patch: Partial<typeof links>) => update({ links: { ...links, ...patch } })

  return (
    <>
      <div>
        <h2 className="ditto-section-title">Links</h2>
        <div className="ditto-subtle">
          Paste full URLs. Some forms validate the scheme and reject a bare domain.
        </div>
      </div>

      <TextInput
        label="LinkedIn"
        value={links.linkedin}
        onChange={(v) => set({ linkedin: v })}
        placeholder="https://linkedin.com/in/yourname"
      />
      <TextInput
        label="GitHub"
        value={links.github}
        onChange={(v) => set({ github: v })}
        placeholder="https://github.com/yourname"
      />
      <TextInput
        label="Portfolio or website"
        value={links.portfolio}
        onChange={(v) => set({ portfolio: v })}
        placeholder="https://yoursite.com"
      />

      <Chips
        label="Other links"
        values={links.other}
        onChange={(v) => set({ other: v })}
        placeholder="Add a link and press Enter"
        hint="Used when a form asks for a second or third URL."
      />
    </>
  )
}
