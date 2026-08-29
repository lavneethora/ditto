import { describeResume } from "~profile/resume"
import { SECTIONS, SECTION_LABELS, isSectionComplete } from "~profile/schema"
import { Wordmark } from "~ui/Logo"
import { useProfile } from "~ui/useProfile"

import "~ui/styles.css"

/**
 * Toolbar popup.
 *
 * Deliberately thin: a readiness summary and a way into the full editor. The
 * real surface is the drawer on the application page, and duplicating the
 * profile form into a 360px popup would just create a second place for it to
 * rot.
 */
function Popup() {
  const { profile, loading } = useProfile()

  const incomplete = profile ? SECTIONS.filter((s) => !isSectionComplete(profile, s)) : []
  const ready = profile !== null && incomplete.length === 0 && profile.resume !== null

  return (
    <div className="ditto-root" style={{ width: 340, padding: 18, background: "var(--ditto-bg)" }}>
      <header style={{ marginBottom: 14 }}>
        <Wordmark size={26} />
      </header>

      {loading || !profile ? (
        <div className="ditto-empty">Loading...</div>
      ) : (
        <>
          <div
            className="ditto-banner"
            style={{
              background: ready ? "var(--ditto-ok-bg)" : "var(--ditto-surface)",
              marginBottom: 14
            }}>
            <div className="ditto-banner-body">
              <div className="ditto-banner-title">
                {ready ? "Ready to autofill" : "Profile needs a bit more"}
              </div>
              <div className="ditto-banner-text">
                {profile.resume ? describeResume(profile.resume) : "No resume uploaded yet."}
              </div>
            </div>
          </div>

          {incomplete.length > 0 && (
            <div className="ditto-subtle" style={{ marginBottom: 14 }}>
              Still incomplete: {incomplete.map((s) => SECTION_LABELS[s]).join(", ")}
            </div>
          )}

          <button
            type="button"
            className="ditto-btn ditto-btn--primary ditto-btn--block"
            onClick={() => chrome.runtime.openOptionsPage()}>
            Your autofill information
          </button>

          <p className="ditto-subtle" style={{ marginTop: 14, marginBottom: 0 }}>
            Open a job application on Workday, Greenhouse, Ashby or Lever and Ditto appears on the
            page.
          </p>
        </>
      )}
    </div>
  )
}

export default Popup
