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

describe("when the resume goes in", () => {
  /**
   * Attaching a file makes a site re-render, sometimes a beat later and
   * sometimes across the whole form, and whatever was filled in the moments
   * after it can be reset while the DOM keeps showing the text. On Ashby the
   * resume sits third in the form and Preferred First Name fifth, and that
   * field kept coming back as unanswered on submit while its neighbours
   * passed.
   */

  it("is the last thing filled, whatever order the form puts it in", async () => {
    document.body.replaceChildren()
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div data-automation-id="applyFlowPage">
         <div data-automation-id="formField-legalName--firstName">
           <label for="a">First Name</label>
           <input type="text" id="a" name="legalName--firstName">
         </div>
         <div data-automation-id="formField-resume">
           <label for="r">Resume</label>
           <input type="file" id="r" name="resume">
         </div>
         <div data-automation-id="formField-legalName--lastName">
           <label for="b">Last Name</label>
           <input type="text" id="b" name="legalName--lastName">
         </div>
       </div>`
    )

    const order: string[] = []
    for (const id of ["a", "b"]) {
      document.getElementById(id)!.addEventListener("input", () => {
        if (!order.includes(id)) order.push(id)
      })
    }
    document.getElementById("r")!.addEventListener("change", () => order.push("resume"))

    const base = emptyProfile()
    await autofill({
      doc: document,
      adapter: workday,
      profile: {
        ...base,
        personal: { ...base.personal, firstName: "Jordan", lastName: "Reyes" },
        resume: { filename: "cv.pdf", type: "application/pdf", size: 12, data: "AAAA" }
      } as never
    })

    expect(order[order.length - 1]).toBe("resume")
  })
})

describe("saying the answers again", () => {
  /**
   * Some forms drop an answer they were given. Ashby rejected Preferred First
   * Name as unanswered on one run and Email on the next, with a radio joining
   * them on a third: the same fill, a different casualty each time.
   *
   * Re-reading is no help, because the DOM still shows the value. What was
   * lost is the site's own record of it, so the only fix is to say it again.
   */

  it("types a text answer a second time", async () => {
    document.body.replaceChildren()
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div data-automation-id="applyFlowPage">
         <div data-automation-id="formField-legalName--firstName">
           <label for="a">First Name</label>
           <input type="text" id="a" name="legalName--firstName">
         </div>
       </div>`
    )

    let writes = 0
    document.getElementById("a")!.addEventListener("change", () => {
      writes += 1
    })

    const base = emptyProfile()
    await autofill({
      doc: document,
      adapter: workday,
      profile: { ...base, personal: { ...base.personal, firstName: "Jordan" } } as never
    })

    expect(writes).toBe(2)
    expect((document.getElementById("a") as HTMLInputElement).value).toBe("Jordan")
  })

  it("restores a value the form threw away after the fill", async () => {
    // The failure this exists for, made deterministic.
    document.body.replaceChildren()
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div data-automation-id="applyFlowPage">
         <div data-automation-id="formField-legalName--firstName">
           <label for="a">First Name</label>
           <input type="text" id="a" name="legalName--firstName">
         </div>
       </div>`
    )

    const input = document.getElementById("a") as HTMLInputElement
    let cleared = false

    input.addEventListener("change", () => {
      if (cleared) return
      cleared = true
      // A re-render lands a moment later and wipes what was just written.
      setTimeout(() => {
        input.value = ""
      }, 50)
    })

    const base = emptyProfile()
    await autofill({
      doc: document,
      adapter: workday,
      profile: { ...base, personal: { ...base.personal, firstName: "Jordan" } } as never
    })

    expect(input.value).toBe("Jordan")
  })

  it("does not re-choose a dropdown", async () => {
    // Re-choosing is slow, and on a control taking several values it would add
    // a second copy rather than confirm the first.
    document.body.replaceChildren()
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div data-automation-id="applyFlowPage">
         <div data-automation-id="formField-country">
           <label for="c">Country</label>
           <button aria-haspopup="listbox" id="c" name="country">United States of America</button>
         </div>
       </div>`
    )

    let presses = 0
    document.getElementById("c")!.addEventListener("click", () => {
      presses += 1
    })

    const base = emptyProfile()
    await autofill({
      doc: document,
      adapter: workday,
      profile: { ...base, personal: { ...base.personal, country: "United States of America" } } as never
    })

    expect(presses).toBe(0)
  })
})

describe("a radio that was already answered", () => {
  const form = () => {
    document.body.replaceChildren()
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div data-automation-id="applyFlowPage">
         <div data-automation-id="formField-candidateIsPreviousWorker">
           <fieldset>
             <legend><label id="q">Are you open to relocation?</label></legend>
             <div name="relocate" aria-labelledby="q">
               <input id="y" name="relocate" type="radio" value="true"><label for="y">Yes</label>
               <input id="n" name="relocate" type="radio" value="false"><label for="n">No</label>
             </div>
           </fieldset>
         </div>
       </div>`
    )
  }

  const run = async () => {
    const base = emptyProfile()
    await autofill({
      doc: document,
      adapter: workday,
      profile: {
        ...base,
        preferences: { ...base.preferences, willingToRelocate: true }
      } as never
    })
  }

  it("is never clicked a second time", async () => {
    // These are React controls with their own handlers, and a second press
    // clears the selection rather than leaving it alone.
    form()

    let clicks = 0
    for (const id of ["y", "n"]) {
      document.getElementById(id)!.addEventListener("click", () => {
        clicks += 1
      })
    }

    await run()

    expect(clicks).toBe(1)
    expect((document.getElementById("y") as HTMLInputElement).checked).toBe(true)
  })

  it("is announced again so a listener hears it twice", async () => {
    form()

    let changes = 0
    document.getElementById("y")!.addEventListener("change", () => {
      changes += 1
    })

    await run()

    expect(changes).toBe(2)
    expect((document.getElementById("y") as HTMLInputElement).checked).toBe(true)
  })
})
