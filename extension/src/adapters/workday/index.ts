import { isCredentialField, isSubmitByName } from "~core/blocklist"
import { canonical } from "~core/label"
import type { Adapter, FieldKind, ProfileKey, RepeatableSection } from "~core/types"

/**
 * Workday.
 *
 * Hosted at `<tenant>.wd<N>.myworkdayjobs.com`, and the only one of the four
 * that gates the form behind an account. Applying is a wizard whose first step
 * is Create Account / Sign In, so on a fresh application the first thing Ditto
 * sees is a login form it must not touch.
 *
 * Two tenants are captured, in fixtures/workday-signin.html and
 * fixtures/workday-my-information.html, and the differences between them are
 * why both are kept. One wizard has seven steps and the other six, so the
 * count is per tenant and nothing may key off a position. The step name lives
 * in the progress bar on one and not the other; the `<h3>` heading is on both.
 *
 * The identifier is `data-automation-id="formField-<name>"` on the wrapper,
 * with the control repeating the name in its id. Compound fields nest with a
 * double dash: `formField-legalName--firstName`. That is Workday's equivalent
 * of Ashby's `data-field-path`, and it survives the emotion class names
 * (`css-1ez0plr`) that are regenerated every build and mean nothing.
 */

/** `formField-<name>` suffixes read off real pages, mapped to profile keys. */
const FIELD_NAMES: Record<string, ProfileKey> = {
  email: "personal.email",

  preferredCheck: "personal.hasPreferredName",
  "preferredName--firstName": "personal.preferredFirstName",
  "preferredName--lastName": "personal.preferredLastName",

  "legalName--firstName": "personal.firstName",
  "legalName--middleName": "personal.middleName",
  "legalName--lastName": "personal.lastName",

  addressLine1: "personal.addressLine1",
  addressLine2: "personal.addressLine2",
  city: "personal.city",
  // Workday's name for the state box, which it labels "State" in the US and
  // "Province" elsewhere. The name is stable where the label is not.
  countryRegion: "personal.state",
  postalCode: "personal.postalCode",
  country: "personal.country",

  jobTitle: "work[].title",
  companyName: "work[].company",
  location: "work[].location",
  roleDescription: "work[].summary",
  currentlyWorkHere: "work[].current",
  // Both blocks use these names. applySection rewrites the education key to
  // the work one inside a work panel, so one mapping serves both.
  startDate: "education[].startDate",
  endDate: "education[].endDate",

  school: "education[].school",
  degree: "education[].degree",
  // Workday's "Field of Study" is the profile's major.
  fieldOfStudy: "education[].major",
  skills: "skills",
  // A bare URL box in the Websites section. Which link it wants is decided by
  // which panel it is in, not by anything the field says.
  url: "personal.link",

  phoneNumber: "personal.phone",
  phoneType: "personal.phoneType",
  countryPhoneCode: "personal.phoneCountryCode"
}

/**
 * Controls that exist to catch bots.
 *
 * `beecatcher` is a hidden text input named "website" whose label reads "This
 * input is for robots only, do not enter if you're human." A filler that
 * writes into every text input it finds fails the application silently, before
 * a person ever reads it, and the applicant is never told why.
 *
 * `click_filter` is an empty div with `role="button"` and `aria-label="Submit"`
 * layered over the real submit button, which Workday hides with `aria-hidden`
 * and `tabindex="-2"`.
 *
 * `phone-sms-opt-in` is not a trap, it is a marketing consent, and it belongs
 * in the same list for the same reason Lever's `consent[...]` boxes do:
 * agreeing to marketing texts on someone's behalf is not autofill.
 */
const NEVER_TOUCH = new Set(["beecatcher", "click_filter", "phone-sms-opt-in"])

/**
 * Entry panels inside a section.
 *
 * Only groups labelled by a HEADING. A panel points its `aria-labelledby` at
 * an `<h5>` reading "Work Experience 1"; the date controls inside it are also
 * `role="group"` with an `aria-labelledby`, pointing at a hidden value holder.
 *
 * Counting every nested group made one filled panel look like three, because
 * a job has two dates in it, so a profile with three jobs got one panel and
 * the growth stopped believing it was done.
 */
function countPanels(section: Element): number {
  const doc = section.ownerDocument

  return Array.from(section.querySelectorAll("[role='group'][aria-labelledby]")).filter((group) => {
    const label = doc.getElementById(group.getAttribute("aria-labelledby") ?? "")
    return Boolean(label?.matches("h1, h2, h3, h4, h5, h6"))
  }).length
}

/**
 * Workday's own name for a skill, where it is not the obvious one.
 *
 * Every entry was read off a live Workday skills search, one term at a time,
 * rather than guessed. That mattered: a guessed name is worse than no entry,
 * because Ditto would type something the taxonomy does not have and a skill
 * that the scoring finds today would land in NEEDS YOU instead.
 *
 * What the enumeration showed is how often the plain name is not the top
 * result. "Go" returns Go-Carts. "PHP" returns phpBB. "R" returns SAP R.
 * "AWS" returns AWS VPN. Each of those is a skill Ditto would have had to
 * out-rank by scoring, and scoring is what has repeatedly broken a
 * neighbouring skill while fixing one.
 *
 * Skills NOT listed here are the normal case and go through the matcher
 * unchanged: PyTorch, OpenCV, Kubernetes, Linux, TypeScript, Selenium, Git,
 * Qiskit and the rest are already their own top result.
 */
const SKILL_LABELS: Record<string, string> = {
  // Languages. Every one of these has a near neighbour that a plain search
  // ranks above it: "Go" returns Go-Carts, "PHP" returns phpBB, "R" returns
  // SAP R, and "C" returns C NMR.
  c: "C (Programming Language)",
  "c++": "C++ Programming Language",
  "c#": "C Sharp (Programming Language)",
  "c sharp": "C Sharp (Programming Language)",
  java: "Java (Programming Language)",
  python: "Python (Programming Language)",
  go: "Go Programming Language",
  golang: "Go Programming Language",
  php: "PHP (Programming Language)",
  ruby: "Ruby (Programming Language)",
  kotlin: "Kotlin Programming Language",
  r: "R Programming",
  sql: "Structured Query Language (SQL)",
  html: "Hyper Text Markup Language (HTML)",

  // Libraries and frameworks.
  react: "React.js",
  "react js": "React.js",
  vue: "Vuejs",
  express: "Express.js",
  flask: "Flask (Web Framework)",
  pandas: "Pandas (Software)",
  numpy: "Python Numpy",
  matplotlib: "Python Matplotlib",

  // Tools and platforms.
  docker: "Docker (Software)",
  aws: "Amazon Web Services (AWS)",
  azure: "Microsoft Azure",
  jupyter: "Jupyter Notebook",
  excel: "Microsoft Excel",
  tableau: "Tableau (Software)",
  "power bi": "Microsoft Power Business Intelligence (PBI)",
  jira: "Atlassian JIRA",
  matlab: "MATLAB"
}

function automationId(el: Element): string {
  return el.getAttribute("data-automation-id") ?? ""
}

/**
 * The `<name>` half of the enclosing `formField-<name>` wrapper.
 *
 * The wrapper is asked first. A composite control has an automation id of its
 * own that names the WIDGET rather than the field: a date group is
 * `dateInputWrapper` whichever date it holds, so reading its own id first
 * meant From and To were indistinguishable and neither matched anything.
 *
 * Falls back to the element's own id for the resume, whose wrapper is
 * `formField-` with nothing after it.
 */
function fieldName(el: Element): string {
  const wrapper = el.closest("[data-automation-id^='formField-']")
  const fromWrapper = wrapper?.getAttribute("data-automation-id")?.slice("formField-".length) ?? ""
  if (fromWrapper) return fromWrapper

  const own = automationId(el)
  return own.startsWith("formField-") ? own.slice("formField-".length) : own
}

/**
 * The bare text input that sits beside a listbox button holding its GUID.
 *
 * Workday renders Country, State and Phone Device Type as a
 * `<button aria-haspopup="listbox">` showing the display value, next to an
 * unlabelled `<input type="text">` whose value is the internal key Workday
 * actually submits. To a scanner that input looks like an ordinary text box
 * with no label, so Ditto would type "Texas" into a field that wants
 * `fc77e3a1ab36487f9646d14f7242dd77`, and the form would either reject it or
 * quietly submit a string where a key belongs.
 *
 * Identified structurally rather than by class name: no id, no name, and a
 * listbox button for a sibling.
 */
function isShadowValueInput(el: Element): boolean {
  if (!(el instanceof HTMLInputElement) || el.type !== "text") return false
  if (el.id || el.name) return false

  return Boolean(el.parentElement?.querySelector("button[aria-haspopup='listbox']"))
}

/** Workday's own multiselect: a search box, not a text field. */
function isMultiselectSearch(el: Element): boolean {
  return el.getAttribute("data-uxi-widget-type") === "selectinput"
}

export const workday: Adapter = {
  id: "workday",
  name: "Workday",

  // Only what the manifest actually grants. An adapter that claims a host
  // the content script never runs on is a promise the build cannot keep.
  hosts: [/(^|\.)myworkdayjobs\.com$/],

  detect(doc) {
    return Boolean(
      doc.querySelector(
        "[data-automation-id='applyFlowPage'], [data-automation-id='jobSearchPage'], [data-uxi-widget-type]"
      )
    )
  },

  root(doc) {
    return doc.querySelector<HTMLElement>("[data-automation-id='applyFlowPage']") ?? doc.body
  },

  /**
   * The sections that hold a list and can be grown.
   *
   * Workday ships Work Experience, Certifications, Languages and Websites as a
   * heading and an "Add" button with nothing behind them, and Education as one
   * panel with "Add Another" below it. Only the three the profile has answers
   * for are claimed here; Certifications and Languages stay the user's,
   * because Ditto has nothing to put in them.
   *
   * Panels are counted as nested groups. The section itself is a
   * `role="group"` labelled "Education", and each entry inside it is another
   * labelled "Education 1".
   */
  repeatables(doc): RepeatableSection[] {
    const sections: RepeatableSection[] = []

    for (const group of doc.querySelectorAll("[role='group'][aria-labelledby]")) {
      const heading = doc.getElementById(group.getAttribute("aria-labelledby") ?? "")
      const name = heading?.textContent?.trim().toLowerCase() ?? ""

      const collection =
        name === "work experience"
          ? "work"
          : name === "education"
            ? "education"
            : name === "websites"
              ? "websites"
              : null
      if (!collection) continue

      const add = group.querySelector<HTMLElement>("[data-automation-id='add-button']")
      if (!add) continue

      sections.push({ collection, present: countPanels(group), add })
    }

    return sections
  },

  /**
   * Which step is on screen.
   *
   * The heading, not the progress bar. One captured tenant puts the step name
   * in `progressBarActiveStep` beside an aria-live "current step 1 of 7"; the
   * other puts only the announcement there and no name at all. Both render the
   * name as the `<h3>`, which is also the thing the user is looking at.
   */
  step(doc) {
    const heading = doc.querySelector("[data-automation-id='applyFlowPage'] h3")
    return heading?.textContent?.trim() || null
  },

  /**
   * The button that advances the wizard, for the user to click.
   *
   * Guarded, because on the last step this same footer button says "Submit".
   * The drawer clicks whatever this returns when the user asks it to, so
   * returning the submit control would turn Ditto's own UI into the thing
   * non-negotiable 1 exists to prevent.
   */
  nextControl(doc) {
    const button = doc.querySelector<HTMLElement>("[data-automation-id='pageFooterNextButton']")
    if (!button) return null

    // By its words, not its type. Every footer button in the wizard is a
    // submit button by the HTML default, including the six that say "Save and
    // Continue", so the type attribute cannot tell the last step from the
    // others and refusing all of them leaves the user unable to advance.
    if (isSubmitByName(button) || isCredentialField(button)) return null

    return button
  },

  /**
   * Only skills, and only where the site's name differs from the obvious one.
   *
   * Left deliberately narrow. A wrong entry here would type a name the tenant
   * does not have; the search would then simply fail and hand the field back
   * to the user, which is a worse outcome than the scoring having found it.
   */
  alias(value, key): string | null {
    if (key !== "skills") return null
    return SKILL_LABELS[canonical(value)] ?? null
  },

  key(el): ProfileKey | null {
    return FIELD_NAMES[fieldName(el)] ?? null
  },

  /**
   * Correct the widgets whose markup understates them.
   *
   * The listbox buttons already scan as comboboxes on their `aria-haspopup`.
   * The multiselect does not: its search box is a plain `<input>` with a
   * placeholder of "Search" and no aria wiring, so it reads as a text field.
   * Typed text there is a query, never a value, and Workday discards it on
   * blur exactly the way Lever's typeahead does.
   */
  kind(el): FieldKind | null {
    if (isMultiselectSearch(el)) return "combobox"
    return null
  },

  /**
   * Refuse the whole sign-in step, the bot traps, the consent box, and the
   * hidden GUID inputs.
   *
   * The sign-in exclusion covers more than the password. The email box beside
   * it is an ordinary text input with `autocomplete="email"`, and Ditto holds
   * an email address, so nothing else would stop it typing the user's identity
   * into an authentication screen. Creating the account stays the user's job;
   * Ditto picks up at My Information.
   */
  ignore(el) {
    if (NEVER_TOUCH.has(automationId(el))) return true
    if (el.closest("[data-automation-id='signInContent']")) return true
    if (isShadowValueInput(el)) return true

    // The pill list showing what is already chosen in a multiselect. It
    // carries role="listbox", so a scanner reads it as a second control
    // sitting inside the first, and it has no label of its own, so it borrows
    // the section heading. On the phone block that produced a phantom field
    // called "Phone" that resolved to the phone number and would have been
    // filled twice, once into a real box and once into a display element.
    if (el.getAttribute("data-automation-id") === "selectedItemList") return true

    return false
  }
}
