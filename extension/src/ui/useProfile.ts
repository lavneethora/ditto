import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { fileToResume, validateResumeFile } from "~profile/resume"
import type { Profile } from "~profile/schema"
import { clearResume, loadProfile, saveProfile, setResume, watchProfile } from "~profile/store"

/**
 * Owns the edit lifecycle for the profile: load, edit a draft, save, revert.
 *
 * The draft is separate from what is stored, so the Update button can be
 * genuinely disabled until something changed and an accidental edit can be
 * discarded. The resume is the one exception and saves immediately, because
 * picking a file is already an explicit act and holding a multi-megabyte blob
 * in unsaved draft state helps nobody.
 */
export function useProfile() {
  const [saved, setSaved] = useState<Profile | null>(null)
  const [draft, setDraft] = useState<Profile | null>(null)
  const [saving, setSaving] = useState(false)
  const [resumeError, setResumeError] = useState<string | null>(null)

  // Suppresses the storage watcher while this tab is the one writing, so a
  // save does not race an external-change reload back over the user's draft.
  const writingRef = useRef(false)

  useEffect(() => {
    let alive = true

    void loadProfile().then((profile) => {
      if (!alive) return
      setSaved(profile)
      setDraft(profile)
    })

    // Keeps a second surface (drawer and options page open together) in sync.
    const unwatch = watchProfile((profile) => {
      if (!alive || writingRef.current) return
      setSaved(profile)
      setDraft((current) => (current && isDirty(current, profile) ? current : profile))
    })

    return () => {
      alive = false
      unwatch()
    }
  }, [])

  const dirty = useMemo(
    () => (saved && draft ? isDirty(draft, saved) : false),
    [draft, saved]
  )

  const update = useCallback((patch: Partial<Profile>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current))
  }, [])

  const save = useCallback(async () => {
    if (!draft) return

    setSaving(true)
    writingRef.current = true

    try {
      await saveProfile(draft)
      setSaved(draft)
    } finally {
      writingRef.current = false
      setSaving(false)
    }
  }, [draft])

  const revert = useCallback(() => {
    setSaved((current) => {
      setDraft(current)
      return current
    })
  }, [])

  /** Store a picked resume immediately. Returns an error message, or null. */
  const uploadResume = useCallback(async (file: File): Promise<string | null> => {
    const problem = validateResumeFile(file)

    if (problem) {
      setResumeError(problem)
      return problem
    }

    const resume = await fileToResume(file)

    writingRef.current = true
    try {
      await setResume(resume)
    } finally {
      writingRef.current = false
    }

    setResumeError(null)
    setSaved((current) => (current ? { ...current, resume } : current))
    setDraft((current) => (current ? { ...current, resume } : current))
    return null
  }, [])

  const removeResume = useCallback(async () => {
    writingRef.current = true
    try {
      await clearResume()
    } finally {
      writingRef.current = false
    }

    setResumeError(null)
    setSaved((current) => (current ? { ...current, resume: null } : current))
    setDraft((current) => (current ? { ...current, resume: null } : current))
  }, [])

  return {
    profile: draft,
    loading: draft === null,
    dirty,
    saving,
    resumeError,
    update,
    save,
    revert,
    uploadResume,
    removeResume
  }
}

/**
 * Compare everything except the resume.
 *
 * The resume saves on its own path and its base64 body is large enough that
 * including it would make every keystroke run a multi-megabyte string compare.
 */
function isDirty(a: Profile, b: Profile): boolean {
  const { resume: _a, ...restA } = a
  const { resume: _b, ...restB } = b
  return JSON.stringify(restA) !== JSON.stringify(restB)
}
