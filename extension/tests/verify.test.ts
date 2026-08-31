import { beforeEach, describe, expect, it } from "vitest"

import { verify } from "~core/verify"
import type { FieldSpec } from "~core/types"

/**
 * Guards PRD invariant 5.1: `filled` is unreachable without a DOM read-back.
 *
 * The failure this exists to prevent is visible in a Jobright screenshot: a
 * Workday resume dropzone sitting empty, with an empty `Alert:` under it,
 * while the panel showed 3/3, 100%, and a green check on Resume/CV. The write
 * had succeeded and the attach had not, and the panel reported the attempt
 * rather than the result.
 *
 * So the interesting cases here are all the ones where the write *appears* to
 * have worked and the DOM disagrees.
 */

function spec(el: FieldSpec["el"], overrides: Partial<FieldSpec> = {}): FieldSpec {
  return {
    id: "f1",
    el,
    kind: "text",
    label: "First Name",
    required: true,
    ...overrides
  }
}

beforeEach(() => {
  document.body.replaceChildren()
})

describe("a write that landed", () => {
  it("becomes filled when the value is really there", () => {
    const input = document.createElement("input")
    input.value = "Lavneet"
    document.body.append(input)

    const result = verify(spec(input), { kind: "wrote", value: "Lavneet" })

    expect(result.status).toBe("filled")
    expect(result.value).toBe("Lavneet")
  })

  it("tolerates a control that reformats the value", () => {
    const input = document.createElement("input")
    // A phone field that reformats what it was given is still filled.
    input.value = "(555) 123-4567"
    document.body.append(input)

    const result = verify(spec(input, { label: "Phone" }), { kind: "wrote", value: "5551234567" })

    expect(result.status).toBe("filled")
  })
})

describe("a write that did not land", () => {
  it("reports error when the control silently rejected the value", () => {
    const input = document.createElement("input")
    document.body.append(input)

    // The classic React-controlled input: the write was reverted on re-render.
    input.value = ""

    const result = verify(spec(input), { kind: "wrote", value: "Lavneet" })

    expect(result.status).toBe("error")
    expect(result.status).not.toBe("filled")
    expect(result.reason).toMatch(/did not accept|shows/)
  })

  it("reports error when the control holds a different value", () => {
    const input = document.createElement("input")
    input.value = "Someone Else"
    document.body.append(input)

    const result = verify(spec(input), { kind: "wrote", value: "Lavneet" })

    expect(result.status).toBe("error")
    expect(result.reason).toContain("Someone Else")
  })

  it("reports error when the field was removed from the document", () => {
    // Detached: the write technically succeeded on an orphaned node.
    const input = document.createElement("input")
    input.value = "Lavneet"

    const result = verify(spec(input), { kind: "wrote", value: "Lavneet" })

    expect(result.status).toBe("error")
  })
})

describe("file attachment, the Workday resume case", () => {
  it("reports error when the dropzone rejected the file", () => {
    const input = document.createElement("input")
    input.type = "file"
    document.body.append(input)

    // The attach was attempted; input.files is still empty. This is exactly
    // the state behind Jobright's green check on an empty dropzone.
    const result = verify(spec(input, { kind: "file", label: "Resume/CV" }), {
      kind: "wrote",
      value: "Hora_Lavneet_Resume.pdf"
    })

    expect(result.status).toBe("error")
    expect(result.status).not.toBe("filled")
  })

  it("becomes filled only when a file is actually attached", () => {
    const input = document.createElement("input")
    input.type = "file"
    document.body.append(input)

    const transfer = new DataTransfer()
    transfer.items.add(
      new File([new Uint8Array([1, 2, 3])], "Hora_Lavneet_Resume.pdf", { type: "application/pdf" })
    )
    input.files = transfer.files

    const result = verify(spec(input, { kind: "file", label: "Resume/CV" }), {
      kind: "wrote",
      value: "Hora_Lavneet_Resume.pdf"
    })

    expect(result.status).toBe("filled")
    expect(result.value).toBe("Hora_Lavneet_Resume.pdf")
  })
})

describe("radio groups", () => {
  function radioGroup(checkedIndex: number | null) {
    const wrapper = document.createElement("div")

    const options = ["Yes", "No"].map((label, index) => {
      const radio = document.createElement("input")
      radio.type = "radio"
      radio.name = "sponsorship"
      radio.value = label
      radio.checked = index === checkedIndex
      wrapper.append(radio)
      return { value: label, label, el: radio }
    })

    document.body.append(wrapper)
    return options
  }

  it("becomes filled when the matching radio is checked", () => {
    const options = radioGroup(0)
    const result = verify(
      spec(options[0].el, { kind: "radiogroup", options, label: "Require sponsorship?" }),
      { kind: "wrote", value: "Yes" }
    )

    expect(result.status).toBe("filled")
    expect(result.value).toBe("Yes")
  })

  it("reports error when the click did not take", () => {
    const options = radioGroup(null)
    const result = verify(
      spec(options[0].el, { kind: "radiogroup", options, label: "Require sponsorship?" }),
      { kind: "wrote", value: "Yes" }
    )

    expect(result.status).toBe("error")
  })

  it("reports error when the wrong option ended up selected", () => {
    // A polarity mistake must never be reported as success. See PRD 5.2.
    const options = radioGroup(1)
    const result = verify(
      spec(options[0].el, { kind: "radiogroup", options, label: "Require sponsorship?" }),
      { kind: "wrote", value: "Yes" }
    )

    expect(result.status).toBe("error")
  })
})

describe("non-write outcomes pass through unchanged", () => {
  it("keeps skipped as skipped", () => {
    const input = document.createElement("input")
    document.body.append(input)

    const result = verify(spec(input), { kind: "skipped", reason: "No first name saved" })

    expect(result.status).toBe("skipped")
    expect(result.reason).toBe("No first name saved")
  })

  it("keeps needs_you as needs_you", () => {
    const input = document.createElement("input")
    document.body.append(input)

    const result = verify(spec(input), { kind: "needs_you", reason: "No saved answer matches" })

    expect(result.status).toBe("needs_you")
  })

  it("keeps error as error", () => {
    const input = document.createElement("input")
    document.body.append(input)

    const result = verify(spec(input), { kind: "error", reason: "could not open the dropdown" })

    expect(result.status).toBe("error")
  })

  it("never turns a non-write outcome into filled", () => {
    const input = document.createElement("input")
    input.value = "Lavneet"
    document.body.append(input)

    // Even with a value sitting in the DOM, an outcome that did not write
    // must not be promoted.
    for (const attempt of [
      { kind: "skipped" as const, reason: "x" },
      { kind: "needs_you" as const, reason: "x" },
      { kind: "error" as const, reason: "x" }
    ]) {
      expect(verify(spec(input), attempt).status).not.toBe("filled")
    }
  })
})
