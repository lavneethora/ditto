import type { ProfileKey } from "../types"

/**
 * How a form might ask for each thing, in its own words.
 *
 * These are embedded at build time and shipped as vectors. A label Ditto's
 * rules do not recognise is embedded at run time and compared against them, so
 * these phrasings are the entire vocabulary of the semantic tier: a key with
 * no entry here can never be reached by it.
 *
 * Written as questions and labels a real form uses, not as descriptions of the
 * profile field. The comparison is between two pieces of form English, and
 * "the applicant's postal code" is not form English.
 *
 * Left out on purpose:
 *
 *  - `eligibility.*` and `eeo.*`. A wrong answer there is a false statement on
 *    a legal document, and the measurement that set the threshold showed
 *    exactly why: "Are you a citizen of any one of these countries: Cuba,
 *    Iran, North Korea, or Syria" scored 0.542 against "country of
 *    citizenship", higher than several correct matches. The model reads it as
 *    asking WHICH citizenship. Those questions are answered by rules, or by
 *    the user teaching them.
 *  - `forms.acceptTerms`, which is a decision rather than a lookup.
 *  - `personal.hasPreferredName` and `work[].current`, which are booleans
 *    whose meaning turns on a negation the model does not reliably carry.
 */
export const PHRASINGS: Partial<Record<ProfileKey, string[]>> = {
  "personal.firstName": ["first name", "given name", "what is your first name"],
  "personal.middleName": ["middle name", "middle initial"],
  "personal.lastName": ["last name", "surname", "family name"],
  "personal.fullName": ["full name", "your name as it appears on legal documents"],
  "personal.preferredFirstName": ["preferred first name", "what name do you go by"],
  "personal.preferredLastName": ["preferred last name"],
  "personal.email": ["email address", "how can we email you"],
  "personal.phone": ["phone number", "how may we reach you by telephone", "mobile number"],
  "personal.phoneType": ["phone type", "is this a mobile or home number"],
  "personal.phoneCountryCode": ["phone country code", "dialling code"],
  "personal.addressLine1": ["street address", "address line 1", "where do you live"],
  "personal.addressLine2": ["address line 2", "apartment or suite number"],
  "personal.city": ["city", "which city do you live in", "town"],
  "personal.state": ["state", "province", "which state do you live in"],
  "personal.county": ["county"],
  "personal.location": ["where are you located", "your current location", "city and state"],
  "personal.postalCode": ["postal code", "zip code", "postcode"],
  "personal.country": ["country", "which country do you live in"],
  "personal.linkedin": ["linkedin profile", "your professional profile link"],
  "personal.github": ["github profile", "link to your code"],
  "personal.website": ["personal website", "portfolio link"],
  "personal.link": ["another link you would like to share"],

  "education[].school": [
    "school",
    "university or college attended",
    "where did you go to school",
    "name of institution"
  ],
  "education[].degree": [
    "degree",
    "qualification obtained",
    "highest level of education completed"
  ],
  "education[].major": ["major", "field of study", "what did you study", "discipline"],
  "education[].gpa": ["grade point average", "your final grade"],
  "education[].startDate": ["when did you start studying", "education start date"],
  "education[].endDate": ["when did you graduate", "education end date", "graduation date"],

  "work[].company": [
    "company",
    "employer name",
    "who do you currently work for",
    "organisation you worked for"
  ],
  "work[].title": ["job title", "position held", "what is your current role called"],
  "work[].location": ["where was this job based", "job location"],
  "work[].startDate": ["when did you start this job", "employment start date"],
  "work[].endDate": ["when did you leave this job", "employment end date"],
  "work[].summary": ["what did you do in this role", "describe your responsibilities"],

  skills: ["skills", "what are you good at", "technologies you have used"],

  "preferences.willingToRelocate": ["are you willing to relocate", "would you move for this job"],
  "preferences.howDidYouHear": ["how did you hear about us", "where did you find this posting"],
  "preferences.desiredSalary": [
    "desired salary",
    "expected compensation",
    "what are your salary expectations"
  ],

  answers: ["is there anything else you would like us to know"],
  resume: ["resume", "please attach your cv", "upload your resume"]
}
