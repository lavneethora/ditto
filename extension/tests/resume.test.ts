import { describe, expect, it } from "vitest"

import {
  MAX_RESUME_BYTES,
  describeResume,
  fileToResume,
  resumeToFile,
  validateResumeFile
} from "~profile/resume"

/**
 * Guards the resume half of PRD section 8's `file.test.ts` requirement: the
 * bytes have to survive the trip through chrome.storage and come back out as
 * a File that an upload widget will actually accept.
 */

function makeFile(name: string, bytes: Uint8Array, type = "application/pdf"): File {
  return new File([bytes as BlobPart], name, { type })
}

/** A byte pattern that covers the full 0-255 range, including non-UTF8 bytes. */
function everyByte(repeat = 1): Uint8Array {
  const out = new Uint8Array(256 * repeat)
  for (let i = 0; i < out.length; i++) out[i] = i % 256
  return out
}

describe("resume round-trip", () => {
  it("preserves every byte value through base64 storage", async () => {
    const original = everyByte()
    const resume = await fileToResume(makeFile("Hora_Lavneet_Resume.pdf", original))
    const restored = resumeToFile(resume)
    const restoredBytes = new Uint8Array(await restored.arrayBuffer())

    expect(restoredBytes).toEqual(original)
  })

  it("preserves filename, mime type and size", async () => {
    const bytes = everyByte()
    const resume = await fileToResume(makeFile("Hora_Lavneet_Resume.pdf", bytes))

    expect(resume.filename).toBe("Hora_Lavneet_Resume.pdf")
    expect(resume.mimeType).toBe("application/pdf")
    expect(resume.size).toBe(bytes.length)

    const restored = resumeToFile(resume)
    expect(restored.name).toBe("Hora_Lavneet_Resume.pdf")
    expect(restored.type).toBe("application/pdf")
    expect(restored.size).toBe(bytes.length)
  })

  it("survives a real JSON serialization cycle, as chrome.storage does", async () => {
    const original = everyByte(4)
    const resume = await fileToResume(makeFile("resume.pdf", original))

    const throughStorage = JSON.parse(JSON.stringify(resume))
    const restoredBytes = new Uint8Array(await resumeToFile(throughStorage).arrayBuffer())

    expect(restoredBytes).toEqual(original)
  })

  it("handles a file large enough to break naive base64 encoding", async () => {
    // String.fromCharCode(...bytes) throws past roughly 100k arguments, so a
    // chunked encoder is not optional at realistic resume sizes.
    const original = everyByte(2048) // 512KB
    const resume = await fileToResume(makeFile("big.pdf", original))
    const restoredBytes = new Uint8Array(await resumeToFile(resume).arrayBuffer())

    expect(restoredBytes.length).toBe(original.length)
    expect(restoredBytes).toEqual(original)
  })

  it("gives the restored file a fresh lastModified so widgets do not dedupe it", async () => {
    const resume = await fileToResume(makeFile("resume.pdf", everyByte()))
    const before = Date.now() - 1

    expect(resumeToFile(resume).lastModified).toBeGreaterThanOrEqual(before)
  })
})

describe("validateResumeFile", () => {
  it("accepts pdf, doc and docx", () => {
    const bytes = everyByte()
    expect(validateResumeFile(makeFile("a.pdf", bytes))).toBeNull()
    expect(validateResumeFile(makeFile("a.doc", bytes, "application/msword"))).toBeNull()
    expect(
      validateResumeFile(
        makeFile(
          "a.docx",
          bytes,
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
      )
    ).toBeNull()
  })

  it("accepts a .doc whose type the browser failed to report", () => {
    expect(validateResumeFile(makeFile("resume.doc", everyByte(), ""))).toBeNull()
  })

  it("rejects an empty file", () => {
    expect(validateResumeFile(makeFile("a.pdf", new Uint8Array(0)))).toMatch(/empty/i)
  })

  it("rejects the wrong file type", () => {
    expect(validateResumeFile(makeFile("photo.png", everyByte(), "image/png"))).toMatch(
      /PDF, DOC or DOCX/
    )
  })

  it("rejects a file over the 5MB form limit", () => {
    const oversized = new Uint8Array(MAX_RESUME_BYTES + 1)
    expect(validateResumeFile(makeFile("huge.pdf", oversized))).toMatch(/5MB/)
  })
})

describe("describeResume", () => {
  it("reports KB and MB readably", async () => {
    const small = await fileToResume(makeFile("resume.pdf", everyByte(4))) // 1KB
    expect(describeResume(small)).toBe("resume.pdf, 1 KB")

    const large = await fileToResume(makeFile("resume.pdf", everyByte(8192))) // 2MB
    expect(describeResume(large)).toBe("resume.pdf, 2.0 MB")
  })

  it("says so when there is no resume", () => {
    expect(describeResume(null)).toBe("No resume uploaded")
  })
})
