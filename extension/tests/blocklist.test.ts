import { beforeEach, describe, expect, it } from "vitest"

import { ADAPTERS } from "~adapters"
import { assertAllowed, isCredentialField, isForbidden, isSubmitByName, isSubmitControl } from "~core/blocklist"
import { typeInto, safeClick } from "~core/fill/dom"
import { scan } from "~core/scan"

/**
 * Guards PRD non-negotiables 1 and 2: Ditto never submits an application and
 * never touches credentials.
 *
 * Both are enforced in the fill layer rather than by adapter discipline,
 * because the cost is asymmetric. A false positive sends one field to NEEDS
 * YOU and the user types it. A false negative submits an unreviewed
 * application, or types into a password box.
 */

function el(html: string): Element {
  const host = document.createElement("div")
  host.insertAdjacentHTML("afterbegin", html)
  return host.firstElementChild!
}

beforeEach(() => {
  document.body.replaceChildren()
})

describe("submit controls", () => {
  const SUBMITTERS = [
    `<button type="submit">Continue</button>`,
    `<input type="submit" value="Apply" />`,
    `<button>Submit Application</button>`,
    `<button>Submit</button>`,
    `<button>Apply Now</button>`,
    `<a role="button">Send Application</a>`,
    `<button>Confirm and Submit</button>`,
    `<button data-qa="btn-submit">Continue</button>`,
    `<button>Sign In</button>`,
    `<button>Create Account</button>`,
    `<button>Register</button>`,
    `<button>Delete</button>`
  ]

  it.each(SUBMITTERS)("refuses %s", (html) => {
    expect(isSubmitControl(el(html))).toBe(true)
    expect(isForbidden(el(html))).toBe(true)
  })

  it("allows an ordinary non-submitting button", () => {
    expect(isSubmitControl(el(`<button type="button">Add another</button>`))).toBe(false)
    expect(isSubmitControl(el(`<button type="button">+ Add Education</button>`))).toBe(false)
  })
})

describe("credential fields", () => {
  const CREDENTIALS = [
    `<input type="password" name="password" />`,
    `<input type="text" name="confirm_password" />`,
    `<input type="text" autocomplete="current-password" />`,
    `<input type="text" autocomplete="one-time-code" />`,
    `<input type="text" name="ssn" />`,
    `<input type="text" aria-label="Social Security Number" />`,
    `<input type="text" name="cc-number" autocomplete="cc-number" />`,
    `<input type="text" aria-label="Verification code" />`,
    `<input type="text" aria-label="Passport Number" />`,
    `<input type="text" name="routing_number" />`
  ]

  it.each(CREDENTIALS)("refuses %s", (html) => {
    expect(isCredentialField(el(html))).toBe(true)
    expect(isForbidden(el(html))).toBe(true)
  })

  it("allows ordinary application fields", () => {
    expect(isCredentialField(el(`<input name="first_name" />`))).toBe(false)
    expect(isCredentialField(el(`<input name="email" type="email" />`))).toBe(false)
    expect(isCredentialField(el(`<input name="phone" type="tel" />`))).toBe(false)
  })
})

describe("the fill layer refuses to act on forbidden controls", () => {
  it("throws rather than typing into a password field", () => {
    const input = el(`<input type="password" name="password" />`) as HTMLInputElement
    document.body.append(input)

    expect(() => typeInto(input, "hunter2")).toThrow(/refused/i)
    expect(input.value).toBe("")
  })

  it("throws rather than clicking a submit button", () => {
    const button = el(`<button type="submit">Submit Application</button>`) as HTMLButtonElement
    document.body.append(button)

    let clicked = false
    button.addEventListener("click", () => {
      clicked = true
    })

    expect(() => safeClick(button)).toThrow(/refused/i)
    expect(clicked).toBe(false)
  })

  it("assertAllowed passes an ordinary field through", () => {
    expect(() => assertAllowed(el(`<input name="first_name" />`))).not.toThrow()
  })
})

describe("the scanner never surfaces a forbidden control", () => {
  it("drops password and submit controls before they become fields", () => {
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<form id="application_form">
         <label for="first_name">First Name</label>
         <input id="first_name" name="first_name" />
         <label for="pw">Password</label>
         <input id="pw" type="password" name="password" />
         <input type="submit" value="Submit Application" />
         <button type="submit">Apply Now</button>
       </form>`
    )

    const fields = scan(document)
    const labels = fields.map((f) => f.label)

    expect(labels).toContain("First Name")
    expect(labels).not.toContain("Password")
    expect(fields.every((f) => !isForbidden(f.el))).toBe(true)
  })
})

describe("no adapter can route a submit control into the filler", () => {
  it("every adapter's ignore and root leave submit controls unscanned", () => {
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<form id="application_form">
         <input id="email" name="email" />
         <label for="email">Email</label>
         <button type="submit">Submit Application</button>
       </form>`
    )

    for (const adapter of ADAPTERS) {
      const fields = scan(document, adapter)
      expect(fields.some((f) => isSubmitControl(f.el))).toBe(false)
      expect(fields.some((f) => isCredentialField(f.el))).toBe(false)
    }
  })
})

describe("telling a wizard's Next button from its Submit button", () => {
  /**
   * Workday leaves every footer button at the HTML default of type=submit and
   * distinguishes them only by what they say: six steps read "Save and
   * Continue" and the last reads "Submit". A check that folds the type in
   * cannot tell them apart, so it either refuses all of them, leaving the user
   * unable to advance, or allows all of them, which submits the application.
   */

  const button = (text: string, attrs: Record<string, string> = {}) => {
    const el = document.createElement("button")
    el.textContent = text
    for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value)
    return el
  }

  it("reads Save and Continue as a navigation, by its words", () => {
    const next = button("Save and Continue", { "data-automation-id": "pageFooterNextButton" })

    expect(isSubmitByName(next)).toBe(false)
    // And still refused by the full check, which sees the implicit submit
    // type. Only nextControl, driven by a click the user made, uses the
    // by-name check.
    expect(isSubmitControl(next)).toBe(true)
  })

  it("reads Submit as a submit whatever else it carries", () => {
    expect(isSubmitByName(button("Submit"))).toBe(true)
    expect(isSubmitByName(button("Submit Application"))).toBe(true)
  })

  it("is not fooled by a type attribute into calling Next a submit", () => {
    // The old check joined the type attribute into the same string it pattern
    // matched, so type="submit" put the word "submit" in the haystack and
    // every button in the wizard came back forbidden.
    expect(isSubmitByName(button("Save and Continue", { type: "submit" }))).toBe(false)
  })

  it("still refuses the words that mean sign in or destroy", () => {
    expect(isSubmitByName(button("Create Account"))).toBe(true)
    expect(isSubmitByName(button("Sign In"))).toBe(true)
    expect(isSubmitByName(button("Withdraw Application"))).toBe(true)
  })
})
