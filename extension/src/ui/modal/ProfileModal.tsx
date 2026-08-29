import { useState, type ComponentType } from "react"

import {
  SECTIONS,
  SECTION_LABELS,
  isSectionComplete,
  type Profile,
  type SectionId
} from "~profile/schema"
import { Toggle } from "~ui/components"

import { AnswersSection } from "./sections/AnswersSection"
import { EducationSection } from "./sections/EducationSection"
import { EeoSection } from "./sections/EeoSection"
import { LinksSection } from "./sections/LinksSection"
import { PersonalSection } from "./sections/PersonalSection"
import { PreferencesSection } from "./sections/PreferencesSection"
import { SkillsSection } from "./sections/SkillsSection"
import { WorkSection } from "./sections/WorkSection"
import type { SectionProps } from "./shared"

const PANES: Record<SectionId, ComponentType<SectionProps>> = {
  personal: PersonalSection,
  links: LinksSection,
  education: EducationSection,
  work: WorkSection,
  skills: SkillsSection,
  eeo: EeoSection,
  preferences: PreferencesSection,
  answers: AnswersSection
}

/**
 * "Your Autofill Information".
 *
 * Renders either as a centered modal over the page (from the drawer) or as an
 * inline panel (on the options page), which is the `inline` prop. The section
 * nav marks anything incomplete with a dot, so the gaps that will show up as
 * NEEDS YOU during a fill are visible before the fill rather than after.
 */
export function ProfileModal({
  profile,
  update,
  dirty,
  saving,
  onSave,
  onRevert,
  onClose,
  inline = false
}: {
  profile: Profile
  update: (patch: Partial<Profile>) => void
  dirty: boolean
  saving: boolean
  onSave: () => void
  onRevert: () => void
  onClose?: () => void
  inline?: boolean
}) {
  const [active, setActive] = useState<SectionId>("personal")
  const Pane = PANES[active]

  const incomplete = SECTIONS.filter((section) => !isSectionComplete(profile, section))

  const panel = (
    <div className={`ditto-modal${inline ? " ditto-modal--inline" : ""}`}>
      <div className="ditto-modal-head">
        <h1 className="ditto-title">Your Autofill information</h1>
        {onClose && (
          <button type="button" className="ditto-icon-btn" aria-label="Close" onClick={onClose}>
            &times;
          </button>
        )}
      </div>

      <div className="ditto-banner ditto-modal-notice">
        <div className="ditto-banner-body">
          <div className="ditto-banner-title">Learn from corrections</div>
          <div className="ditto-banner-text">
            When you fix a value directly in an application form, Ditto saves the correction back
            here so it is right the next time.
          </div>
        </div>
        <Toggle
          label="Learn from corrections"
          checked={profile.settings.learnFromCorrections}
          onChange={(v) =>
            update({ settings: { ...profile.settings, learnFromCorrections: v } })
          }
        />
      </div>

      <div className="ditto-modal-body">
        <nav className="ditto-modal-nav" aria-label="Profile sections">
          {SECTIONS.map((section) => (
            <button
              key={section}
              type="button"
              className="ditto-nav-item"
              aria-current={section === active}
              onClick={() => setActive(section)}>
              {SECTION_LABELS[section]}
              {!isSectionComplete(profile, section) && (
                <span
                  className="ditto-dot"
                  role="img"
                  aria-label="Incomplete"
                  title="Still needs information"
                />
              )}
            </button>
          ))}
        </nav>

        <div className="ditto-modal-pane">
          <Pane profile={profile} update={update} />
        </div>
      </div>

      <div className="ditto-modal-foot">
        <div className="ditto-subtle">
          {incomplete.length === 0
            ? "Every section has what Ditto needs."
            : `${incomplete.length} section${incomplete.length === 1 ? "" : "s"} still incomplete: ${incomplete
                .map((s) => SECTION_LABELS[s])
                .join(", ")}`}
        </div>

        <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
          {dirty && (
            <button type="button" className="ditto-btn ditto-btn--ghost" onClick={onRevert}>
              Discard changes
            </button>
          )}
          <button
            type="button"
            className="ditto-btn ditto-btn--primary"
            disabled={!dirty || saving}
            onClick={onSave}>
            {saving ? "Saving..." : dirty ? "Update" : "Saved"}
          </button>
        </div>
      </div>
    </div>
  )

  if (inline) return panel

  return (
    <div
      className="ditto-modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}>
      {panel}
    </div>
  )
}
