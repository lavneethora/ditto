import { useRef, useState } from "react"

import { describeResume } from "~profile/resume"
import type { Resume } from "~profile/schema"

/**
 * Resume upload, shared by the options page and the drawer.
 *
 * Accepts a drop as well as a click, because the file is going to be attached
 * to a dropzone at the other end and matching that interaction here makes the
 * whole flow feel like one thing.
 */
export function ResumeCard({
  resume,
  error,
  onUpload,
  onRemove
}: {
  resume: Resume | null
  error: string | null
  onUpload: (file: File) => Promise<string | null>
  onRemove: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)

  const accept = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    try {
      await onUpload(file)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ditto-card">
      <div className="ditto-card-head">
        <div className="ditto-card-title">Resume</div>
        {resume && (
          <button type="button" className="ditto-btn ditto-btn--ghost" onClick={onRemove}>
            Remove
          </button>
        )}
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          void accept(e.dataTransfer.files?.[0])
        }}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: 16,
          borderRadius: "var(--ditto-r-panel)",
          border: `1.5px dashed ${dragging ? "var(--ditto-brand)" : "var(--ditto-border-strong)"}`,
          background: dragging ? "var(--ditto-brand-tint)" : "var(--ditto-surface)",
          transition: "background 0.15s ease, border-color 0.15s ease"
        }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis" }}>
            {busy ? "Reading file..." : describeResume(resume)}
          </div>
          <div className="ditto-subtle" style={{ marginTop: 2 }}>
            PDF, DOC or DOCX, up to 5MB. Drop a file here or choose one.
          </div>
        </div>

        <button
          type="button"
          className="ditto-btn ditto-btn--secondary"
          disabled={busy}
          onClick={() => inputRef.current?.click()}>
          {resume ? "Replace" : "Choose file"}
        </button>
      </div>

      {error && (
        <div className="ditto-field-error" style={{ marginTop: 10 }}>
          {error}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.doc,.docx,application/pdf,application/msword"
        style={{ display: "none" }}
        onChange={(e) => {
          void accept(e.target.files?.[0])
          // Reset so re-picking the same file still fires a change event.
          e.target.value = ""
        }}
      />
    </div>
  )
}
