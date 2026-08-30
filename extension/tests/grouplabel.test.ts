import { beforeEach, describe, expect, it } from "vitest"

import { lever } from "~adapters"
import { match } from "~core/match"
import { resolve } from "~core/resolve"
import { scan } from "~core/scan"
import { emptyProfile } from "~profile/schema"

/**
 * Both of these were reported from live Lever forms, and both are the same
 * mistake: label resolution swallowing text that belongs to the field's
 * widget or to its options, which then steered the matcher to the wrong key
 * and wrote a real, wrong value.
 */

beforeEach(() => {
  document.body.replaceChildren()
})

describe("a group's question excludes its options", () => {
  /** The US equal-employment block, options carrying their legal descriptions. */
  const RACE = `
    <form id="application-form">
      <div class="application-question">
        <div class="application-label">Race</div>
        <div class="application-field">
          <ul>
            <li><label><input type="radio" name="eeo[race]" value="Hispanic or Latino">
              Hispanic or Latino<span>A person of Cuban, Mexican, Puerto Rican, South or Central American, or other Spanish culture or origin regardless of race.</span></label></li>
            <li><label><input type="radio" name="eeo[race]" value="White">
              White (Not Hispanic or Latino)<span>A person having origins in any of the original peoples of Europe, the Middle East, or North Africa.</span></label></li>
            <li><label><input type="radio" name="eeo[race]" value="Asian">
              Asian (Not Hispanic or Latino)<span>A person having origins in any of the original peoples of the Far East, Southeast Asia, or the Indian Subcontinent.</span></label></li>
          </ul>
        </div>
      </div>
    </form>`

  it("reads the question as Race, not as the options' descriptions", () => {
    document.body.insertAdjacentHTML("afterbegin", RACE)
    const group = scan(document, lever).find((f) => f.kind === "radiogroup")!

    expect(group.label).toBe("Race")
    expect(group.label).not.toMatch(/person having origins/)
  })

  it("matches race rather than the Hispanic question", () => {
    // The descriptions contain "Hispanic or Latino", which outscored the race
    // rule and made Ditto answer a race question with "no".
    document.body.insertAdjacentHTML("afterbegin", RACE)
    const group = scan(document, lever).find((f) => f.kind === "radiogroup")!

    expect(match(group, lever.rules)?.key).toBe("eeo.race")
    expect(match(group, lever.rules)?.key).not.toBe("eeo.hispanicLatino")
  })

  it("answers it with the stored race", () => {
    document.body.insertAdjacentHTML("afterbegin", RACE)
    const profile = emptyProfile()
    profile.eeo.race = "Asian"

    const group = scan(document, lever).find((f) => f.kind === "radiogroup")!
    expect(resolve(match(group, lever.rules)!, group, profile)).toEqual({
      kind: "text",
      value: "Asian"
    })
  })
})

describe("a field's label excludes its widget chrome", () => {
  const LOCATION = `
    <form id="application-form">
      <li class="application-question">
        <label>
          <div class="application-label">Current location</div>
          <div class="application-field">
            <input class="location-input" id="location-input" type="text" name="location">
            <div class="dropdown-container">
              <div class="dropdown-results"></div>
              <div class="dropdown-no-results">No location found. Try entering a different location</div>
              <div class="dropdown-loading-results"><span>Loading</span></div>
            </div>
          </div>
        </label>
      </li>
    </form>`

  it("does not absorb the typeahead dropdown into the label", () => {
    document.body.insertAdjacentHTML("afterbegin", LOCATION)
    const field = scan(document, lever).find((f) => f.el.getAttribute("name") === "location")!

    expect(field.label).toBe("Current location")
    expect(field.label).not.toMatch(/No location found|Loading/)
  })

  it("maps to the applicant's own location, not a past job's", () => {
    // With the dropdown text absorbed, the label no longer matched the
    // Lever rule and fell through to work[].location, which answered a
    // candidate's address field with a previous employer's city.
    document.body.insertAdjacentHTML("afterbegin", LOCATION)
    const profile = emptyProfile()
    profile.personal.city = "Lubbock"
    profile.personal.state = "Texas"
    profile.work = [
      { id: "w", company: "Acme", title: "Intern", location: "Houston, TX", startDate: "", endDate: "", current: false, summary: "", bullets: [] }
    ]

    const field = scan(document, lever).find((f) => f.el.getAttribute("name") === "location")!
    const matched = match(field, lever.rules)!

    expect(matched.key).toBe("personal.location")
    expect(resolve(matched, field, profile)).toEqual({ kind: "text", value: "Lubbock, Texas" })
  })
})
