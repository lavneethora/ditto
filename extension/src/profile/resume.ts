import { type Resume } from "./schema"

/**
 * Resume storage and rehydration.
 *
 * chrome.storage serializes to JSON, so a File cannot be stored directly. The
 * bytes go in as base64 and come back out as a real File object, because the
 * only way to attach a resume to a form is to hand a genuine File to a
 * DataTransfer. See core/fill/file.ts for the attach side.
 */

/** Workday caps uploads at 5MB and is the strictest of the four. */
export const MAX_RESUME_BYTES = 5 * 1024 * 1024

export const ACCEPTED_RESUME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
] as const

const ACCEPTED_EXTENSIONS = [".pdf", ".doc", ".docx"]

/**
 * Reject a file before it is stored, with a message meant for a human. Returns
 * null when the file is fine.
 */
export function validateResumeFile(file: File): string | null {
  if (file.size === 0) {
    return "That file is empty."
  }

  if (file.size > MAX_RESUME_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1)
    return `That file is ${mb}MB. Most application forms cap uploads at 5MB.`
  }

  const name = file.name.toLowerCase()
  const extensionOk = ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext))
  const typeOk = (ACCEPTED_RESUME_TYPES as readonly string[]).includes(file.type)

  // Some browsers report an empty type for .doc, so an accepted extension is
  // enough on its own.
  if (!extensionOk && !typeOk) {
    return "Resumes need to be a PDF, DOC or DOCX."
  }

  return null
}

/**
 * Encode bytes as base64 in chunks.
 *
 * `btoa(String.fromCharCode(...bytes))` blows the call stack somewhere around
 * a hundred thousand arguments, which a resume comfortably exceeds.
 */
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000
  let binary = ""

  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }

  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }

  return bytes
}

/** Read a picked File into a storable Resume record. */
export async function fileToResume(file: File): Promise<Resume> {
  const buffer = await file.arrayBuffer()

  return {
    filename: file.name,
    mimeType: file.type || guessMimeType(file.name),
    size: file.size,
    data: bytesToBase64(new Uint8Array(buffer)),
    updatedAt: Date.now()
  }
}

/**
 * Rebuild a real File from storage, ready to hand to a DataTransfer.
 *
 * The `lastModified` is set to now rather than preserved, because some upload
 * widgets deduplicate on name plus lastModified and will silently ignore a
 * second attach of what looks like the same file.
 */
export function resumeToFile(resume: Resume): File {
  const bytes = base64ToBytes(resume.data)

  return new File([bytes as BlobPart], resume.filename, {
    type: resume.mimeType,
    lastModified: Date.now()
  })
}

function guessMimeType(filename: string): string {
  const name = filename.toLowerCase()
  if (name.endsWith(".pdf")) return "application/pdf"
  if (name.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  }
  if (name.endsWith(".doc")) return "application/msword"
  return "application/octet-stream"
}

/** "Resume.pdf, 284 KB" for the drawer row. */
export function describeResume(resume: Resume | null): string {
  if (!resume) return "No resume uploaded"

  const kb = resume.size / 1024
  const size = kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`

  return `${resume.filename}, ${size}`
}
