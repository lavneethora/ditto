import { z } from "zod"

// zod is pinned to exactly 3.23.8, not a caret range. 3.25 restructured its
// package exports for the v3/v4 split, and Parcel (which Plasmo uses) loses
// the `z` binding through that re-export chain. The failure is a blank popup
// with "(0, l.z).string is not a function" thrown at module load. esbuild
// resolves it correctly, so vitest and the dev harness both pass while the
// built extension is broken.

/**
 * The single source of truth for everything Ditto knows about the user.
 *
 * The shape mirrors the sections of the "Your Autofill Information" modal
 * one-to-one, so a section in the UI is always exactly one object here. It
 * also mirrors what the four target ATS actually ask for, which is why some
 * fields look redundant (preferred names, two separate sponsorship booleans).
 *
 * Everything is optional at rest. A half-filled profile is the normal state,
 * and the modal shows a dot on sections that are still incomplete rather than
 * refusing to save.
 */

/** "YYYY-MM". Month precision is all any of the four ATS ask for. */
const monthString = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Expected YYYY-MM")
  .or(z.literal(""))

/** "YYYY-MM-DD", used where a form wants an exact day (earliest start date). */
const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .or(z.literal(""))

/**
 * Tri-state. `null` means the user has not answered, which is different from
 * "decline", which is itself a real answer that many forms accept verbatim.
 */
export const TriState = z.enum(["yes", "no", "decline"])
export type TriState = z.infer<typeof TriState>

export const PhoneType = z.enum(["mobile", "home", "work"])
export type PhoneType = z.infer<typeof PhoneType>

export const PersonalSchema = z.object({
  firstName: z.string().default(""),
  middleName: z.string().default(""),
  lastName: z.string().default(""),

  // Workday and Greenhouse both offer a separate preferred-name block, and
  // some forms mark it required once "I have a preferred name" is checked.
  hasPreferredName: z.boolean().default(false),
  preferredFirstName: z.string().default(""),
  preferredMiddleName: z.string().default(""),
  preferredLastName: z.string().default(""),

  email: z.string().default(""),
  phoneType: PhoneType.default("mobile"),
  phoneCountryCode: z.string().default("+1"),
  phone: z.string().default(""),

  addressLine1: z.string().default(""),
  addressLine2: z.string().default(""),
  city: z.string().default(""),
  state: z.string().default(""),
  postalCode: z.string().default(""),
  country: z.string().default("United States of America")
})
export type Personal = z.infer<typeof PersonalSchema>

/**
 * Replaces Jobright's "Sign-up Information" section, which only exists because
 * Jobright has accounts. Ditto has none, but the links themselves are asked
 * for on nearly every application.
 */
export const LinksSchema = z.object({
  linkedin: z.string().default(""),
  github: z.string().default(""),
  portfolio: z.string().default(""),
  other: z.array(z.string()).default([])
})
export type Links = z.infer<typeof LinksSchema>

export const EducationSchema = z.object({
  id: z.string(),
  school: z.string().default(""),
  degree: z.string().default(""),
  major: z.string().default(""),
  gpa: z.string().default(""),
  startDate: monthString.default(""),
  endDate: monthString.default(""),
  current: z.boolean().default(false)
})
export type Education = z.infer<typeof EducationSchema>

export const WorkSchema = z.object({
  id: z.string(),
  company: z.string().default(""),
  title: z.string().default(""),
  location: z.string().default(""),
  startDate: monthString.default(""),
  endDate: monthString.default(""),
  current: z.boolean().default(false),
  summary: z.string().default("")
})
export type Work = z.infer<typeof WorkSchema>

/**
 * Equal employment answers.
 *
 * `authorizedUS` and `requiresSponsorship` are stored as two independent
 * booleans and are never derived from one another. They are genuinely
 * different facts: a candidate on OPT is authorized to work now AND will
 * require sponsorship later, and answering as though one implies the other
 * puts a false statement on a job application. See PRD section 5.2.
 */
export const EeoSchema = z.object({
  authorizedUS: z.boolean().nullable().default(null),
  requiresSponsorship: z.boolean().nullable().default(null),
  disability: TriState.nullable().default(null),
  veteran: TriState.nullable().default(null),
  gender: z.string().default(""),
  race: z.string().default(""),
  hispanicLatino: TriState.nullable().default(null),

  /**
   * Question keys the user has opted out of. Anything listed here is reported
   * as SKIPPED, never guessed and never left to a default. Demographic
   * questions are voluntary and Ditto treats them that way.
   */
  neverFill: z.array(z.string()).default([])
})
export type Eeo = z.infer<typeof EeoSchema>

export const PreferencesSchema = z.object({
  desiredSalary: z.string().default(""),
  earliestStartDate: dateString.default(""),
  willingToRelocate: z.boolean().nullable().default(null),
  locations: z.array(z.string()).default([]),
  /** "LinkedIn", "Referral", "Company website", and so on. */
  howDidYouHear: z.string().default("")
})
export type Preferences = z.infer<typeof PreferencesSchema>

/**
 * Reusable saved answers for the open-text questions every application asks
 * differently ("Why this company?", "Anything else we should know?").
 *
 * Ditto fills the closest matching snippet and puts every unmatched open-text
 * question under NEEDS YOU. It never writes an answer it was not given: a
 * generated answer submitted under the user's name is the user's statement,
 * not Ditto's.
 */
export const AnswerSchema = z.object({
  id: z.string(),
  /** Short label the matcher keys on, e.g. "why this company". */
  label: z.string().default(""),
  body: z.string().default("")
})
export type Answer = z.infer<typeof AnswerSchema>

/** The resume, stored as base64 so it survives chrome.storage serialization. */
export const ResumeSchema = z.object({
  filename: z.string(),
  mimeType: z.string(),
  size: z.number(),
  /** base64, no data: prefix. */
  data: z.string(),
  updatedAt: z.number()
})
export type Resume = z.infer<typeof ResumeSchema>

export const SettingsSchema = z.object({
  /**
   * When on, a value the user corrects directly in an application form is
   * written back to the profile. Jobright calls this "Automatically update
   * Autofill information".
   */
  learnFromCorrections: z.boolean().default(true),
  /** Drawer starts expanded when a supported form is detected. */
  autoExpandDrawer: z.boolean().default(true)
})
export type Settings = z.infer<typeof SettingsSchema>

export const ProfileSchema = z.object({
  version: z.literal(1).default(1),
  personal: PersonalSchema.default({}),
  links: LinksSchema.default({}),
  education: z.array(EducationSchema).default([]),
  work: z.array(WorkSchema).default([]),
  skills: z.array(z.string()).default([]),
  eeo: EeoSchema.default({}),
  preferences: PreferencesSchema.default({}),
  answers: z.array(AnswerSchema).default([]),
  resume: ResumeSchema.nullable().default(null),
  settings: SettingsSchema.default({})
})
export type Profile = z.infer<typeof ProfileSchema>

/** The eight sections of the profile modal, in nav order. */
export const SECTIONS = [
  "personal",
  "links",
  "education",
  "work",
  "skills",
  "eeo",
  "preferences",
  "answers"
] as const
export type SectionId = (typeof SECTIONS)[number]

export const SECTION_LABELS: Record<SectionId, string> = {
  personal: "Personal",
  links: "Links",
  education: "Education",
  work: "Work Experience",
  skills: "Skills",
  eeo: "Equal Employment",
  preferences: "Preferences",
  answers: "Answers"
}

/** A fresh, empty profile. Parsing `{}` applies every default above. */
export function emptyProfile(): Profile {
  return ProfileSchema.parse({})
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export function emptyEducation(): Education {
  return EducationSchema.parse({ id: newId() })
}

export function emptyWork(): Work {
  return WorkSchema.parse({ id: newId() })
}

export function emptyAnswer(): Answer {
  return AnswerSchema.parse({ id: newId() })
}

/**
 * Whether a section has enough in it to be useful during a fill. Drives the
 * red dot in the modal nav. Deliberately lenient: this marks "worth your
 * attention", not "invalid".
 */
export function isSectionComplete(profile: Profile, section: SectionId): boolean {
  switch (section) {
    case "personal": {
      const p = profile.personal
      return Boolean(p.firstName && p.lastName && p.email && p.phone)
    }
    case "links":
      return Boolean(profile.links.linkedin || profile.links.github || profile.links.portfolio)
    case "education":
      return profile.education.some((e) => e.school && e.degree)
    case "work":
      return profile.work.some((w) => w.company && w.title)
    case "skills":
      return profile.skills.length > 0
    case "eeo": {
      const e = profile.eeo
      return e.authorizedUS !== null && e.requiresSponsorship !== null
    }
    case "preferences":
      return Boolean(profile.preferences.howDidYouHear)
    case "answers":
      return profile.answers.some((a) => a.label && a.body)
  }
}
