import { beforeEach, describe, expect, it, vi } from "vitest"

import { greenhouse } from "~adapters"
import { autofill } from "~core/engine"
import { ProfileSchema } from "~profile/schema"

/**
 * Questions that only exist once an earlier one is answered.
 *
 * Confirmed on a live Workday application: answering the Cuba/Iran/North
 * Korea/Syria screening question reveals a longer country list, and answering
 * that reveals a box asking which passports you hold. Three questions, only
 * one of which is on the page when Ditto starts.
 *
 * This used to be bounded at a fixed number of passes, which is a guess about
 * how deep a given form chains. It now runs until the form stops producing
 * questions.
 */

const profile = ProfileSchema.parse({
  personal: { firstName: "Lavneet", lastName: "Hora", email: "a@b.com" },
  eligibility: { citizenships: ["India"] }
})

/** A form that reveals its next question each time one is answered. */
function chainOf(questions: string[]): void {
  document.body.innerHTML = `<form id="f"><div id="slot"></div></form>`

  let revealed = 0

  const showNext = () => {
    if (revealed >= questions.length) return

    const label = questions[revealed]
    const id = `q${revealed}`
    revealed++

    document.getElementById("slot")!.insertAdjacentHTML(
      "beforeend",
      `<div class="field">
         <label for="${id}">${label}</label>
         <input id="${id}" name="${id}" type="text" />
       </div>`
    )

    // The next question appears only once this one has a value.
    document.getElementById(id)!.addEventListener("change", showNext, { once: true })
  }

  showNext()
}

beforeEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe("a chain of revealed questions", () => {
  it("answers all three, not just the one that was on the page", async () => {
    chainOf([
      "Country of Citizenship",
      "Country of Citizenship or Countries of Citizenship if dual",
      "Please add your Country of Citizenship"
    ])

    const report = await autofill({ doc: document, adapter: greenhouse, profile })

    expect((document.getElementById("q0") as HTMLInputElement).value).toBe("India")
    expect((document.getElementById("q1") as HTMLInputElement).value).toBe("India")
    expect((document.getElementById("q2") as HTMLInputElement).value).toBe("India")
    expect(report.filled.length).toBeGreaterThanOrEqual(3)
  })

  it("goes deeper than the old fixed bound of three", async () => {
    chainOf(Array.from({ length: 6 }, () => "Country of Citizenship"))

    await autofill({ doc: document, adapter: greenhouse, profile })

    for (let i = 0; i < 6; i++) {
      expect((document.getElementById(`q${i}`) as HTMLInputElement).value).toBe("India")
    }
  })

  it("stops on a form that keeps producing questions forever", async () => {
    // The reason the loop cannot simply run until the DOM settles. Ditto hands
    // back what it filled rather than never returning.
    chainOf(Array.from({ length: 500 }, () => "Country of Citizenship"))

    const report = await autofill({ doc: document, adapter: greenhouse, profile })

    expect(report.filled.length).toBeGreaterThan(0)
    expect(report.filled.length).toBeLessThan(500)
  }, 60_000)

  it("never picks the same field up twice", async () => {
    chainOf(["Country of Citizenship", "Please add your Country of Citizenship"])

    const report = await autofill({ doc: document, adapter: greenhouse, profile })

    const ids = report.filled.map((r) => r.fieldId)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
