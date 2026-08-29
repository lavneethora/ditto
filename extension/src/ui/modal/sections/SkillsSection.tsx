import { Chips } from "~ui/components"
import type { SectionProps } from "../shared"

/**
 * Skills.
 *
 * Stored as a flat ordered list because that is how every target ATS consumes
 * them: Workday has a "Type to Add Skills" multiselect that matches against
 * its own taxonomy, and the others take free text. Order matters, since a
 * form that caps the list keeps the first N.
 */
export function SkillsSection({ profile, update }: SectionProps) {
  return (
    <>
      <div>
        <h2 className="ditto-section-title">Skills</h2>
        <div className="ditto-subtle">
          Put the ones you want matched first. Forms that cap the list keep the earliest entries.
        </div>
      </div>

      <Chips
        label="Skills"
        values={profile.skills}
        onChange={(skills) => update({ skills })}
        placeholder="Python, PyTorch, React"
        hint="Enter or comma to add. Backspace on an empty box removes the last one."
      />

      <div className="ditto-subtle">
        {profile.skills.length} skill{profile.skills.length === 1 ? "" : "s"} saved.
      </div>
    </>
  )
}
