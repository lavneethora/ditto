import { beforeEach, describe, expect, it } from "vitest"

import type { FieldSpec } from "~core/types"
import { verify } from "~core/verify"

/**
 * The resume that reported itself missing.
 *
 * Markup taken off the live Stripe form on job-boards.greenhouse.io, in both
 * states. Attaching a file there does not fill the input, it REPLACES the
 * whole Attach/Dropbox block with a chip naming the file, so the input Ditto
 * attached to no longer exists a moment later. Read-back gave up at that
 * point and put a red cross on a resume the user could see was uploaded.
 */

const EMPTY = `
<form id="application-form">
  <div class="file-upload">
    <label class="label" for="resume">Resume/CV<span>*</span></label>
    <div class="file-upload__wrapper">
      <div class="button-container">
        <button type="button">Attach</button>
        <input id="resume" type="file" accept=".pdf,.doc,.docx,.txt,.rtf" required />
      </div>
    </div>
  </div>
  <div class="file-upload">
    <label class="label" for="cover_letter">Cover Letter</label>
    <div class="file-upload__wrapper">
      <div class="button-container">
        <button type="button">Attach</button>
        <input id="cover_letter" type="file" accept=".pdf,.doc,.docx" />
      </div>
    </div>
  </div>
</form>`

/** What the page becomes once the file is taken. Note: no input. */
const COMMITTED_CHIP = `
      <div class="file-upload__filename">
        <p class="body body__secondary">Lavneet_Hora_Resume.pdf</p>
        <button type="button" aria-label="Remove file"></button>
      </div>`

function fieldFor(id: string, label: string): FieldSpec {
  const el = document.getElementById(id)
  if (!el) throw new Error(`no element for ${id}`)

  return { id, el, kind: "file", label, required: true } as FieldSpec
}

const attempt = { kind: "wrote", value: "Lavneet_Hora_Resume.pdf" } as const

describe("a resume Greenhouse has taken", () => {
  beforeEach(() => {
    document.body.innerHTML = EMPTY
  })

  it("is confirmed from the chip after the input is removed", () => {
    const field = fieldFor("resume", "Resume/CV")

    // Exactly what the site does on attach.
    const wrapper = document.querySelector(".file-upload__wrapper")!
    wrapper.innerHTML = COMMITTED_CHIP
    expect(document.getElementById("resume")).toBeNull()

    const result = verify(field, attempt)

    expect(result.status).toBe("filled")
  })

  it("does not answer for one uploader with another's file", () => {
    const resume = fieldFor("resume", "Resume/CV")
    const cover = fieldFor("cover_letter", "Cover Letter")

    // Only the cover letter gets a file.
    document.querySelectorAll(".file-upload__wrapper")[1]!.innerHTML = COMMITTED_CHIP
    document.getElementById("cover_letter")?.remove()

    expect(verify(cover, attempt).status).toBe("filled")
    expect(verify(resume, attempt).status).not.toBe("filled")
  })

  it("still reports a genuinely empty uploader as unfilled", () => {
    const field = fieldFor("resume", "Resume/CV")

    expect(verify(field, attempt).status).not.toBe("filled")
  })
})
