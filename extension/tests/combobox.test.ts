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
  }, 15_000)

  it("reports failure when the click does not commit", async () => {
    // Reported live on Lever: the option was found and clicked, the widget
    // ignored it, and the field was then wiped when focus moved to the next
    // one. Returning ok here would have claimed a value the form never got.
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div>
         <input id="location-input" class="location-input" type="text">
         <div class="dropdown-container">
           <div class="dropdown-results">
             <div class="dropdown-location">Lubbock, TX, USA</div>
           </div>
         </div>
       </div>`
    )

    const input = document.getElementById("location-input") as HTMLInputElement
    const result = await selectFromCombobox(input, "Lubbock, Texas")

    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/would not commit/)
  })

  it("selects a real result when one appears", async () => {
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div>
         <input id="location-input" class="location-input" type="text">
         <div class="dropdown-container">
           <div class="dropdown-results">
             <div class="dropdown-location">Lubbock, TX, USA</div>
             <div class="dropdown-location">Lubbock County, TX, USA</div>
           </div>
           <div class="dropdown-no-results">No location found. Try entering a different location</div>
         </div>
       </div>`
    )

    const input = document.getElementById("location-input") as HTMLInputElement

    // Stand in for Lever's own handler, which writes the chosen place into the
    // visible input. Without something that commits, the driver is right to
    // report failure, so the widget has to be modelled for this to mean
    // anything.
    for (const option of document.querySelectorAll(".dropdown-location")) {
      option.addEventListener("mousedown", () => {
        input.value = option.textContent!.trim()
      })
    }

    const result = await selectFromCombobox(input, "Lubbock, Texas")

    expect(result.ok).toBe(true)
    expect(result.value).toBe("Lubbock, TX, USA")
    expect(input.value).toBe("Lubbock, TX, USA")
  })
})
