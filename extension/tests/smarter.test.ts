import { beforeEach, describe, expect, it } from "vitest"

import { fill } from "~core/fill"
import { match } from "~core/match"
import type { FieldSpec } from "~core/types"

/**
 * Questions that mention a word without being about it, and values that are
 * only part of an answer. Every case reported from a live Ashby or Greenhouse
 * application.
 */

const field = (label: string, over: Partial<FieldSpec> = {}): FieldSpec =>
  ({
    id: "f",
    el: document.createElement("input"),
    kind: "text",
    label,
    required: true,
    ...over
  }) as FieldSpec

const keyFor = (label: string, over: Partial<FieldSpec> = {}) =>
  match(field(label, over), [])?.key ?? null

beforeEach(() => {
  document.body.replaceChildren()
})

describe("where the applicant is", () => {
  it("answers a question asking where you are located", () => {
    expect(keyFor("Where are you located? (City and Province)")).toBe("personal.location")
  })

  it("answers a question about where you permanently reside", () => {
    // Was being answered with the city of a past job.
    expect(keyFor("What is the location where you permanently reside?")).toBe("personal.location")
  })

  it("still reads a job's own location as the job's", () => {
    expect(keyFor("Location", { section: "Work Experience 1" })).toBe("work[].location")
  })
})

describe("a word mentioned in passing", () => {
  it("does not read an engineering-discipline question as skills", () => {
    // "…most relevant to your interests, skills and past experiences" is a
    // question about disciplines that happens to say skills.
    expect(
      keyFor(
        "Please select the top 3 engineer profile types below that are most relevant to your interests, skills and past experiences. First preference:"
      )
    ).toBeNull()
  })

  it("still reads a plain skills field", () => {
    expect(keyFor("Skills")).toBe("skills")
    expect(keyFor("Technical skills")).toBe("skills")
  })
})

describe("a box asking for one part of a date", () => {
  const write = async (label: string, value: string) => {
    document.body.insertAdjacentHTML("afterbegin", `<input id="d" type="text">`)
    const el = document.getElementById("d") as HTMLInputElement
    await fill(field(label, { el }), { kind: "text", value })
    return el.value
  }

  it("writes just the year into a year box", async () => {
    // A required Start date year went unanswered while the profile held it.
    expect(await write("Start date year", "2022-09")).toBe("2022")
  })

  it("writes just the month into a month box", async () => {
    expect(await write("Start month", "2022-09")).toBe("09")
  })

  it("writes the whole date when the box asks for the whole date", async () => {
    expect(await write("Start date (MM/YYYY)", "2022-09")).toBe("09/2022")
  })

  it("leaves an ordinary field alone", async () => {
    expect(await write("Graduation year of your degree", "First Class")).toBe("First Class")
  })
})

describe("a list offered to a single choice", () => {
  it("puts one value in, not every value in turn", async () => {
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<select id="pick"><option value=""></option><option>Backend</option><option>Frontend</option></select>`
    )

    const el = document.getElementById("pick") as HTMLSelectElement
    const options = [...el.options].map((o) => ({ value: o.value, label: o.textContent ?? "", el: o }))

    const outcome = await fill(field("First preference", { el, kind: "select", options }), {
      kind: "list",
      value: ["Backend", "Frontend"]
    })

    expect(outcome.kind).toBe("wrote")
    expect(el.value).toBe("Backend")
  })
})
