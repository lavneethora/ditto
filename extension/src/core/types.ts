import type { Profile } from "~profile/schema"

/**
 * Core engine types. Nothing here knows about any specific ATS.
 *
 * The single most important thing in this file is that `AttemptOutcome` has no
 * `filled` variant. A fill function is only able to report that it *wrote*
 * something. Promotion to `filled` happens in verify.ts after reading the
 * value back out of the DOM, which is what makes PRD invariant 5.1 a property
 * of the type system rather than a rule someone has to remember.
 */

/** Every control kind the engine knows how to drive. */
export type FieldKind =
  | "text"
  | "textarea"
  | "select"
  | "radiogroup"
  | "checkbox"
  | "file"
  | "combobox"
  | "multiselect"
  | "date"
  | "month"

export type FillableElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement

export interface FieldOption {
  /** The value the form submits. */
  value: string
  /** What the user sees. */
  label: string
  /** The clickable element, for radios and custom listboxes. */
  el?: HTMLElement
}

/**
 * One form control the scanner found, with everything the matcher needs to
 * decide what belongs in it.
 */
export interface FieldSpec {
  /** Stable within a scan. Used for dedupe and for keying report rows. */
  id: string
  el: FillableElement
  kind: FieldKind
  /** Human label, resolved by label.ts. Empty when nothing could be found. */
  label: string
  required: boolean
  /** Shared `name` for a radio group. */
  name?: string
  /** Nearest enclosing heading. Disambiguates education from work blocks. */
  section?: string
  options?: FieldOption[]
  /** Index within a repeated block, e.g. the second education entry. */
  repeatIndex?: number
}

/**
 * Canonical destinations. The matcher maps a FieldSpec onto one of these, and
 * the filler resolves one of these against the Profile.
 *
 * Repeatable sections use a `[]` marker; the resolver pairs it with
 * `FieldSpec.repeatIndex`.
 */
export const PROFILE_KEYS = [
  "personal.firstName",
  "personal.middleName",
  "personal.lastName",
  "personal.fullName",
  "personal.preferredFirstName",
  "personal.preferredLastName",
  "personal.email",
  "personal.phone",
  "personal.phoneType",
  "personal.phoneCountryCode",
  "personal.addressLine1",
  "personal.addressLine2",
  "personal.city",
  "personal.state",
  "personal.postalCode",
  "personal.country",

  "links.linkedin",
  "links.github",
  "links.portfolio",

  "education[].school",
  "education[].degree",
  "education[].major",
  "education[].gpa",
  "education[].startDate",
  "education[].endDate",

  "work[].company",
  "work[].title",
  "work[].location",
  "work[].startDate",
  "work[].endDate",
  "work[].summary",

  "skills",

  "eeo.authorizedUS",
  "eeo.requiresSponsorship",
  "eeo.disability",
  "eeo.veteran",
  "eeo.gender",
  "eeo.race",
  "eeo.hispanicLatino",

  "preferences.desiredSalary",
  "preferences.earliestStartDate",
  "preferences.willingToRelocate",
  "preferences.howDidYouHear",

  "answers",
  "resume"
] as const

export type ProfileKey = (typeof PROFILE_KEYS)[number]

/**
 * A matcher rule.
 *
 * `invert` is required, not optional, on any rule targeting a boolean key.
 * See PRD 5.2: "will you require sponsorship?" and "can you work without
 * sponsorship?" take opposite answers from the same stored fact, and a rule
 * that forgets to say which one it is produces a false legal statement.
 */
export interface MatchRule {
  key: ProfileKey
  /** Tested against the normalized label. */
  test: RegExp
  /**
   * For boolean keys: whether the stored value must be flipped before it is
   * written. Deliberately not optional, so a new rule cannot silently default.
   */
  invert?: boolean
  /** Higher wins when several rules match. Defaults to rule order. */
  weight?: number
}

/** What a fill function is allowed to report. Note the absence of `filled`. */
export type AttemptOutcome =
  | { kind: "wrote"; value: string }
  | { kind: "skipped"; reason: string }
  | { kind: "needs_you"; reason: string }
  | { kind: "error"; reason: string }

export type FillStatus = "filled" | "needs_you" | "skipped" | "error"

/** The verified result for one field, as shown in the drawer. */
export interface FillResult {
  fieldId: string
  label: string
  required: boolean
  status: FillStatus
  key?: ProfileKey
  /** The value confirmed present in the DOM, for `filled`. */
  value?: string
  /** Why it is not filled, for every other status. */
  reason?: string
}

export interface FillReport {
  ats: string
  fieldsFound: number
  fieldsRecognized: number
  requiredTotal: number
  requiredFilled: number
  /** requiredFilled / requiredTotal, 0 to 100. 100 when nothing is required. */
  percent: number
  filled: FillResult[]
  needsYou: FillResult[]
  skipped: FillResult[]
  errors: FillResult[]
}

/**
 * An adapter contributes site knowledge only: how to recognize the page, where
 * the form is, extra selectors, and quirks. It never implements filling. If a
 * site needs new widget behaviour, that behaviour is generalised into
 * core/fill/ so every other adapter gets it too.
 */
export interface Adapter {
  id: string
  /** Shown in the drawer, e.g. "Greenhouse". */
  name: string
  /** True when this adapter handles the current document. */
  detect(doc: Document, url: string): boolean
  /** Root to scan. Defaults to document.body when omitted. */
  root?(doc: Document): HTMLElement | null
  /** Extra rules merged ahead of the shared matcher rules. */
  rules?: MatchRule[]
  /** Controls this adapter should never touch. */
  ignore?(el: Element): boolean
  /** The control that advances a multi-step form, if there is one. */
  nextControl?(doc: Document): HTMLElement | null
  /** Current step label for multi-step wizards. */
  step?(doc: Document): string | null
}

export interface FillContext {
  profile: Profile
  adapter: Adapter
  doc: Document
}
