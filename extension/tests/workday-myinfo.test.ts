import { readFileSync } from "node:fs"
import { resolve as resolvePath } from "node:path"
import { beforeEach, describe, expect, it } from "vitest"

import { workday } from "~adapters"
import { readComboboxValue } from "~core/fill/combobox"
import { match } from "~core/match"
import { scan } from "~core/scan"

/**
 * Step 2 of the Workday wizard, from markup captured on a live tenant.
 *
 * This is the step Ditto exists for, and the one with the widgets none of the
 * other three ATS have: a listbox button whose real value is a GUID in a
 * sibling input, and a multiselect whose text box is a search field.
 */

const FIXTURE = readFileSync(
  resolvePath(__dirname, "../../fixtures/workday-my-information.html"),
  "utf8"
)

beforeEach(() => {
  document.body.replaceChildren()
  document.body.insertAdjacentHTML("afterbegin", FIXTURE)
})

const fields = () => scan(document, workday)
const byLabel = (label: string) => fields().find((f) => f.label === label)
const keyFor = (label: string) =>
  match(byLabel(label)!, workday.rules ?? [], workday.key?.bind(workday))?.key ?? null
const byId = (id: string) => document.querySelector(`[data-automation-id='${id}']`)!

describe("what the scan sees", () => {
  it("finds every field on the step and nothing else", () => {
    expect(fields().map((f) => f.label)).toEqual([
      "How Did You Hear About Us?",
      "Are you now or have you previously been employed by Analog Devices Inc. (ADI) or Maxim Integrated as a full-time regular employee or in a contract/temporary or coop-intern capacity? If yes, please provide as much info below as you remember. Leave blank if you do not know.",
      "Country",
      "First Name",
      "Middle Name",
      "Last Name",
      "I have a preferred name",
      "Address Line 1",
      "City",
      "State",
      "Postal Code",
      "Phone Device Type",
      "Country Phone Code",
      "Phone Number",
      "Phone Extension"
    ])
  })

  it("does not invent a field for the read-only email", () => {
    // The account email is a <span>, not an input. There is nothing to fill
    // and nothing to report.
    expect(byLabel("Email Address")).toBeUndefined()
  })
})

describe("the formField identifier", () => {
  it("names the address fields exactly, without reading a label", () => {
    expect(keyFor("First Name")).toBe("personal.firstName")
    expect(keyFor("Last Name")).toBe("personal.lastName")
    expect(keyFor("Address Line 1")).toBe("personal.addressLine1")
    expect(keyFor("City")).toBe("personal.city")
    expect(keyFor("Postal Code")).toBe("personal.postalCode")
  })

  it("maps countryRegion to the state, whatever the tenant labels it", () => {
    // Workday labels this "State" in the US and "Province" elsewhere. The
    // automation id does not move.
    expect(keyFor("State")).toBe("personal.state")
  })

  it("keeps the three phone fields apart", () => {
    expect(keyFor("Phone Number")).toBe("personal.phone")
    expect(keyFor("Phone Device Type")).toBe("personal.phoneType")
    expect(keyFor("Country Phone Code")).toBe("personal.phoneCountryCode")
  })

  it("writes nothing into the phone extension", () => {
    // "Phone Extension" contains "phone" and there is no extension in the
    // profile, so without a veto the phone rule wins on weight and Ditto puts
    // a ten-digit number in a box that wants three.
    expect(keyFor("Phone Extension")).toBeNull()
  })

  it("leaves a company-specific question to the user", () => {
    expect(keyFor(byLabel("Country")!.label)).toBe("personal.country")
    expect(fields().find((f) => f.label.startsWith("Are you now or have you"))).toBeDefined()
  })
})

describe("required, as the form means it", () => {
  const required = (label: string) => byLabel(label)!.required

  it("reads the asterisk even though it is aria-hidden", () => {
    // The mark lives in <abbr aria-hidden="true">*</abbr>, and label
    // resolution strips aria-hidden nodes on purpose. The listbox buttons
    // carry no aria-required at all, so without reading the label element
    // directly they report themselves optional on a form that will not
    // submit without them.
    expect(required("Country")).toBe(true)
    expect(required("State")).toBe(true)
    expect(required("Phone Device Type")).toBe(true)
  })

  it("believes an explicit aria-required of false", () => {
    // Both sit in a wrapper alongside required siblings, so anything that
    // reaches for a nearby asterisk marks them required and the drawer
    // reports a complete form as incomplete.
    expect(required("Middle Name")).toBe(false)
    expect(required("Phone Extension")).toBe(false)
  })
})

describe("the widgets", () => {
  it("treats a listbox button as a dropdown, not a button", () => {
    expect(byLabel("Country")!.kind).toBe("combobox")
    expect(byLabel("State")!.kind).toBe("combobox")
  })

  it("treats the multiselect search box as a dropdown, not a text field", () => {
    // A plain <input placeholder="Search"> with no aria wiring. Typed text is
    // a query; Workday discards it on blur the way Lever's typeahead does.
    expect(byLabel("How Did You Hear About Us?")!.kind).toBe("combobox")
    expect(byLabel("Country Phone Code")!.kind).toBe("combobox")
  })

  it("never types into the hidden input holding a listbox's GUID", () => {
    const shadow = byId("formField-country").querySelector<HTMLInputElement>(
      "input[type='text']:not([id])"
    )!

    expect(shadow.value).toBe("bc33aa3152ec42d4995f4791a106ed09")
    expect(workday.ignore?.(shadow)).toBe(true)
  })

  it("does not scan the pill list as a second control", () => {
    // It carries role="listbox" inside a control already scanned, and has no
    // label of its own, so it borrowed the "Phone" section heading and
    // resolved to the phone number.
    expect(workday.ignore?.(byId("selectedItemList"))).toBe(true)
    expect(byLabel("Phone")).toBeUndefined()
  })
})

describe("consent", () => {
  it("never ticks the SMS opt-in", () => {
    // Labelled only by a Terms and Conditions link. Agreeing to marketing
    // texts on someone's behalf is not autofill, the same rule as Lever's
    // consent boxes.
    expect(workday.ignore?.(byId("phone-sms-opt-in"))).toBe(true)
  })
})

describe("the wizard", () => {
  it("names the step from the heading", () => {
    // This tenant's progress bar says only "current step 1 of 6" and never
    // names the step.
    expect(workday.step?.(document)).toBe("My Information")
  })

  it("offers the footer button for the user to click", () => {
    expect(workday.nextControl?.(document)?.textContent).toBe("Save and Continue")
  })

  it("refuses to offer that button once it says Submit", () => {
    // Same automation id on the last step of the wizard. The drawer clicks
    // whatever nextControl returns, so returning this would make Ditto's own
    // UI submit the application.
    byId("pageFooterNextButton").textContent = "Submit"

    expect(workday.nextControl?.(document)).toBeNull()
  })
})

describe("reading a Workday value back", () => {
  /**
   * Verification is the only path to `filled`. Neither of these widgets is an
   * input, so every branch of the generic read-back returned nothing and a
   * pick that worked would have verified as an error.
   */

  it("reads a listbox button from its own text", () => {
    expect(readComboboxValue(byId("formField-country").querySelector("button")!)).toBe(
      "United States of America"
    )
  })

  it("treats Select One as empty, not as a value", () => {
    // The unfilled State button. Reporting its placeholder as the value would
    // confirm any fill at all, including one that did nothing.
    expect(readComboboxValue(byId("formField-countryRegion").querySelector("button")!)).toBe("")
  })

  it("reads a multiselect from its pills, not its search box", () => {
    // The search input is empty after a selection; the value is in the pill.
    const search = document.querySelector<HTMLElement>("#phoneNumber--countryPhoneCode")!

    expect((search as HTMLInputElement).value).toBe("")
    expect(readComboboxValue(search)).toBe("United States of America (+1)")
  })

  it("reads an empty multiselect as empty", () => {
    const search = document.querySelector<HTMLElement>("#source--source")!

    expect(readComboboxValue(search)).toBe("")
  })
})
