import { describe, expect, it } from "vitest"

import { greenhouse } from "~adapters"
import { autofill } from "~core/engine"
import { actionableItems } from "~core/report"
import { ProfileSchema } from "~profile/schema"

/**
 * Clicking a row has to go to the field that row is about.
 *
 * Reported live: the optional Phone Extension row, correctly left under Needs
 * You, scrolled to the postal code when clicked.
 *
 * `fieldId` is a per-scan counter, and a fill re-scans each time the form
 * reveals a question, so by the end the same id string names a different
 * field than it did on the first pass. The row now carries the control it is
 * about.
 */

const profile = ProfileSchema.parse({
  personal: {
    firstName: "Lavneet",
    lastName: "Hora",
    email: "a@b.com",
    phone: "8324180086",
    postalCode: "79409"
  }
})

describe("every row points at its own field", () => {
  it("sends the phone extension row to the phone extension", async () => {
    document.body.innerHTML = `
      <form>
        <label for="phone">Phone</label><input id="phone" name="phone" />
        <label for="ext">Phone Extension</label><input id="ext" name="ext" />
        <label for="zip">Postal Code</label><input id="zip" name="zip" />
      </form>`

    const report = await autofill({ doc: document, adapter: greenhouse, profile })

    const extension = actionableItems(report).find((r) => /extension/i.test(r.label))
    expect(extension).toBeDefined()
    expect((extension!.el as HTMLElement)?.id).toBe("ext")
  })

  it("gives every result the control it describes", async () => {
    document.body.innerHTML = `
      <form>
        <label for="a">First Name</label><input id="a" name="a" />
        <label for="b">Last Name</label><input id="b" name="b" />
        <label for="c">Postal Code</label><input id="c" name="c" />
      </form>`

    const report = await autofill({ doc: document, adapter: greenhouse, profile })
    const all = [...report.filled, ...actionableItems(report)]

    // Each row's element is the one whose label the row shows.
    for (const result of all) {
      const el = result.el as HTMLElement
      const label = document.querySelector(`label[for="${el.id}"]`)
      expect(label?.textContent).toBe(result.label)
    }
  })
})

describe("a row whose control the page removed", () => {
  it("points at the block it lived in rather than nowhere", async () => {
    // Greenhouse deletes its file input on attach. A resume row with nothing
    // to point at is a row that does nothing when clicked.
    document.body.innerHTML = `
      <form>
        <div class="file-upload"><div class="label">Resume/CV</div>
          <div class="file-upload__wrapper"><input id="resume" type="file" /></div>
        </div>
      </form>`

    const withResume = ProfileSchema.parse({
      ...profile,
      resume: {
        filename: "Hora_Resume.pdf",
        mimeType: "application/pdf",
        size: 8,
        data: "JVBERi0=",
        updatedAt: 0
      }
    })

    // The site takes the file and removes the control it came from.
    const wrapper = document.querySelector(".file-upload__wrapper")!
    document.getElementById("resume")!.addEventListener("change", () => {
      wrapper.innerHTML = `<div class="file-upload__filename"><p>Hora_Resume.pdf</p></div>`
    })

    const report = await autofill({ doc: document, adapter: greenhouse, profile: withResume })
    const row = [...report.filled, ...actionableItems(report)].find((r) => /resume/i.test(r.label))

    expect(row).toBeDefined()
    expect(row!.el?.isConnected).toBe(true)
  })
})
