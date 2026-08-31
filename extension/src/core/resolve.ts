import { COUNTRIES } from "~profile/geo"
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
  /**
   * Nothing on file. Reported as SKIPPED.
   *
   * This is also how a voluntary question gets declined: leaving it on "Not
   * answered" resolves to `none`, so Ditto skips it. There is no separate
   * opt-out state, because a standing refusal would leave a required field
   * blank on the forms that mark these questions required.
   */
  | { kind: "none"; reason: string }
  /** Recognized but only the user can answer. Reported as NEEDS YOU. */
  | { kind: "needs_you"; reason: string }

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

  const p = profile.personal
  const index = field.repeatIndex

  switch (key) {
    // --- Booleans. The only place `invert` is applied. ----------------------

    case "preferences.howDidYouHear":
      return text(profile.preferences.howDidYouHear, "answer for how you heard about them")

    case "preferences.desiredSalary":
      return text(profile.preferences.desiredSalary, "desired salary")

    /**
     * The disclosure toggle in front of the preferred-name boxes.
     *
     * Ticking it is what makes those boxes exist, so it is answered from
     * whether there is a preferred name to put in them. Unlike the others
     * here it is never null: no preferred name saved means the honest answer
     * is no, not "unanswered".
     */
    case "personal.hasPreferredName":
      return { kind: "boolean", value: invert ? !profile.personal.hasPreferredName : profile.personal.hasPreferredName }

    /**
     * Eligibility, read from the stored status rather than inferred.
     *
     * A form asking about citizenship and one asking "citizen, permanent
     * resident, or protected person" are different questions. Each key below
     * reads the same fact and answers only what it was asked. A status of
     * "none of these", or none saved at all, answers nothing: it goes to the
     * user, because a wrong answer here is a false statement on a legal
     * document. See PRD 5.2.
     */
    case "eligibility.usCitizen":
    case "eligibility.permanentResident":
    case "eligibility.citizenOrResidentOrProtected": {
      const status = profile.eligibility.status
      if (status === null) return { kind: "none", reason: "No work status saved" }

      const answer =
        key === "eligibility.usCitizen"
          ? status === "citizen"
          : key === "eligibility.permanentResident"
            ? status === "permanentResident"
            : status === "citizen" || status === "permanentResident" || status === "protected"

      return { kind: "boolean", value: invert ? !answer : answer }
    }

    case "eligibility.atLeast18": {
      const answer = profile.eligibility.atLeast18
      if (answer === null) return { kind: "none", reason: "Not answered in your profile" }

      return { kind: "boolean", value: invert ? !answer : answer }
    }

    case "eligibility.residentOutsideUS": {
      const answer = profile.eligibility.residentOutsideUS
      if (answer === null) return { kind: "none", reason: "Not answered in your profile" }

      return { kind: "boolean", value: invert ? !answer : answer }
    }

    case "eligibility.residentCountry":
      return text(profile.eligibility.residentCountry, "country of residence")

    /**
     * Accepting the terms of applying, which has one answer.
     *
     * Answered from the act of applying rather than from the profile. Ditto
     * never submits, so the user still sees this ticked and still chooses
     * whether to send the application.
     */
    case "forms.acceptTerms":
      return { kind: "boolean", value: invert ? false : true }

    case "eligibility.citizenships": {
      const held = profile.eligibility.citizenships.filter((c) => c.trim())
      if (held.length === 0) return { kind: "none", reason: "No citizenship saved" }

      /**
       * Three shapes, because forms ask for this three ways.
       *
       * Workday's is "Please add your Country of Citizenship or Countries of
       * Citizenship if dual", which is a multi-select and wants every
       * passport. A single dropdown can only take one. A text box takes the
       * lot as a sentence.
       */
      if (field.kind === "multiselect") return { kind: "list", value: held }

      return field.kind === "combobox" || field.kind === "select"
        ? { kind: "text", value: held[0] }
        : { kind: "text", value: held.join(", ") }
    }

    /**
     * "Are you a citizen of any one of these countries: Cuba, Iran, North
     * Korea, or Syria?"
     *
     * Answered by reading the countries out of the question and checking them
     * against the passports on file. That is a stored fact being compared,
     * not a guess: a Yes here is an export control declaration and a No is a
     * legal statement, so neither may be inferred from something adjacent.
     * Permanent residency in India, for instance, settles nothing.
     *
     * Refuses in three cases, each of which would otherwise produce a
     * confident wrong answer:
     *
     *  - No citizenship saved. Nothing to compare.
     *  - No country recognised in the question. "A country in the EU/EFTA"
     *    names a region, and answering it would mean knowing the membership
     *    list rather than reading one.
     *  - A citizenship on file that is not a country this build knows, so
     *    "not in the list" might only mean "not in our list".
     */
    case "eligibility.citizenOfNamedCountries": {
      const held = profile.eligibility.citizenships.map((c) => canonical(c)).filter(Boolean)
      if (held.length === 0) return { kind: "none", reason: "No citizenship saved" }

      const known = new Set(COUNTRIES.map((c) => canonical(c)))
      if (held.some((c) => !known.has(c))) {
        return {
          kind: "needs_you",
          reason: "One of your saved citizenships is not a country Ditto can check against"
        }
      }

      const asked = canonical(field.label)
      const named = COUNTRIES.filter((country) => {
        const name = canonical(country)
        return new RegExp(`(?:^|\\s)${name}(?:$|\\s)`).test(asked)
      })

      if (named.length === 0) {
        return { kind: "needs_you", reason: "This question does not name countries Ditto can read" }
      }

      const isOne = named.some((country) => held.includes(canonical(country)))

      return { kind: "boolean", value: invert ? !isOne : isOne }
    }

    /**
     * Non-competes, non-solicits and the rest.
     *
     * One key, two shapes, because forms ask this both ways and often in one
     * breath: "Are you bound by any agreements...? If yes, share the specific
     * type of agreement and when it expires." A toggle gets the boolean; a
     * box gets what the user actually wrote, since "Yes" alone does not
     * answer a question asking which agreement and until when.
     */
    case "eligibility.boundByAgreements": {
      const bound = profile.eligibility.boundByAgreements
      if (bound === null) return { kind: "none", reason: "Not answered in your profile" }

      if (field.kind === "text" || field.kind === "textarea") {
        const detail = profile.eligibility.agreementDetails.trim()
        if (bound && !detail) {
          return { kind: "needs_you", reason: "Add the agreement details to your profile" }
        }

        return { kind: "text", value: bound ? detail : "No" }
      }

      return { kind: "boolean", value: invert ? !bound : bound }
    }

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

    case "eeo.lgbtq":
      return profile.eeo.lgbtq
        ? { kind: "tristate", value: profile.eeo.lgbtq }
        : { kind: "none", reason: "Not answered in your profile" }

    case "eeo.gender":
      return text(profile.eeo.gender, "gender")

    case "eeo.race": {
      const saved = profile.eeo.race.trim()
      if (!saved) return { kind: "none", reason: "No race or ethnicity saved" }

      /**
       * Workday asks this as a multi-select, because "Two or More Races" is
       * an answer someone gives by picking two.
       *
       * The stored value is one string, so this offers it as a list of one
       * rather than as text the multi-select has no way to accept.
       */
      return field.kind === "multiselect"
        ? { kind: "list", value: [saved] }
        : { kind: "text", value: saved }
    }

    case "eeo.sexualOrientation":
      return text(profile.eeo.sexualOrientation, "sexual orientation")

    case "eeo.pronouns":
      return text(profile.eeo.pronouns, "pronouns")

    // --- Personal -----------------------------------------------------------

    case "personal.firstName":
      return text(p.firstName, "first name")
    case "personal.middleName":
      return text(p.middleName, "middle name")
    case "personal.lastName":
      return text(p.lastName, "last name")
    case "personal.fullName":
      return text([p.firstName, p.lastName].filter(Boolean).join(" "), "name")
    /**
     * The preferred name if there is one, otherwise the legal one.
     *
     * Falling back per FIELD, not per person. Someone who goes by a different
     * first name usually keeps their surname, so ticking "I have a preferred
     * name" and filling only the first left every "Preferred Last Name" box
     * empty, and a required one then failed the form on submit.
     *
     * A required field asking for a preferred surname is asking what to call
     * you, and the legal surname is the truthful answer when there is no
     * other.
     */
    case "personal.preferredFirstName":
      return text(
        (p.hasPreferredName && p.preferredFirstName.trim()) || p.firstName,
        "preferred first name"
      )
    case "personal.preferredLastName":
      return text(
        (p.hasPreferredName && p.preferredLastName.trim()) || p.lastName,
        "preferred last name"
      )
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
    case "personal.location":
      // Derived, like personal.fullName, rather than stored again. Lever's
      // "Current location" wants a place, and the profile already holds the
      // pieces: storing a second copy is a second thing to keep in sync.
      return text([p.city, p.state].filter(Boolean).join(", "), "city and state")

    case "personal.county":
      return text(p.county, "county")
    case "personal.postalCode":
      return text(p.postalCode, "postal code")
    case "personal.country":
      return text(p.country, "country")
    case "personal.linkedin":
      return text(p.linkedin, "LinkedIn URL")
    case "personal.github":
      return text(p.github, "GitHub URL")
    case "personal.website":
      return text(p.website, "website URL")

    /**
     * The nth link, for a section that asks for URLs without saying which.
     *
     * Ordered the way the profile lists them, so panel one gets LinkedIn.
     * Running out of links is nothing on file rather than a failure: a form
     * offering four boxes to someone with two links is not broken.
     */
    case "personal.link": {
      const links = [p.linkedin, p.github, p.website].filter((link) => link.trim().length > 0)
      return text(links[index ?? 0], "link")
    }

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
    /**
     * "I currently work here", which is stored per entry rather than as one
     * profile-wide fact, so it is answered from the entry this field sits in.
     */
    case "work[].current": {
      const entry = nth(profile.work, index)
      return { kind: "boolean", value: invert ? !entry?.current : Boolean(entry?.current) }
    }

    /**
     * The paragraph if there is one, otherwise the bullets as lines.
     *
     * The two are stored separately on purpose, because a Workday textarea
     * wants prose and a resume-style box wants lines. But an empty paragraph
     * next to a filled bullet list is not "nothing on file", and reporting it
     * that way left every Role Description on a three job history blank while
     * the user could see the bullets sitting in their profile.
     */
    case "work[].summary": {
      const entry = nth(profile.work, index)
      const bullets = (entry?.bullets ?? []).filter((line) => line.trim().length > 0)

      if (entry?.summary?.trim()) return text(entry.summary, "experience summary")

      return bullets.length > 0
        ? { kind: "text", value: bullets.join("\n") }
        : { kind: "none", reason: "No experience summary saved" }
    }
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
  // Text inputs count, not just textareas. Greenhouse renders "When is the
  // earliest you would want to start working with us?" as a single-line input,
  // so restricting this to textareas made the saved answer for exactly that
  // question unreachable.
  if (field.kind !== "textarea" && field.kind !== "text") {
    return { kind: "needs_you", reason: "Ditto does not recognise this field" }
  }

  return matchSavedAnswer(profile, field.label)
}
