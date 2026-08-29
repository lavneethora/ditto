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
type SectionKind = "education" | "work" | "eeo" | undefined

function sectionKind(section: string | undefined): SectionKind {
  if (!section) return undefined

  const s = canonical(section)
  if (/(education|school|university|college|academic)/.test(s)) return "education"
  if (/(work|experience|employment|position|job history)/.test(s)) return "work"
  if (/(voluntary|self identify|disclosure|equal opportunity|demographic)/.test(s)) return "eeo"

  return undefined
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
    test: /\bwithout\s+(?:any\s+)?(?:company\s+|employer\s+|visa\s+|immigration\s+|the\s+need\s+for\s+)?sponsorship\b/,
    invert: true,
    weight: 100
  },
  {
    key: "eeo.requiresSponsorship",
    test: /\bnot\s+require\s+(?:visa\s+|employment\s+|employer\s+)?sponsorship\b/,
    invert: true,
    weight: 100
  },
  {
    key: "eeo.requiresSponsorship",
    test: /\b(?:require|requires|requiring|need|needs|needing|seek|seeking)\b[^.?]{0,40}\bsponsorship\b/,
    invert: false,
    weight: 90
  },
  {
    key: "eeo.requiresSponsorship",
    test: /\bsponsorship\b/,
    invert: false,
    weight: 50
  },
  {
    key: "eeo.authorizedUS",
    test: /\b(?:legally\s+)?(?:authorized|authorised|eligible|permitted)\b[^.?]{0,30}\bwork\b/,
    invert: false,
    weight: 80
  },
  {
    key: "eeo.authorizedUS",
    test: /\bwork\s+authorization\b|\bauthorization\s+to\s+work\b|\bright\s+to\s+work\b/,
    invert: false,
    weight: 80
  },

  // --- Voluntary demographic questions --------------------------------------

  { key: "eeo.hispanicLatino", test: /\bhispanic\b|\blatino\b|\blatinx\b/, weight: 90 },
  { key: "eeo.disability", test: /\bdisabilit(?:y|ies)\b|\bdisabled\b/, weight: 90 },
  { key: "eeo.veteran", test: /\bveteran\b|\bmilitary\s+service\b|\bprotected\s+veteran\b/, weight: 90 },
  { key: "eeo.gender", test: /\bgender\b|\bsex\b/, weight: 80 },
  { key: "eeo.race", test: /\brace\b|\bethnicit(?:y|ies)\b|\bracial\b|\bethnic\s+group\b/, weight: 80 },

  // --- Names ----------------------------------------------------------------

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

  { key: "links.linkedin", test: /\blinked\s?in\b/, weight: 100 },
  { key: "links.github", test: /\bgit\s?hub\b/, weight: 100 },
  {
    key: "links.portfolio",
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
  { key: "work[].title", test: /\bjob\s+title\b|\bposition\s+title\b|^title$|\brole\b/, weight: 85 },
  {
    key: "work[].summary",
    test: /\bdescription\b|\bsummary\b|\bresponsibilit(?:y|ies)\b|\bachievements\b/,
    weight: 70
  },
  { key: "work[].location", test: /\blocation\b/, weight: 60 },

  // --- Everything else ------------------------------------------------------

  { key: "skills", test: /\bskills?\b|\btechnolog(?:y|ies)\b|\bcompetenc(?:y|ies)\b/, weight: 80 },
  { key: "resume", test: /\bresume\b|\bcv\b|\bcurriculum\s+vitae\b/, weight: 90 },
  {
    key: "preferences.howDidYouHear",
    test: /\bhow\s+did\s+you\s+hear\b|\bhow\s+did\s+you\s+find\b|\breferral\s+source\b|\bsource\b/,
    weight: 90
  },
  {
    key: "preferences.desiredSalary",
    test: /\bsalary\b|\bcompensation\b|\bdesired\s+pay\b|\bpay\s+expectation\b/,
    weight: 85
  },
  { key: "preferences.willingToRelocate", test: /\brelocat/, invert: false, weight: 90 }
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
  default: [
    {
      key: "preferences.earliestStartDate",
      test: /\b(?:earliest\s+)?start\s+date\b|\bavailab|\bwhen\s+can\s+you\s+start\b|\bnotice\s+period\b/,
      weight: 80
    }
  ]
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
export function match(field: FieldSpec, extraRules: readonly MatchRule[] = []): MatchResult | null {
  const label = canonical(field.label)
  if (!label) return null

  const section = sectionKind(field.section)

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

  let best: MatchResult | null = null
  let bestWeight = -1

  for (const rule of candidates) {
    if (!rule.test.test(label)) continue

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
 * A field inside a work block labelled "School" is almost certainly mislabeled
 * by our own heuristics rather than genuinely about education, but the reverse
 * is common and harmless. This only rewrites keys where the section is
 * unambiguous and the key is a repeatable one.
 */
function applySection(key: ProfileKey, section: SectionKind): ProfileKey {
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
