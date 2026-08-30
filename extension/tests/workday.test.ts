import { readFileSync } from "node:fs"
import { resolve as resolvePath } from "node:path"
import { beforeEach, describe, expect, it } from "vitest"

import { detectAdapter, workday } from "~adapters"
import { isForbidden } from "~core/blocklist"
import { scan } from "~core/scan"

/**
 * Workday step 1, captured from a live tenant.
 *
 * Every other adapter's test asks how much of a form it recognizes. This one
 * asks the opposite question, because step 1 of the Workday wizard is a login
 * screen and the correct score on it is zero. The account is the user's to
 * create; Ditto starts at step 2.
 */

const FIXTURE = readFileSync(resolvePath(__dirname, "../../fixtures/workday-signin.html"), "utf8")

beforeEach(() => {
  document.body.replaceChildren()
  document.body.insertAdjacentHTML("afterbegin", FIXTURE)
})

const byId = (id: string) => document.querySelector(`[data-automation-id='${id}']`)!

describe("detection", () => {
  it("recognizes a myworkdayjobs.com tenant by host", () => {
    expect(
      detectAdapter(document, "https://nvidia.wd5.myworkdayjobs.com/en-US/careers/job/1/apply")?.id
    ).toBe("workday")
  })

  it("recognizes the wizard by its markup on a proxied domain", () => {
    expect(workday.detect(document, "https://careers.example.com")).toBe(true)
  })

  it("scopes the scan to the wizard, not the page chrome", () => {
    expect(workday.root?.(document)?.getAttribute("data-automation-id")).toBe("applyFlowPage")
  })
})

describe("the sign-in step", () => {
  it("offers Ditto nothing to fill", () => {
    // Not "fills it carefully": fills none of it. A login screen is not a
    // form Ditto has any business on, and half a login form is worse than
    // none.
    expect(scan(document, workday)).toHaveLength(0)
  })

  it("leaves the email box alone even though it holds an email address", () => {
    // The password is refused by the blocklist on its own. The email beside
    // it is an ordinary text input with autocomplete="email", so nothing but
    // the adapter stops Ditto typing the user's identity into it.
    const email = byId("email")

    expect(isForbidden(email)).toBe(false)
    expect(workday.ignore?.(email)).toBe(true)
  })

  it("refuses the password outright", () => {
    expect(isForbidden(byId("password"))).toBe(true)
  })

  it("refuses the sign-in button and the account link", () => {
    expect(isForbidden(byId("signInSubmitButton"))).toBe(true)
    expect(isForbidden(byId("createAccountLink"))).toBe(true)
  })
})

describe("the bot traps", () => {
  it("never fills the honeypot", () => {
    // A hidden input named "website" whose label says it is for robots.
    // Writing to it fails the application silently and the applicant is
    // never told why.
    expect(workday.ignore?.(byId("beecatcher"))).toBe(true)
  })

  it("never clicks the overlay covering the submit button", () => {
    const filter = byId("click_filter")

    expect(workday.ignore?.(filter)).toBe(true)
    // Belt and braces: it carries aria-label="Submit", so the blocklist
    // refuses it too, on a page where no adapter has an opinion.
    expect(isForbidden(filter)).toBe(true)
  })
})

describe("the wizard", () => {
  it("reads the step name without the screen-reader announcement", () => {
    // The active step holds two labels: an aria-live "current step 1 of 7"
    // and the name. textContent concatenates them.
    expect(workday.step?.(document)).toBe("Create Account/Sign In")
  })

  it("reports no step on a page outside the wizard", () => {
    document.body.replaceChildren()
    expect(workday.step?.(document)).toBeNull()
  })
})

describe("field names", () => {
  it("reads the identifier off the formField wrapper, not the label", () => {
    // Workday's stable identifier, the way data-field-path is Ashby's. Proven
    // on the one field pair reachable without an account; the map grows when
    // a fixture of step 2 lands.
    expect(workday.key?.(byId("email"))).toBe("personal.email")
  })

  it("has no opinion about a field it has never seen", () => {
    expect(workday.key?.(byId("password"))).toBeNull()
  })
})
