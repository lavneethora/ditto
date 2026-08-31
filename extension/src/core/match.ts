import { canonical } from "./label"
import type { FieldSpec, MatchRule, ProfileKey } from "./types"

/**
 * Maps a scanned field onto a profile key.
 *
 * Two design decisions carry most of the weight here.
 *
 * 1. Rules are weighted, not ordered. Real labels match several patterns at
 *    once ("Are you legally authorized to work in the US without sponsorship?"
 *    matches both authorization and sponsorship), and resolving that by rule
 *    order makes the outcome depend on where someone happened to paste a line.
 *    An explicit weight makes the precedence readable.
 *
 * 2. Any rule targeting a boolean key MUST declare `invert`. See PRD 5.2:
 *    "will you require sponsorship?" and "can you work without sponsorship?"
 *    take opposite answers from the same stored fact, and a missing flag is a
 *    false statement on a job application rather than a cosmetic bug. This is
 *    enforced by `assertRulesAreSound` and covered in match.test.ts.
 */

/** Keys whose stored value is a boolean, and therefore invertible. */
export const BOOLEAN_KEYS: ReadonlySet<ProfileKey> = new Set([
  "eligibility.usCitizen",
  "eligibility.permanentResident",
  "eligibility.citizenOrResidentOrProtected",
  "eligibility.atLeast18",
  "eligibility.residentOutsideUS",
  "personal.hasPreferredName",
  "work[].current",
  "eeo.authorizedUS",
  "eeo.requiresSponsorship",
  "preferences.willingToRelocate"
])

export interface MatchResult {
  key: ProfileKey
  /** Whether the stored boolean must be flipped before writing. */
  invert: boolean
  /** The pattern that won, for debugging and the score report. */
  rule: string
}

/** Which repeated block a field sits in, used to disambiguate shared labels. */
type SectionKind = "education" | "work" | "eeo" | "phone" | undefined

function sectionKind(section: string | undefined): SectionKind {
  if (!section) return undefined

  const s = canonical(section)
  if (/(education|school|university|college|academic)/.test(s)) return "education"
  if (/(work|experience|employment|position|job history)/.test(s)) return "work"
  if (/(voluntary|self identify|disclosure|equal opportunity|demographic)/.test(s)) return "eeo"
  if (/^phone/.test(s)) return "phone"

  return undefined
}

/**
 * Whether a label reads as a question rather than a field name.
 *
 * Two signals, either sufficient: it ends in a question mark, or it opens with
 * an interrogative or auxiliary verb. Both are cheap and neither depends on
 * the wording of any one ATS.
 */
function isQuestion(label: string): boolean {
  if (/\?\s*$/.test(label)) return true

  return /^(?:are|is|do|does|did|have|has|had|will|would|can|could|should|may|why|how|what|when|where|which|who|whose|if)\b/.test(
    canonical(label)
  )
}

/**
 * The `autocomplete` attribute, when it carries a standard token.
 *
 * This is the most reliable signal available and it outranks label matching,
 * because it is a spec-defined contract rather than prose a designer wrote.
 * Greenhouse sets it correctly (given-name, family-name, email) even on
 * fields whose labels are ambiguous.
 *
 * Only known tokens are honoured. `autocomplete="off"` and bespoke values are
 * ignored rather than guessed at.
 */
const AUTOCOMPLETE_KEYS: Record<string, ProfileKey> = {
  "given-name": "personal.firstName",
  "additional-name": "personal.middleName",
  "family-name": "personal.lastName",
  name: "personal.fullName",
  email: "personal.email",
  tel: "personal.phone",
  "tel-national": "personal.phone",
  "tel-country-code": "personal.phoneCountryCode",
  "address-line1": "personal.addressLine1",
  "address-line2": "personal.addressLine2",
  "address-level2": "personal.city",
  "address-level1": "personal.state",
  "postal-code": "personal.postalCode",
  country: "personal.country",
  "country-name": "personal.country",
  organization: "work[].company",
  "organization-title": "work[].title",
  url: "personal.website"
}

function byAutocomplete(field: FieldSpec): ProfileKey | null {
  const raw = field.el.getAttribute?.("autocomplete")
  if (!raw) return null

  // Tokens can be space separated and section-prefixed, e.g.
  // "section-primary shipping given-name". The meaningful token is last.
  //
  // Deliberately not run through canonical(): that strips hyphens, which
  // turns "given-name" into "name" and silently maps a first-name field onto
  // the full name.
  const token = raw.trim().toLowerCase().split(/\s+/).pop() ?? ""

  return AUTOCOMPLETE_KEYS[token] ?? null
}

/**
 * Shared rules, highest weight first within each group.
 *
 * Weights are coarse on purpose: 100 for a phrase that can only mean one
 * thing, 80 for a strong signal, 60 for a plausible one, 40 for a fallback
 * that should lose to anything more specific.
 */
const RULES: MatchRule[] = [
  // --- Work authorization and sponsorship. See PRD 5.2. ---------------------

  // "without sponsorship" flips the stored answer. This outranks everything
  // else because the phrase is unambiguous and appears inside sentences that
  // also mention authorization.
  {
    key: "eeo.requiresSponsorship",
    allowOnQuestion: true,
    test: /\bwithout\s+(?:any\s+)?(?:company\s+|employer\s+|visa\s+|immigration\s+|the\s+need\s+for\s+)?sponsorship\b/,
    invert: true,
    weight: 100
  },
  {
    key: "eeo.requiresSponsorship",
    allowOnQuestion: true,
    test: /\bnot\s+require\s+(?:visa\s+|employment\s+|employer\s+)?sponsorship\b/,
    invert: true,
    weight: 100
  },
  {
    key: "eeo.requiresSponsorship",
    allowOnQuestion: true,
    test: /\b(?:require|requires|requiring|need|needs|needing|seek|seeking)\b[^.?]{0,40}\bsponsorship\b/,
    invert: false,
    weight: 90
  },
  {
    key: "eeo.requiresSponsorship",
    allowOnQuestion: true,
    test: /\bsponsorship\b/,
    invert: false,
    weight: 50
  },
  {
    key: "eeo.authorizedUS",
    allowOnQuestion: true,
    test: /\b(?:legally\s+)?(?:authorized|authorised|eligible|permitted)\b[^.?]{0,30}\bwork\b/,
    invert: false,
    weight: 80
  },
  {
    key: "eeo.authorizedUS",
    allowOnQuestion: true,
    test: /\bwork\s+authorization\b|\bauthorization\s+to\s+work\b|\bright\s+to\s+work\b/,
    invert: false,
    weight: 80
  },

  // --- Voluntary demographic questions --------------------------------------

  { key: "eeo.hispanicLatino", allowOnQuestion: true, test: /\bhispanic\b|\blatino\b|\blatinx\b/, weight: 90 },
  { key: "eeo.disability", allowOnQuestion: true, test: /\bdisabilit(?:y|ies)\b|\bdisabled\b/, weight: 90 },
  { key: "eeo.veteran", allowOnQuestion: true, test: /\bveteran\b|\bmilitary\s+service\b|\bprotected\s+veteran\b/, weight: 90 },
  { key: "eeo.pronouns", allowOnQuestion: true, test: /\bpronouns?\b/, weight: 100 },
  { key: "eeo.sexualOrientation", allowOnQuestion: true, test: /\bsexual\s+orientation\b/, weight: 100 },
  { key: "eeo.lgbtq", allowOnQuestion: true, test: /\blgbtq?\+?\b|\bqueer\b/, weight: 95 },
  { key: "eeo.gender", allowOnQuestion: true, test: /\bgender\b|\bsex\b/, weight: 80 },
  { key: "eeo.race", allowOnQuestion: true, test: /\brace\b|\bethnicit(?:y|ies)\b|\bracial\b|\bethnic\s+group\b/, weight: 80 },

  // --- Names ----------------------------------------------------------------

  // The disclosure toggle, not the name box. Deliberately narrow: a field
  // labelled just "Preferred Name" is a text input wanting a name, and must
  // keep falling through to the rules below it.
  /**
   * Eligibility. Every one is phrased as a question, so each opts in.
   *
   * The compound outranks the plain citizenship rule deliberately: a question
   * listing citizen OR resident OR protected person contains the words "us
   * citizen", and answering it as though it had asked only about citizenship
   * would tell a green card holder to say no.
   */
  {
    key: "eligibility.citizenOrResidentOrProtected",
    test: /\b(?:any of the following|1324b|protected\s+person)\b|\bcitizen\b[^?]{0,80}\bpermanent\s+resident\b|\bpermanent\s+resident\b[^?]{0,80}\bprotected\b/,
    weight: 120,
    invert: false,
    allowOnQuestion: true
  },
  {
    key: "eligibility.residentOutsideUS",
    test: /\bpermanent\s+resident\b[^?]{0,60}\boutside\s+(?:the\s+)?(?:us\b|u\.s\.|united\s+states)|\bin\s+a\s+country\s+outside\s+the\s+us\b/,
    weight: 115,
    invert: false,
    allowOnQuestion: true
  },
  {
    key: "eligibility.atLeast18",
    test: /\bat\s+least\s+18\b|\b18\s+years\s+(?:of\s+age\s+)?or\s+older\b|\bare\s+you\s+(?:at\s+least\s+)?18\b|\bover\s+the\s+age\s+of\s+18\b/,
    weight: 110,
    invert: false,
    allowOnQuestion: true
  },
  {
    key: "eligibility.usCitizen",
    test: /\b(?:u\.?\s?s\.?|united\s+states|american)\s+citizen(?:ship)?\b/,
    weight: 100,
    invert: false,
    allowOnQuestion: true
  },
  {
    key: "eligibility.permanentResident",
    test: /\bpermanent\s+resident\b|\bgreen\s+card\b/,
    weight: 95,
    invert: false,
    allowOnQuestion: true
  },
  {
    key: "personal.hasPreferredName",
    test: /\b(?:i\s+have|do\s+you\s+have|use)\s+an?\s+preferred\s+name\b|\bi\s+have\s+a\s+preferred\s+name\b/,
    weight: 95,
    invert: false,
    allowOnQuestion: true
  },
  { key: "personal.preferredFirstName", test: /\bpreferred\b[^.?]{0,12}\bfirst\s+name\b/, weight: 100 },
  { key: "personal.preferredLastName", test: /\bpreferred\b[^.?]{0,12}\b(?:last|family)\s+name\b/, weight: 100 },
  { key: "personal.firstName", test: /\bfirst\s+name\b|\bgiven\s+name\b|\bforename\b/, weight: 90 },
  { key: "personal.lastName", test: /\blast\s+name\b|\bsurname\b|\bfamily\s+name\b/, weight: 90 },
  { key: "personal.middleName", test: /\bmiddle\s+(?:name|initial)\b/, weight: 90 },
  // Bare "name" only, so it cannot steal "first name". Lever uses this.
  { key: "personal.fullName", test: /^(?:full\s+|legal\s+|your\s+)?name$/, weight: 70 },

  // --- Contact --------------------------------------------------------------

  { key: "personal.email", test: /\be-?mail\b/, weight: 90 },
  { key: "personal.phoneCountryCode", test: /\b(?:country|dial|area)\s+code\b|\bphone\s+code\b/, weight: 100 },
  { key: "personal.phoneType", test: /\bphone\s+(?:device\s+)?type\b|\bdevice\s+type\b/, weight: 100 },
  { key: "personal.phone", test: /\bphone\b|\bmobile\b|\btelephone\b|\bcell\b/, weight: 80 },

  // --- Address --------------------------------------------------------------

  {
    key: "personal.addressLine2",
    test: /\baddress\s*(?:line\s*)?2\b|\bapartment\b|\bapt\b|\bsuite\b|\bunit\b|\bfloor\b/,
    weight: 100
  },
  {
    key: "personal.addressLine1",
    test: /\baddress\s*(?:line\s*)?1\b|\bstreet\s+address\b|^address$|\bstreet\b/,
    weight: 90
  },
  { key: "personal.postalCode", test: /\bzip\b|\bpostal\s+code\b|\bpostcode\b/, weight: 90 },
  { key: "personal.city", test: /\bcity\b|\btown\b|\bmunicipality\b/, weight: 90 },
  { key: "personal.state", test: /\bstate\b|\bprovince\b|\bregion\b|\bcounty\b/, weight: 85 },
  { key: "personal.country", test: /\bcountry\b/, weight: 70 },

  // --- Links ----------------------------------------------------------------

  { key: "personal.linkedin", test: /\blinked\s?in\b/, weight: 100 },
  { key: "personal.github", test: /\bgit\s?hub\b/, weight: 100 },
  {
    key: "personal.website",
    test: /\bportfolio\b|\bpersonal\s+(?:web)?site\b|\bwebsite\b|\bweb\s+address\b|\bblog\b|^url$/,
    weight: 70
  },

  // --- Education ------------------------------------------------------------

  { key: "education[].school", test: /\bschool\b|\buniversity\b|\bcollege\b|\binstitution\b/, weight: 90 },
  { key: "education[].gpa", test: /\bgpa\b|\bgrade\s+point\b/, weight: 100 },
  {
    key: "education[].degree",
    test: /\bdegree\b|\baccreditation\b|\bqualification\b|\blevel\s+of\s+education\b/,
    weight: 90
  },
  {
    key: "education[].major",
    test: /\bmajor\b|\bfield\s+of\s+study\b|\bdiscipline\b|\bconcentration\b|\bcourse\s+of\s+study\b/,
    weight: 90
  },

  // --- Work -----------------------------------------------------------------

  { key: "work[].company", test: /\bcompany\b|\bemployer\b|\borganization\b|\borganisation\b/, weight: 90 },
  {
    key: "work[].current",
    test: /\bi\s+currently\s+work\s+here\b|\bcurrently\s+(?:work|employed)\s+(?:here|at)\b/,
    weight: 100,
    invert: false
  },
  { key: "work[].title", test: /\bjob\s+title\b|\bposition\s+title\b|^title$|^role$|\b(?:current|recent|previous)\s+role\b/, weight: 85 },
  {
    key: "work[].summary",
    test: /\bdescription\b|\bsummary\b|\bresponsibilit(?:y|ies)\b|\bachievements\b/,
    weight: 70
  },
  { key: "work[].location", test: /\blocation\b/, weight: 60 },

  // --- Everything else ------------------------------------------------------

  { key: "skills", test: /\bskills?\b|\btechnolog(?:y|ies)\b|\bcompetenc(?:y|ies)\b/, weight: 80 },
  { key: "resume", test: /\bresume\b|\bcv\b|\bcurriculum\s+vitae\b/, weight: 90 },

  // --- Preferences ----------------------------------------------------------
  //
  // All three opt in on questions, because that is how forms ask them:
  // "Are you open to relocation?", "How did you hear about us?", "What are
  // your salary expectations?".

  {
    key: "preferences.willingToRelocate",
    allowOnQuestion: true,
    test: /\b(?:open|willing|able|prepared|comfortable)\b[^.?]{0,25}\brelocat/,
    invert: false,
    weight: 95
  },
  {
    key: "preferences.willingToRelocate",
    allowOnQuestion: true,
    test: /\b(?:would|can|will)\s+you\s+(?:be\s+)?(?:willing\s+to\s+)?relocat/,
    invert: false,
    weight: 90
  },
  {
    key: "preferences.howDidYouHear",
    allowOnQuestion: true,
    test: /\bhow\s+did\s+you\s+(?:hear|find|learn)\b|\breferral\s+source\b|\bhow\s+were\s+you\s+referred\b/,
    weight: 90
  },
  {
    key: "preferences.desiredSalary",
    allowOnQuestion: true,
    test: /\bsalary\b|\bcompensation\b|\bdesired\s+pay\b|\bpay\s+expectation/,
    weight: 85
  }
]

/**
 * Date rules, applied only after the section is known.
 *
 * "Start Date" appears in education blocks, work blocks, and on its own as an
 * availability question. Without section context all three collide, and the
 * wrong one is worse than none: writing a graduation date into "when can you
 * start" is a claim about availability the user never made.
 */
const DATE_RULES: Record<"education" | "work" | "default", MatchRule[]> = {
  education: [
    { key: "education[].startDate", test: /\bstart\b|\bfrom\b|\battended\s+from\b/, weight: 80 },
    {
      key: "education[].endDate",
      test: /\bend\b|\bto\b|\bgraduat|\bcompletion\b|\bexpected\b/,
      weight: 80
    }
  ],
  work: [
    { key: "work[].startDate", test: /\bstart\b|\bfrom\b/, weight: 80 },
    { key: "work[].endDate", test: /\bend\b|\bto\b|\bthrough\b/, weight: 80 }
  ],
  // With the Preference section gone there is no stored availability date, so
  // a bare "when can you start" question has no key and lands in NEEDS YOU.
  default: []
}

/**
 * Fails loudly if a rule targets a boolean key without saying which polarity
 * it is. Runs in tests, and at module load in development.
 */
export function assertRulesAreSound(rules: readonly MatchRule[] = ALL_RULES): void {
  const offenders = rules.filter((rule) => BOOLEAN_KEYS.has(rule.key) && rule.invert === undefined)

  if (offenders.length > 0) {
    const list = offenders.map((r) => `${r.key} ${r.test}`).join(", ")
    throw new Error(
      `Match rules targeting a boolean key must declare invert explicitly. Missing on: ${list}`
    )
  }
}

const ALL_RULES: MatchRule[] = [
  ...RULES,
  ...DATE_RULES.education,
  ...DATE_RULES.work,
  ...DATE_RULES.default
]

/**
 * Resolve a field to a profile key.
 *
 * `extraRules` come from the adapter and are considered alongside the shared
 * ones, competing on weight rather than jumping the queue, so an adapter
 * cannot accidentally shadow a high-confidence shared rule with a vague one.
 */
export function match(
  field: FieldSpec,
  extraRules: readonly MatchRule[] = [],
  adapterKey?: (el: Element) => ProfileKey | null
): MatchResult | null {
  const label = canonical(field.label)
  const section = sectionKind(field.section)

  // A site's own semantic identifier beats everything, including autocomplete:
  // it is exact rather than inferred.
  const declared = adapterKey?.(field.el as Element) ?? null
  if (declared) {
    // Through applySection like every other route. Workday uses the same
    // automation id for the dates in a work panel and an education panel, so
    // one mapping serves both and which block the field sits in decides which
    // key it is. Returning the declared key raw put a job's start date into
    // the education entry.
    return { key: applySection(declared, section), invert: false, rule: "adapter key" }
  }

  // A standard autocomplete token beats prose, and works even when the label
  // resolver came up empty.
  const fromAutocomplete = byAutocomplete(field)
  if (fromAutocomplete) {
    return {
      key: applySection(fromAutocomplete, section),
      invert: false,
      rule: "autocomplete"
    }
  }

  if (!label) return null

  // File inputs are resumes unless labelled otherwise. Greenhouse and Lever
  // both ship file inputs whose only label is the word "Attach".
  if (field.kind === "file" && !/cover\s+letter|transcript|portfolio/.test(label)) {
    return { key: "resume", invert: false, rule: "file input" }
  }

  const dateRules =
    field.kind === "date" || field.kind === "month" || /\bdate\b|\byear\b|\bmonth\b/.test(label)
      ? DATE_RULES[section === "education" || section === "work" ? section : "default"]
      : []

  const candidates = [...extraRules, ...RULES, ...dateRules]

  // A question that merely mentions a field's keyword is not that field. See
  // MatchRule.allowOnQuestion.
  const question = isQuestion(field.label)

  let best: MatchResult | null = null
  let bestWeight = -1

  for (const rule of candidates) {
    if (question && !rule.allowOnQuestion) continue
    if (!rule.test.test(label)) continue
    if (DISQUALIFIERS[rule.key]?.test(label)) continue

    const weight = rule.weight ?? 50
    if (weight <= bestWeight) continue

    best = {
      key: applySection(rule.key, section),
      invert: rule.invert ?? false,
      rule: String(rule.test)
    }
    bestWeight = weight
  }

  return best
}

/**
 * Labels that veto a key the weighted rules would otherwise award.
 *
 * "Phone Extension" contains the word "phone", nothing in the profile is a
 * closer match, and so the phone rule wins on weight and Ditto writes a full
 * ten-digit number into a box that wants three. Workday, Greenhouse and Lever
 * all ship this field.
 *
 * There is no extension in the profile, so the right answer is no key at all.
 * That puts the field in NEEDS YOU, where the user leaves it blank in the
 * normal case and types four digits in the rare one. A veto rather than a
 * lower weight, because the failure is not "matched the wrong key" but
 * "matched a key whose value does not belong in this box at any confidence".
 */
const DISQUALIFIERS: Partial<Record<ProfileKey, RegExp>> = {
  "personal.phone": /\bext(?:ension)?\b/
}

/**
 * A field inside a work block labelled "School" is almost certainly mislabeled
 * by our own heuristics rather than genuinely about education, but the reverse
 * is common and harmless. This only rewrites keys where the section is
 * unambiguous and the key is a repeatable one.
 */
function applySection(key: ProfileKey, section: SectionKind): ProfileKey {
  // A "Country" control inside a phone fieldset is the dialling code, not a
  // mailing address. Greenhouse ships exactly this: a react-select labelled
  // "Country" nested inside `<fieldset class="phone-input"><legend>Phone`.
  // Writing a mailing country into it puts the wrong value on the form and
  // leaves the real address country empty.
  if (section === "phone" && (key === "personal.country" || key === "personal.state")) {
    return "personal.phoneCountryCode"
  }

  if (section === "work" && key.startsWith("education[].")) {
    const field = key.split(".")[1]
    const mapped = `work[].${field}` as ProfileKey
    return (["work[].startDate", "work[].endDate", "work[].location"] as string[]).includes(mapped)
      ? mapped
      : key
  }

  return key
}

export { RULES, DATE_RULES, ALL_RULES }
