/**
 * Controls Ditto must never touch.
 *
 * PRD non-negotiables 1 and 2: Ditto never submits an application and never
 * goes near credentials. Both are enforced here, in the layer every fill and
 * every click has to pass through, rather than by asking each adapter to
 * remember.
 *
 * The rule is deliberately blunt. A false positive means one field goes to
 * NEEDS YOU and the user types it. A false negative means Ditto submits an
 * unreviewed application, or types into a password box. Those costs are not
 * remotely symmetric, so this errs heavily toward refusing.
 */

/** Matched against type, name, id, label and accessible name. */
const CREDENTIAL_PATTERN =
  /\b(password|passwd|pwd|new[\s_-]?password|confirm[\s_-]?password|current[\s_-]?password|otp|one[\s_-]?time|2fa|mfa|verification[\s_-]?code|security[\s_-]?(code|question|answer)|pin|ssn|social[\s_-]?security|sin\b|nino\b|national[\s_-]?insurance|passport[\s_-]?number|driver'?s?[\s_-]?licen[cs]e|credit[\s_-]?card|card[\s_-]?number|cvv|cvc|routing[\s_-]?number|account[\s_-]?number|iban|sort[\s_-]?code)\b/i

/** Matched against a control's text, value, name, id and data attributes. */
const SUBMIT_PATTERN =
  /\b(submit|send[\s_-]?application|apply[\s_-]?now|finish|complete[\s_-]?application|confirm[\s_-]?and[\s_-]?submit|sign[\s_-]?(in|up)|log[\s_-]?(in|out)|register|create[\s_-]?account|delete|withdraw)\b/i

/** Standalone words that only mean "submit" when they are the whole label. */
const SUBMIT_EXACT = new Set(["submit", "apply", "send", "finish", "done", "confirm"])

function textOf(el: Element): string {
  const parts = [
    el.getAttribute("type"),
    el.getAttribute("name"),
    el.getAttribute("id"),
    el.getAttribute("aria-label"),
    el.getAttribute("value"),
    el.getAttribute("data-qa"),
    el.getAttribute("data-automation-id"),
    el.getAttribute("autocomplete"),
    (el as HTMLElement).innerText ?? el.textContent
  ]

  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim()
}

/** True for anything that could authenticate, identify, or pay. */
export function isCredentialField(el: Element): boolean {
  if (el instanceof HTMLInputElement && el.type === "password") return true

  const autocomplete = el.getAttribute("autocomplete") ?? ""
  if (/(current|new)-password|one-time-code|cc-(number|csc|exp)/i.test(autocomplete)) return true

  return CREDENTIAL_PATTERN.test(textOf(el))
}

/**
 * An ARIA toggle: a button that records a choice rather than performing one.
 *
 * Ashby builds its Yes/No questions from two buttons carrying `aria-pressed`
 * and `data-option`, and leaves them at the HTML default of `type="submit"`
 * inside the form. By the spec those are submit buttons; they only behave as
 * toggles because Ashby calls preventDefault. Refusing them outright leaves a
 * required question permanently unanswerable, so they are allowed through
 * here and every click is wrapped in a submit guard by dom.ts.
 */
function isToggle(el: Element): boolean {
  if (el.hasAttribute("aria-pressed")) return true

  const role = el.getAttribute("role")
  return role === "radio" || role === "switch" || role === "checkbox"
}

/** True for anything that could submit, navigate away, or destroy data. */
export function isSubmitControl(el: Element): boolean {
  // Text is still checked below: a toggle labelled "Submit" is not a toggle.
  const toggle = isToggle(el)

  if (!toggle) {
    if (el instanceof HTMLInputElement && (el.type === "submit" || el.type === "image")) return true
    if (el instanceof HTMLButtonElement && el.type === "submit") return true
  }

  const text = textOf(el)
  const normalized = text.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim()

  if (SUBMIT_EXACT.has(normalized)) return true

  return SUBMIT_PATTERN.test(text)
}

/**
 * The single gate. Any element the engine is about to write to or click must
 * pass this first.
 */
export function isForbidden(el: Element): boolean {
  return isCredentialField(el) || isSubmitControl(el)
}

/** Thrown when something tries to route a forbidden element into the filler. */
export class ForbiddenControlError extends Error {
  constructor(el: Element) {
    const description = el.tagName.toLowerCase() + (el.getAttribute("name") ? `[name=${el.getAttribute("name")}]` : "")
    super(`Ditto refused to touch a submit or credential control: ${description}`)
    this.name = "ForbiddenControlError"
  }
}

/**
 * Assert an element is safe. Called at the top of every fill function, so a
 * blocklist miss surfaces as a loud failure rather than a submitted form.
 */
export function assertAllowed(el: Element): void {
  if (isForbidden(el)) throw new ForbiddenControlError(el)
}
