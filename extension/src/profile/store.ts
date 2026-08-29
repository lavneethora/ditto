import { Storage } from "@plasmohq/storage"

import {
  ProfileSchema,
  ResumeSchema,
  emptyProfile,
  type Profile,
  type Resume
} from "./schema"

/**
 * Persistence for the profile. chrome.storage.local only: nothing here ever
 * touches the network, which is what makes "unlimited" a property of the
 * architecture rather than a pricing promise. See PRD section 1.
 *
 * The resume lives under its own key. It is base64 and routinely 100x larger
 * than the rest of the profile combined, and chrome.storage rewrites a whole
 * value on every set. Splitting keeps an edit to a phone number from
 * rewriting a 400KB blob.
 */

const PROFILE_KEY = "ditto:profile:v1"
const RESUME_KEY = "ditto:resume:v1"

const storage = new Storage({ area: "local" })

/**
 * Read the profile, composing the two storage keys back together.
 *
 * Anything unparseable or absent falls back to defaults rather than throwing.
 * A corrupted key should cost the user one section, not lock them out of the
 * extension entirely.
 */
export async function loadProfile(): Promise<Profile> {
  const [rawProfile, rawResume] = await Promise.all([
    storage.get<unknown>(PROFILE_KEY),
    storage.get<unknown>(RESUME_KEY)
  ])

  const parsed = ProfileSchema.safeParse(rawProfile ?? {})
  const profile = parsed.success ? parsed.data : emptyProfile()

  if (!parsed.success) {
    console.warn("[ditto] stored profile failed validation, using defaults", parsed.error.issues)
  }

  const resume = ResumeSchema.safeParse(rawResume)
  profile.resume = resume.success ? resume.data : null

  return profile
}

/**
 * Write the profile. The resume is written only when it actually changed,
 * compared on `updatedAt` since the base64 body can be megabytes.
 */
export async function saveProfile(profile: Profile): Promise<void> {
  const validated = ProfileSchema.parse(profile)
  const { resume, ...rest } = validated

  const existing = await storage.get<Resume | undefined>(RESUME_KEY)
  const resumeChanged = (existing?.updatedAt ?? null) !== (resume?.updatedAt ?? null)

  await storage.set(PROFILE_KEY, { ...rest, resume: null })

  if (resumeChanged) {
    await storage.set(RESUME_KEY, resume ?? null)
  }
}

/** Apply a partial update on top of the stored profile. */
export async function patchProfile(patch: Partial<Profile>): Promise<Profile> {
  const current = await loadProfile()
  const next = { ...current, ...patch }
  await saveProfile(next)
  return next
}

export async function setResume(resume: Resume): Promise<void> {
  await storage.set(RESUME_KEY, ResumeSchema.parse(resume))
}

export async function clearResume(): Promise<void> {
  await storage.set(RESUME_KEY, null)
}

/**
 * Subscribe to profile changes so the drawer and the modal stay in sync when
 * both are open. Returns an unsubscribe function.
 */
export function watchProfile(onChange: (profile: Profile) => void): () => void {
  const handler = () => {
    void loadProfile().then(onChange)
  }

  storage.watch({
    [PROFILE_KEY]: handler,
    [RESUME_KEY]: handler
  })

  return () => {
    storage.unwatch({
      [PROFILE_KEY]: handler,
      [RESUME_KEY]: handler
    })
  }
}

/**
 * Approximate bytes used, for the settings screen. chrome.storage.local is
 * capped at roughly 10MB, and a resume is the only thing that can plausibly
 * approach it.
 */
export async function storageUsage(): Promise<{ bytes: number; quota: number }> {
  const bytes = await chrome.storage.local.getBytesInUse(null)
  return { bytes, quota: chrome.storage.local.QUOTA_BYTES ?? 10_485_760 }
}

export const STORAGE_KEYS = { PROFILE_KEY, RESUME_KEY } as const
