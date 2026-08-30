import { beforeEach, describe, expect, it } from "vitest"

import { workday } from "~adapters"
import { autofill } from "~core/engine"
import { emptyProfile } from "~profile/schema"

/**
 * Fields that only exist once another has been answered.
 *
 * Workday hides the preferred-name boxes behind an "I have a preferred name"
 * checkbox. On a single pass Ditto ticks the box and finishes, leaving the two
 * fields it just revealed empty and absent from the report, which is the worst
 * of both: the form changed and the panel does not mention it.
 */

const MARKUP = `
  <div data-automation-id="applyFlowPage">
    <div data-automation-id="formField-legalName--firstName">
      <label for="name--legalName--firstName">First Name</label>
      <input type="text" id="name--legalName--firstName" name="legalName--firstName">
    </div>
    <div data-automation-id="formField-preferredCheck">
      <label for="name--preferredCheck">I have a preferred name</label>
      <input type="checkbox" id="name--preferredCheck" name="preferredCheck">
    </div>
    <div id="revealed"></div>
  </div>`

/** Workday's own behaviour: ticking the box mounts the preferred name boxes. */
function wireDisclosure(): void {
  const box = document.getElementById("name--preferredCheck") as HTMLInputElement

  box.addEventListener("click", () => {
    document.getElementById("revealed")!.innerHTML = box.checked
      ? `<div data-automation-id="formField-preferredName--firstName">
           <label for="pref--first">Preferred First Name</label>
           <input type="text" id="pref--first" name="preferredName--firstName">
         </div>`
      : ""
  })
}

beforeEach(() => {
  document.body.replaceChildren()
  document.body.insertAdjacentHTML("afterbegin", MARKUP)
  wireDisclosure()
})

const profile = (over: Record<string, unknown> = {}) => {
  const base = emptyProfile()
  return {
    ...base,
    personal: { ...base.personal, firstName: "Jordan", lastName: "Reyes", ...over }
  }
}

describe("a checkbox that reveals fields", () => {
  it("ticks it and fills what it reveals, in one run", async () => {
    const report = await autofill({
      doc: document,
      adapter: workday,
      profile: profile({ hasPreferredName: true, preferredFirstName: "Jo" }) as never
    })

    expect((document.getElementById("name--preferredCheck") as HTMLInputElement).checked).toBe(true)
    expect((document.getElementById("pref--first") as HTMLInputElement).value).toBe("Jo")

    // And the revealed field is in the report, not silently filled.
    expect(report.filled.map((r) => r.label)).toContain("Preferred First Name")
    expect(report.fieldsFound).toBe(3)
  })

  it("leaves the box alone when there is no preferred name to declare", async () => {
    const report = await autofill({
      doc: document,
      adapter: workday,
      profile: profile() as never
    })

    expect((document.getElementById("name--preferredCheck") as HTMLInputElement).checked).toBe(false)
    expect(document.getElementById("pref--first")).toBeNull()
    expect(report.fieldsFound).toBe(2)
  })

  it("does not report a field twice across passes", async () => {
    const report = await autofill({
      doc: document,
      adapter: workday,
      profile: profile({ hasPreferredName: true, preferredFirstName: "Jo" }) as never
    })

    const labels = report.filled.concat(report.needsYou, report.skipped, report.errors).map((r) => r.label)

    expect(new Set(labels).size).toBe(labels.length)
  })
})

describe("a form that replaces its inputs as you fill it", () => {
  /**
   * Reported live on Workday, and caused by the reveal pass above.
   *
   * Workday does not update an input, it paints a new one. Keyed by element,
   * every field on the page looked new on the second pass and every one was
   * filled again: the user saw First Name, Last Name, Address Line 1, City,
   * Postal Code and Phone Number listed twice in the report.
   *
   * The first version of the test above never replaced a node, which is
   * exactly why it did not catch this.
   */

  /** Swap every input for an identical one, the way a re-render does. */
  function repaint(): void {
    for (const input of [...document.querySelectorAll("input")]) {
      const fresh = input.cloneNode(true) as HTMLInputElement
      fresh.value = input.value
      fresh.checked = input.checked
      input.replaceWith(fresh)
    }
  }

  it("does not fill a field twice because its element was swapped", async () => {
    const box = document.getElementById("name--preferredCheck") as HTMLInputElement
    box.addEventListener("click", () => setTimeout(repaint, 0))

    const report = await autofill({
      doc: document,
      adapter: workday,
      profile: profile({ hasPreferredName: true, preferredFirstName: "Jo" }) as never
    })

    const all = report.filled.concat(report.needsYou, report.skipped, report.errors)
    const firstNames = all.filter((r) => r.label === "First Name")

    expect(firstNames).toHaveLength(1)
    expect(all.map((r) => r.label)).toHaveLength(new Set(all.map((r) => r.label)).size)
  })

  it("still reaches a genuinely new field after a repaint", async () => {
    // The dedupe must not be so eager that it swallows the reveal itself.
    const box = document.getElementById("name--preferredCheck") as HTMLInputElement
    box.addEventListener("click", () => setTimeout(repaint, 0))

    await autofill({
      doc: document,
      adapter: workday,
      profile: profile({ hasPreferredName: true, preferredFirstName: "Jo" }) as never
    })

    expect((document.getElementById("pref--first") as HTMLInputElement).value).toBe("Jo")
  })
})
