import { readFileSync } from "node:fs"
import { resolve as resolvePath } from "node:path"
import { beforeEach, describe, expect, it } from "vitest"

import { workday } from "~adapters"
import { autofill } from "~core/engine"
import { match } from "~core/match"
import { scan } from "~core/scan"
import { emptyProfile } from "~profile/schema"

/**
 * Workday's Websites section: a repeatable list of bare URL boxes.
 *
 * Nothing in the markup says which link a box wants, so the profile's three
 * separate link fields are presented as one ordered list and paired with
 * panels by position.
 */

const PANEL = readFileSync(
  resolvePath(__dirname, "../../fixtures/workday-websites-panel.html"),
  "utf8"
)

beforeEach(() => {
  document.body.replaceChildren()
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<div data-automation-id="applyFlowPage">${PANEL}</div>`
  )
})

const links = (over: Record<string, string> = {}) => {
  const base = emptyProfile()
  return {
    ...base,
    personal: {
      ...base.personal,
      linkedin: "https://linkedin.com/in/example",
      github: "https://github.com/example",
      website: "https://example.com",
      ...over
    }
  }
}

describe("recognising the URL box", () => {
  it("knows it is a link, though the label only says URL", () => {
    const field = scan(document, workday)[0]

    expect(field.label).toBe("URL")
    expect(match(field, workday.rules ?? [], workday.key?.bind(workday))?.key).toBe(
      "personal.link"
    )
  })

  it("pairs the panel with the first link", () => {
    expect(scan(document, workday)[0].repeatIndex).toBe(0)
  })
})

describe("filling the panels", () => {
  /** Workday's own behaviour: each Add appends one more URL box. */
  function wireAdd(): void {
    const section = document.querySelector("[aria-labelledby='Websites-section']")!
    const add = section.querySelector<HTMLElement>("[data-automation-id='add-button']")!

    add.addEventListener("click", () => {
      const n = section.querySelectorAll("[role='group'][aria-labelledby$='-panel']").length + 1

      add.closest(".css-1ebprri")!.insertAdjacentHTML(
        "beforebegin",
        `<div role="group" aria-labelledby="Websites-${n}-panel">
           <h5 id="Websites-${n}-panel">Websites ${n}</h5>
           <div data-automation-id="formField-url">
             <label for="url-${n}">URL</label>
             <input type="text" id="url-${n}" name="url" aria-required="true">
           </div>
         </div>`
      )
    })
  }

  it("adds a panel per saved link and fills them in order", async () => {
    wireAdd()

    await autofill({ doc: document, adapter: workday, profile: links() as never })

    expect((document.getElementById("webAddress-78--url") as HTMLInputElement).value).toBe(
      "https://linkedin.com/in/example"
    )
    expect((document.getElementById("url-2") as HTMLInputElement).value).toBe(
      "https://github.com/example"
    )
    expect((document.getElementById("url-3") as HTMLInputElement).value).toBe(
      "https://example.com"
    )
  })

  it("asks for only as many boxes as there are links", async () => {
    wireAdd()

    await autofill({
      doc: document,
      adapter: workday,
      profile: links({ github: "", website: "" }) as never
    })

    // The one panel the page shipped with, and no more.
    expect(document.querySelectorAll("[data-automation-id='formField-url']")).toHaveLength(1)
  })

  it("reports a box it has no link for rather than filling it wrongly", async () => {
    // A form offering more boxes than the user has links is not broken, and
    // the extra box must not repeat the last link.
    const report = await autofill({
      doc: document,
      adapter: workday,
      profile: links({ linkedin: "", github: "", website: "" }) as never
    })

    expect((document.getElementById("webAddress-78--url") as HTMLInputElement).value).toBe("")
    expect(report.skipped.map((r) => r.label)).toContain("URL")
  })
})
