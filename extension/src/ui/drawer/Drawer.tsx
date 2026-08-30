import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { Adapter, FieldSpec, FillReport, FillResult } from "~core/types"
import { analyze, autofill } from "~core/engine"
import { summaryLine } from "~core/report"
import { describeResume } from "~profile/resume"
import { Wordmark } from "~ui/Logo"
import { ProfileModal } from "~ui/modal/ProfileModal"
import { ResumeCard } from "~ui/ResumeCard"
import { useProfile } from "~ui/useProfile"

import { ResultGroup } from "./ResultRow"

/**
 * The injected panel.
 *
 * Deliberately not a clone of Jobright's drawer. Everything that exists to
 * sell an upsell is gone: no match score, no applicant counts, no insider
 * connections, no resume tailoring, no cover letters, and above all no credit
 * counter. What is left is the part that does the work.
 */

type Phase = "idle" | "running" | "done"

export function Drawer({ adapter, doc }: { adapter: Adapter; doc: Document }) {
  const profileState = useProfile()
  const { profile } = profileState

  const [collapsed, setCollapsed] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [phase, setPhase] = useState<Phase>("idle")
  const [report, setReport] = useState<FillReport | null>(null)
  const [live, setLive] = useState<{ done: number; total: number; results: FillResult[] }>({
    done: 0,
    total: 0,
    results: []
  })

  const cancelled = useRef(false)
  const resurveyTimer = useRef(0)

  /** Fields present on the page right now, for the detection line. */
  const [survey, setSurvey] = useState<{ fields: FieldSpec[]; recognized: number }>({
    fields: [],
    recognized: 0
  })

  // Re-survey when the form changes. Multi-step wizards swap the whole form
  // in place without a navigation, so a one-shot scan goes stale immediately.
  useEffect(() => {
    const run = () => setSurvey(analyze(doc, adapter))
    run()

    const observer = new MutationObserver(() => {
      window.clearTimeout(resurveyTimer.current)
      resurveyTimer.current = window.setTimeout(run, 400)
    })

    observer.observe(doc.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [adapter, doc])

  const start = useCallback(async () => {
    if (!profile) return

    cancelled.current = false
    setPhase("running")
    setReport(null)
    setLive({ done: 0, total: survey.fields.length, results: [] })

    const finished = await autofill({
      doc,
      adapter,
      profile,
      shouldCancel: () => cancelled.current,
      onProgress: (done, total, latest) =>
        setLive((current) => ({ done, total, results: [...current.results, latest] }))
    })

    setReport(finished)
    setPhase("done")
  }, [adapter, doc, profile, survey.fields.length])

  const cancel = useCallback(() => {
    cancelled.current = true
  }, [])

  /** Scroll the underlying control into view so a NEEDS YOU row is actionable. */
  const reveal = useCallback(
    (result: FillResult) => {
      const field = survey.fields.find((f) => f.id === result.fieldId)
      const target = field?.el ?? doc.getElementById(result.fieldId)
      if (!target) return

      target.scrollIntoView({ behavior: "smooth", block: "center" })
      ;(target as HTMLElement).focus?.({ preventScroll: true })
    },
    [doc, survey.fields]
  )

  const next = useMemo(() => adapter.nextControl?.(doc) ?? null, [adapter, doc])

  if (collapsed) {
    return (
      <button type="button" className="ditto-tab ditto-root" onClick={() => setCollapsed(false)}>
        <span aria-hidden="true">‹</span> Ditto
      </button>
    )
  }

  const progress = report
    ? { filled: report.requiredFilled, total: report.requiredTotal, percent: report.percent }
    : null

  return (
    <>
      <div className="ditto-drawer ditto-root" data-collapsed="false">
        <header className="ditto-drawer-head">
          <Wordmark size={24} tagline={false} />
          <button
            type="button"
            className="ditto-icon-btn"
            aria-label="Collapse Ditto"
            onClick={() => setCollapsed(true)}>
            ›
          </button>
        </header>

        <div className="ditto-drawer-body">
          <div className="ditto-detect">
            <strong>{adapter.name} detected.</strong>{" "}
            {survey.fields.length} field{survey.fields.length === 1 ? "" : "s"} found,{" "}
            {survey.recognized} Ditto recognises.
          </div>

          {phase === "running" ? (
            <>
              <div>
                <div className="ditto-progress-head">
                  <span>Autofilling</span>
                  <span className="ditto-progress-pct">
                    {live.total ? Math.round((live.done / live.total) * 100) : 0}%
                  </span>
                </div>
                <div className="ditto-bar">
                  <div
                    className="ditto-bar-fill"
                    style={{ width: `${live.total ? (live.done / live.total) * 100 : 0}%` }}
                  />
                </div>
              </div>

              <button type="button" className="ditto-btn ditto-btn--ghost" onClick={cancel}>
                Cancel
              </button>

              <div className="ditto-rows">
                {live.results.slice(-12).map((result) => (
                  <ResultGroup key={result.fieldId} title="" results={[result]} />
                ))}
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                className="ditto-btn ditto-btn--primary ditto-btn--block ditto-btn--lg"
                disabled={!profile || survey.recognized === 0}
                onClick={start}>
                {phase === "done" ? "Autofill again" : "Autofill this page"}
              </button>

              <div className="ditto-safety">
                Ditto never submits. Review everything before you send it.
              </div>
            </>
          )}

          {progress && report && (
            <div>
              <div className="ditto-progress-head">
                <span>{summaryLine(report)}</span>
                <span className="ditto-progress-pct">{progress.percent}%</span>
              </div>
              <div className="ditto-bar">
                <div className="ditto-bar-fill" style={{ width: `${progress.percent}%` }} />
              </div>
            </div>
          )}

          {report && (
            <>
              <ResultGroup title="Needs you" results={[...report.errors, ...report.needsYou]} onReveal={reveal} />
              <ResultGroup title="Filled" results={report.filled} onReveal={reveal} />
              <ResultGroup title="Skipped" results={report.skipped} onReveal={reveal} />
            </>
          )}

          <button type="button" className="ditto-listrow" onClick={() => setShowProfile(true)}>
            <span className="ditto-listrow-main">
              Your autofill information
              <span className="ditto-listrow-sub">
                {profile ? describeResume(profile.resume) : "Loading..."}
              </span>
            </span>
            <span className="ditto-chevron" aria-hidden="true">
              ›
            </span>
          </button>

          {profile && (
            <ResumeCard
              resume={profile.resume}
              error={profileState.resumeError}
              onUpload={profileState.uploadResume}
              onRemove={profileState.removeResume}
            />
          )}
        </div>

        {next && (
          <div className="ditto-drawer-foot">
            <button
              type="button"
              className="ditto-btn ditto-btn--secondary ditto-btn--block"
              onClick={() => (next as HTMLElement).click()}>
              Continue to the next page ▸
            </button>
          </div>
        )}
      </div>

      {showProfile && profile && (
        <div className="ditto-root">
          <ProfileModal
            profile={profile}
            update={profileState.update}
            dirty={profileState.dirty}
            saving={profileState.saving}
            onSave={profileState.save}
            onRevert={profileState.revert}
            onClose={() => setShowProfile(false)}
          />
        </div>
      )}
    </>
  )
}
