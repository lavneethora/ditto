import type { Profile, Resume, TriState } from "~profile/schema"

import type { FieldSpec, ProfileKey } from "./types"
import type { MatchResult } from "./match"
import { canonical } from "./label"

/**
 * Turns a matched profile key into the value to write.
 *
 * This is the only place `invert` is applied. Keeping the flip here, rather
 * than in each fill function, means there is exactly one line of code that can
 * get a sponsorship answer backwards, and it is directly under test. See PRD
 * 5.2.
 */

export type Resolved =
  | { kind: "text"; value: string }
  | { kind: "boolean"; value: boolean }
  | { kind: "tristate"; value: TriState }
  | { kind: "list"; value: string[] }
  | { kind: "file"; value: Resume }
  /** Nothing on file. Reported as SKIPPED. */
  | { kind: "none"; reason: string }
  /** User opted out of this question. Reported as SKIPPED, never guessed. */
  | { kind: "opted_out"; reason: string }
  /** Recognized but only the user can answer. Reported as NEEDS YOU. */
  | { kind: "needs_you"; reason: string }

/** Maps a profile key onto the eeo.neverFill opt-out key, when there is one. */
const OPT_OUT_KEYS: Partial<Record<ProfileKey, string>> = {
  "eeo.disability": "disability",
  "eeo.veteran": "veteran",
  "eeo.gender": "gender",
  "eeo.race": "race",
  "eeo.hispanicLatino": "hispanicLatino"
}

function text(value: string | undefined | null, label: string): Resolved {
  const trimmed = (value ?? "").trim()
  return trimmed ? { kind: "text", value: trimmed } : { kind: "none", reason: `No ${label} saved` }
}

/** Picks the nth entry of a repeatable list, falling back to the first. */
function nth<T>(items: T[], index: number | undefined): T | undefined {
  if (items.length === 0) return undefined
  return items[index ?? 0] ?? undefined
}

/**
 * Finds the saved answer whose label best matches the question on the form.
 *
 * Scored on word overlap rather than substring, because forms rarely phrase a
 * question the way the user labelled their snippet ("Why this company" against
 * "Why are you interested in working at Acme?"). Requires a real overlap, so
 * an unmatched question goes to NEEDS YOU instead of receiving an answer about
 * something else.
 */
function matchSavedAnswer(profile: Profile, question: string): Resolved {
  const asked = new Set(canonical(question).split(" ").filter((w) => w.length > 3))

  let best: { body: string; score: number } | null = null

  for (const answer of profile.answers) {
    if (!answer.label.trim() || !answer.body.trim()) continue

    const words = canonical(answer.label).split(" ").filter((w) => w.length > 3)
    if (words.length === 0) continue

    const hits = words.filter((w) => asked.has(w)).length
    const score = hits / words.length

    if (hits > 0 && (!best || score > best.score)) {
      best = { body: answer.body, score }
    }
  }

  // Half the snippet's significant words must appear in the question. Below
  // that the match is coincidental.
  if (best && best.score >= 0.5) {
    return { kind: "text", value: best.body }
  }

  return {
    kind: "needs_you",
    reason: "No saved answer matches this question"
  }
}

export function resolve(match: MatchResult, field: FieldSpec, profile: Profile): Resolved {
  const { key, invert } = match

  const optOut = OPT_OUT_KEYS[key]
  if (optOut && profile.eeo.neverFill.includes(optOut)) {
    return { kind: "opted_out", reason: "You chose never to fill this" }
  }

  const p = profile.personal
  const index = field.repeatIndex

  switch (key) {
    // --- Booleans. The only place `invert` is applied. ----------------------

    case "eeo.authorizedUS":
    case "eeo.requiresSponsorship":
    case "preferences.willingToRelocate": {
      const stored =
        key === "eeo.authorizedUS"
          ? profile.eeo.authorizedUS
          : key === "eeo.requiresSponsorship"
            ? profile.eeo.requiresSponsorship
            : profile.preferences.willingToRelocate

      if (stored === null) {
        return { kind: "none", reason: "Not answered in your profile" }
      }

      return { kind: "boolean", value: invert ? !stored : stored }
    }

    // --- Tri-state demographics --------------------------------------------

    case "eeo.disability":
      return profile.eeo.disability
        ? { kind: "tristate", value: profile.eeo.disability }
        : { kind: "none", reason: "Not answered in your profile" }

    case "eeo.veteran":
      return profile.eeo.veteran
        ? { kind: "tristate", value: profile.eeo.veteran }
        : { kind: "none", reason: "Not answered in your profile" }

    case "eeo.hispanicLatino":
      return profile.eeo.hispanicLatino
        ? { kind: "tristate", value: profile.eeo.hispanicLatino }
        : { kind: "none", reason: "Not answered in your profile" }

    case "eeo.gender":
      return text(profile.eeo.gender, "gender")

    case "eeo.race":
      return text(profile.eeo.race, "race or ethnicity")

    // --- Personal -----------------------------------------------------------

    case "personal.firstName":
      return text(p.firstName, "first name")
    case "personal.middleName":
      return text(p.middleName, "middle name")
    case "personal.lastName":
      return text(p.lastName, "last name")
    case "personal.fullName":
      return text([p.firstName, p.lastName].filter(Boolean).join(" "), "name")
    case "personal.preferredFirstName":
      return text(p.hasPreferredName ? p.preferredFirstName : p.firstName, "preferred first name")
    case "personal.preferredLastName":
      return text(p.hasPreferredName ? p.preferredLastName : p.lastName, "preferred last name")
    case "personal.email":
      return text(p.email, "email")
    case "personal.phone":
      return text(p.phone, "phone number")
    case "personal.phoneType":
      return text(p.phoneType, "phone type")
    case "personal.phoneCountryCode":
      return text(p.phoneCountryCode, "country code")
    case "personal.addressLine1":
      return text(p.addressLine1, "address")
    case "personal.addressLine2":
      return text(p.addressLine2, "address line 2")
    case "personal.city":
      return text(p.city, "city")
    case "personal.state":
      return text(p.state, "state")
    case "personal.postalCode":
      return text(p.postalCode, "postal code")
    case "personal.country":
      return text(p.country, "country")

    // --- Links --------------------------------------------------------------

    case "links.linkedin":
      return text(profile.links.linkedin, "LinkedIn URL")
    case "links.github":
      return text(profile.links.github, "GitHub URL")
    case "links.portfolio":
      return text(profile.links.portfolio, "portfolio URL")

    // --- Education ----------------------------------------------------------

    case "education[].school":
      return text(nth(profile.education, index)?.school, "school")
    case "education[].degree":
      return text(nth(profile.education, index)?.degree, "degree")
    case "education[].major":
      return text(nth(profile.education, index)?.major, "major")
    case "education[].gpa":
      return text(nth(profile.education, index)?.gpa, "GPA")
    case "education[].startDate":
      return text(nth(profile.education, index)?.startDate, "education start date")
    case "education[].endDate":
      return text(nth(profile.education, index)?.endDate, "education end date")

    // --- Work ---------------------------------------------------------------

    case "work[].company":
      return text(nth(profile.work, index)?.company, "company")
    case "work[].title":
      return text(nth(profile.work, index)?.title, "job title")
    case "work[].location":
      return text(nth(profile.work, index)?.location, "location")
    case "work[].summary":
      return text(nth(profile.work, index)?.summary, "experience summary")
    case "work[].startDate":
      return text(nth(profile.work, index)?.startDate, "work start date")
    case "work[].endDate": {
      const entry = nth(profile.work, index)
      if (entry?.current) {
        return { kind: "none", reason: "This is your current role, so there is no end date" }
      }
      return text(entry?.endDate, "work end date")
    }

    // --- Everything else ----------------------------------------------------

    case "skills":
      return profile.skills.length
        ? { kind: "list", value: profile.skills }
        : { kind: "none", reason: "No skills saved" }

    case "resume":
      return profile.resume
        ? { kind: "file", value: profile.resume }
        : { kind: "none", reason: "No resume uploaded" }

    case "preferences.desiredSalary":
      return text(profile.preferences.desiredSalary, "desired salary")
    case "preferences.earliestStartDate":
      return text(profile.preferences.earliestStartDate, "earliest start date")
    case "preferences.howDidYouHear":
      return text(profile.preferences.howDidYouHear, "answer for how you heard about them")

    case "answers":
      return matchSavedAnswer(profile, field.label)
  }
}

/**
 * Open-text questions with no matched key still get a chance at a saved
 * answer, since a snippet's whole purpose is to cover questions the rule set
 * cannot anticipate.
 */
export function resolveUnmatched(field: FieldSpec, profile: Profile): Resolved {
  if (field.kind !== "textarea") {
    return { kind: "needs_you", reason: "Ditto does not recognise this field" }
  }

  return matchSavedAnswer(profile, field.label)
}
