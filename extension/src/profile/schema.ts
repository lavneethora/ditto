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
  county: z.string().default(""),
  postalCode: z.string().default(""),
  country: z.string().default("United States of America"),

  // Links live in Personal rather than a section of their own, which is where
  // Jobright puts them and where an application form asks for them: right
  // after the address, as part of "who are you and where do we find you".
  linkedin: z.string().default(""),
  github: z.string().default(""),
  website: z.string().default("")
})
export type Personal = z.infer<typeof PersonalSchema>

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
  /** One free-text paragraph, for forms with a single description box. */
  summary: z.string().default(""),
  /**
   * Bullets, kept separate from `summary` because they serve different form
   * shapes: Workday wants a paragraph, while a resume-style textarea wants
   * lines. Storing one and deriving the other loses information in both
   * directions.
   */
  bullets: z.array(z.string()).default([])
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
  lgbtq: TriState.nullable().default(null),
  sexualOrientation: z.string().default(""),
  pronouns: z.string().default("")
})
export type Eeo = z.infer<typeof EeoSchema>

/**
 * Application preferences.
 *
 * Deliberately three fields, not the five this section had before it was cut.
 * The test is the same one the Answers section uses: keep only what has the
 * same answer on every application.
 *
 * Notably absent is an earliest start date. That question now lives in
 * Answers as free text, which is how forms actually ask it, and storing a date
 * here as well would give two sources of truth for one question with no rule
 * for which wins.
 */
export const PreferencesSchema = z.object({
  /**
   * Yes or no, and `null` for unanswered.
   *
   * One input covers both form shapes. A dropdown gets the option matched by
   * the Yes/No synonyms in core/fill/options.ts, and a free-text box gets the
   * word "Yes" or "No", because core/fill writes a boolean out as exactly
   * that. The question has a two-state answer, so storing prose for it would
   * only add a way to disagree with itself.
   */
  willingToRelocate: z.boolean().nullable().default(null),
  /** "LinkedIn", "Referral", and so on. Required on most Workday forms. */
  howDidYouHear: z.string().default(""),
  desiredSalary: z.string().default("")
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
  education: "Education",
  work: "Work Experience",
  skills: "Skill",
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
      // Optional like Answers: an application is fillable without any of it.
      return true
    case "answers":
      // Optional by design: these questions are worth answering once, but an
      // application is perfectly fillable without them. Marking the section
      // incomplete would nag about something that is not missing.
      return true
  }
}
