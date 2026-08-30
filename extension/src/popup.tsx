import { useEffect, useState } from "react"

import { describeResume } from "~profile/resume"
import { SECTIONS, SECTION_LABELS, isSectionComplete } from "~profile/schema"
import { Wordmark } from "~ui/Logo"
import { useProfile } from "~ui/useProfile"

import "~ui/styles.css"

/**
 * Toolbar popup. Status only.
 *
 * This deliberately has no way to open the profile editor, because every way
 * of doing that from here is worse than the one that already exists. A tab
 * loses the posting you were reading; a detached window floats over
 * everything. Jobright never leaves the page, and neither does Ditto: the
 * panel docks into the application page and the editor opens as a modal over
 * it.
 *
 * So this is a readiness check and a pointer, nothing more. Chrome insists on
 * putting an icon in the toolbar; that does not make it a place to put the
 * product.
 */

const SUPPORTED = /(myworkdayjobs\.com|greenhouse\.io|lever\.co|ashbyhq\.com)/

function Popup() {
  const { profile, loading } = useProfile()
  const [onSupportedPage, setOnSupportedPage] = useState<boolean | null>(null)

  useEffect(() => {
    void chrome.tabs
      .query({ active: true, currentWindow: true })
      .then(([tab]) => setOnSupportedPage(SUPPORTED.test(tab?.url ?? "")))
      .catch(() => setOnSupportedPage(null))
  }, [])

  const incomplete = profile ? SECTIONS.filter((s) => !isSectionComplete(profile, s)) : []
  const ready = profile !== null && incomplete.length === 0 && profile.resume !== null

  return (
    <div className="ditto-root" style={{ width: 320, padding: 16, background: "var(--ditto-bg)" }}>
      <header style={{ marginBottom: 14 }}>
        <Wordmark size={21} />
      </header>

      {loading || !profile ? (
        <div className="ditto-empty">Loading...</div>
      ) : (
        <>
          <div
            className="ditto-banner"
            style={{
              background: ready ? "var(--ditto-ok-bg)" : "var(--ditto-surface)",
              marginBottom: 12
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
            <div className="ditto-subtle" style={{ marginBottom: 12 }}>
              Still incomplete: {incomplete.map((s) => SECTION_LABELS[s]).join(", ")}
            </div>
          )}

          <div
            className="ditto-banner"
            style={{ background: "var(--ditto-brand-tint)", display: "block" }}>
            <div className="ditto-banner-text" style={{ color: "var(--ditto-text-secondary)" }}>
              {onSupportedPage
                ? "Ditto is open on this page. Use the panel on the right to autofill and to edit your information."
                : "Open a job application on Workday, Greenhouse, Ashby or Lever. Ditto docks into the page, and everything happens there."}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default Popup
