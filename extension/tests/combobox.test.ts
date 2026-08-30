import { beforeEach, describe, expect, it } from "vitest"

import { selectFromCombobox } from "~core/fill/combobox"

/**
 * The empty and loading states of a typeahead sit in the DOM alongside its
 * results. Selecting one would put "No location found. Try entering a
 * different location" into an application, which is worse than leaving the
 * field for the user.
 */

beforeEach(() => {
  document.body.replaceChildren()
})

describe("typeahead states are not options", () => {
  it("refuses to select the empty state", async () => {
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div>
         <input id="location-input" class="location-input" type="text">
         <div class="dropdown-container">
           <div class="dropdown-results"></div>
           <div class="dropdown-no-results">No location found. Try entering a different location</div>
           <div class="dropdown-loading-results"><span>Loading</span></div>
         </div>
       </div>`
    )

    const input = document.getElementById("location-input") as HTMLInputElement
    const result = await selectFromCombobox(input, "Lubbock, Texas")

    expect(result.ok).toBe(false)
    expect(result.value).toBeUndefined()
  })

  it("selects a real result when one appears", async () => {
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div>
         <input id="location-input" class="location-input" type="text">
         <div class="dropdown-container">
           <div class="dropdown-results">
             <div class="dropdown-result">Lubbock, TX, USA</div>
             <div class="dropdown-result">Lubbock County, TX, USA</div>
           </div>
           <div class="dropdown-no-results">No location found. Try entering a different location</div>
         </div>
       </div>`
    )

    const input = document.getElementById("location-input") as HTMLInputElement
    const result = await selectFromCombobox(input, "Lubbock, Texas")

    expect(result.ok).toBe(true)
    expect(result.value).toContain("Lubbock")
    expect(result.value).not.toMatch(/No location found/)
  })
})
