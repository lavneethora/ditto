import type { Adapter, ProfileKey } from "~core/types"

/**
 * Workday.
 *
 * Hosted at `<tenant>.wd<N>.myworkdayjobs.com`, and the only one of the four
 * that gates the form behind an account. Applying is a seven-step wizard and
 * step 1 is Create Account / Sign In, so on a fresh application the first
 * thing Ditto sees is a login form it must not touch.
 *
 * Confirmed against a live tenant, captured in fixtures/workday-signin.html:
 *
 *   1 Create Account/Sign In    5 Voluntary Disclosures
 *   2 My Information            6 Self Identify
 *   3 My Experience             7 Review
 *   4 Application Questions
 *
 * The useful identifier is `data-automation-id`. Every field is a
 * `formField-<name>` wrapper around a control whose own automation id is
 * `<name>`, which is Workday's equivalent of Ashby's `data-field-path`: exact
 * where a label is an inference, and stable across the emotion class names
 * (`css-1wl1chj`) that are regenerated every build and carry no meaning.
 *
 * Steps 2 through 7 are behind the account, so their field names are not
 * captured yet and nothing here guesses at them. FIELD_NAMES holds only what
 * has been read off a real page; the mechanism is in place and the map grows
 * when the next fixture lands.
 */

/** `formField-<name>` suffixes seen on a real page, mapped to profile keys. */
const FIELD_NAMES: Record<string, ProfileKey> = {
  email: "personal.email"
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
 * and `tabindex="-2"`. The blocklist already refuses both on their labels;
 * naming them here means they never reach it.
 */
const TRAPS = new Set(["beecatcher", "click_filter"])

function automationId(el: Element): string {
  return el.getAttribute("data-automation-id") ?? ""
}

/** The `<name>` half of the enclosing `formField-<name>` wrapper. */
function fieldName(el: Element): string {
  const own = automationId(el)
  if (own && !own.startsWith("formField-")) return own

  const wrapper = el.closest("[data-automation-id^='formField-']")
  return wrapper?.getAttribute("data-automation-id")?.slice("formField-".length) ?? ""
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
   * Which of the seven steps is on screen.
   *
   * The active step's `<li>` holds two labels: an `aria-live` one announcing
   * "current step 2 of 7" and the name. Reading textContent off the list item
   * concatenates them, so this takes the last label, which is the name.
   */
  step(doc) {
    const active = doc.querySelector("[data-automation-id='progressBarActiveStep']")
    if (!active) return null

    const labels = active.querySelectorAll("label:not([aria-live])")
    return labels[labels.length - 1]?.textContent?.trim() || null
  },

  key(el): ProfileKey | null {
    return FIELD_NAMES[fieldName(el)] ?? null
  },

  /**
   * Refuse the whole sign-in step, and the bot traps everywhere.
   *
   * The blocklist would refuse the password on its own, but the email box
   * beside it is an ordinary text input with `autocomplete="email"`, and Ditto
   * holds an email address. Filling half a login form is not autofill, it is
   * the extension typing the user's identity into an authentication screen it
   * has no business on. Creating the account stays the user's job; Ditto picks
   * up at step 2.
   */
  ignore(el) {
    if (TRAPS.has(automationId(el))) return true
    if (el.closest("[data-automation-id='signInContent']")) return true

    return false
  }
}
