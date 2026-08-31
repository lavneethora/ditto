import { beforeEach, describe, expect, it } from "vitest"

import { scan } from "~core/scan"
import type { FieldSpec } from "~core/types"
import { verify } from "~core/verify"

/**
 * The resume that reported itself missing.
 *
 * Markup copied verbatim off the live Stripe form on job-boards.greenhouse.io,
 * including the part that made the last attempt at this fail: the ONLY label
 * pointing at the resume input reads "Attach", not "Resume/CV". A read-back
 * that goes looking for the field by its label is hunting for a word that
 * disappears along with the button.
 *
 * Attaching does not fill the input. It removes it, and paints a chip naming
 * the file where the buttons were.
 */

const FORM = `
<form id="application-form">
  <div role="group" aria-labelledby="upload-label-resume" aria-required="true" class="file-upload">
    <div id="upload-label-resume" class="label upload-label">Resume/CV<span class="required">*</span></div>
    <div class="file-upload__wrapper">
      <div class="button-container">
        <div class="secondary-button"><div>
          <button type="button" class="btn">Attach</button>
          <label class="visually-hidden" for="resume">Attach</label>
          <input id="resume" class="visually-hidden" type="file" accept=".pdf,.doc,.docx,.txt,.rtf">
        </div></div>
        <p class="file-upload__filetypes">Accepted file types: pdf, doc, docx, txt, rtf</p>
      </div>
    </div>
  </div>
  <div role="group" aria-labelledby="upload-label-cover_letter" class="file-upload">
    <div id="upload-label-cover_letter" class="label upload-label">Cover Letter</div>
    <div class="file-upload__wrapper">
      <div class="button-container">
        <div class="secondary-button"><div>
          <button type="button" class="btn">Attach</button>
          <label class="visually-hidden" for="cover_letter">Attach</label>
          <input id="cover_letter" class="visually-hidden" type="file" accept=".pdf,.doc,.docx">
        </div></div>
      </div>
    </div>
  </div>
</form>`

/** Exactly what the site swaps the button block for. */
const CHIP = `
  <div class="file-upload__filename">
    <p class="body body__secondary">Lavneet_Hora_Resume.pdf</p>
    <button type="button" aria-label="Remove file"></button>
  </div>`

const attempt = { kind: "wrote", value: "Lavneet_Hora_Resume.pdf" } as const

function fileFields(): { resume: FieldSpec; cover: FieldSpec } {
  const files = scan(document).filter((f) => f.kind === "file")
  const resume = files.find((f) => f.el.id === "resume")
  const cover = files.find((f) => f.el.id === "cover_letter")
  if (!resume || !cover) throw new Error(`scan found ${files.length} file fields`)
  return { resume, cover }
}

/** Attach a file the way the page does: input removed, chip in its place. */
function commitFile(index: number): void {
  document.querySelectorAll(".file-upload__wrapper")[index]!.innerHTML = CHIP
}

describe("a resume Greenhouse has taken", () => {
  beforeEach(() => {
    document.body.innerHTML = FORM
  })

  it("is confirmed from the chip once the input is gone", () => {
    const { resume } = fileFields()

    commitFile(0)
    expect(document.getElementById("resume")).toBeNull()

    expect(verify(resume, attempt).status).toBe("filled")
  })

  it("survives the label that says Attach rather than Resume/CV", () => {
    const { resume } = fileFields()

    // The trap the previous fix fell into. Whatever the label resolves to, it
    // must not be what gets us back to the block.
    commitFile(0)

    expect(verify(resume, attempt).status).toBe("filled")
  })

  it("does not answer for one uploader with another's file", () => {
    const { resume, cover } = fileFields()

    commitFile(1)

    expect(verify(cover, attempt).status).toBe("filled")
    expect(verify(resume, attempt).status).not.toBe("filled")
  })

  it("still reports a genuinely empty uploader as unfilled", () => {
    const { resume } = fileFields()

    expect(verify(resume, attempt).status).not.toBe("filled")
  })
})
