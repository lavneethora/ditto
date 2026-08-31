import { describe, expect, it } from "vitest"

import type { FieldSpec } from "~core/types"
import { verify } from "~core/verify"

/**
 * Skills, written correctly and marked wrong.
 *
 * Reported on a live Workday My Experience page: the panel listed every skill
 * it had written, the skills were visibly on the form, and every one of them
 * carried a red cross.
 *
 * The cause is that a multi-select answers as a set and was being checked as
 * a string. Ditto writes "Python, Java, Docker (Software)"; the control shows
 * the same three as pills, in whatever order it likes, next to anything that
 * was already there. Neither string contains the other.
 */

function skillsField(shown: string[]): FieldSpec {
  document.body.innerHTML = `
    <div class="css-pills" id="skills-shell">
      ${shown.map((s) => `<div data-value="${s}"><span>${s}</span><button>Remove</button></div>`).join("")}
      <input id="skills" role="combobox" value="" />
    </div>`

  return {
    id: "s",
    el: document.getElementById("skills")!,
    kind: "multiselect",
    label: "Skills",
    required: true
  } as FieldSpec
}

const wrote = (value: string) => ({ kind: "wrote", value }) as const

describe("a multi-select holding what was written", () => {
  it("is confirmed when the order differs", () => {
    const field = skillsField(["Docker (Software)", "Python", "Java"])

    expect(verify(field, wrote("Python, Java, Docker (Software)")).status).toBe("filled")
  })

  it("is confirmed when the control holds extra values", () => {
    // The user may have picked some themselves before pressing Autofill.
    const field = skillsField(["Python", "Rust", "Java"])

    expect(verify(field, wrote("Python, Java")).status).toBe("filled")
  })

  it("still reports the one that did not land", () => {
    const field = skillsField(["Python", "Java"])

    const result = verify(field, wrote("Python, Java, Kubernetes"))

    expect(result.status).toBe("error")
    expect(result.reason).toContain("kubernetes")
  })

  it("reports an empty control rather than passing it", () => {
    const field = skillsField([])

    expect(verify(field, wrote("Python, Java")).status).toBe("error")
  })
})

describe("skills a multi-select could not place", () => {
  it("names them instead of dropping them in silence", () => {
    // A run that placed thirteen and could not place four looked exactly like
    // one that placed all seventeen. The count was visibly short and there
    // was no way to learn which four.
    const field = skillsField(["Python", "Java"])

    const result = verify(field, {
      kind: "wrote",
      value: "Python, Java",
      note: "not offered here: Terraform, Kubernetes"
    })

    expect(result.status).toBe("filled")
    expect(result.reason).toContain("Terraform")
    expect(result.reason).toContain("Kubernetes")
  })

  it("says nothing extra when everything landed", () => {
    const field = skillsField(["Python", "Java"])

    expect(verify(field, wrote("Python, Java")).reason).toBeUndefined()
  })
})
