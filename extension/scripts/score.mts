/**
 * Tier 1 coverage scoring (PRD section 8).
 *
 * Runs scan + label + match over every fixture in fixtures/ and reports how
 * many controls were found, how many were recognised, and which were not.
 *
 * This measures *recognition*, which is where breakage lands first when an ATS
 * ships a redesign. It deliberately does not measure filling: jsdom will not
 * drive a react-select, and a green number here would be exactly the kind of
 * false confidence PRD invariant 5.1 exists to prevent. Filling is verified in
 * a real browser.
 *
 * Run: npm run score
 */
import { readdirSync, readFileSync } from "node:fs"
import { basename, resolve } from "node:path"

import { JSDOM } from "jsdom"

const FIXTURE_DIR = resolve(import.meta.dirname, "../../fixtures")

/**
 * One JSDOM for the whole run, with each fixture injected into its body.
 *
 * Creating a JSDOM per fixture looks tidier and silently breaks everything:
 * each instance has its own HTMLInputElement constructor, so the engine's
 * `instanceof` checks fail against elements from any realm but the one whose
 * globals were installed. The symptom is a scan that finds almost no fields
 * and a coverage number that looks like an ATS redesign.
 */
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://job-boards.greenhouse.io/example/jobs/1"
})

const globals = [
  "window", "document", "location",
  "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "HTMLSelectElement",
  "HTMLButtonElement", "Element", "Node", "NodeList", "getComputedStyle", "MutationObserver"
] as const

for (const key of globals) {
  // Node defines some of these (navigator, location) as getter-only on
  // globalThis, so defineProperty rather than assignment.
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value: dom.window[key]
  })
}

// @ts-expect-error minimal stand-in, only used for attribute selectors
globalThis.CSS = { escape: (v: string) => String(v).replace(/[^\w-]/g, (c) => `\\${c}`) }

const { detectAdapter } = await import("../src/adapters/index")
const { match } = await import("../src/core/match")
const { scan } = await import("../src/core/scan")

/** Fixtures are named after the ATS, which is enough to pick a plausible URL. */
function urlFor(file: string): string {
  if (file.startsWith("greenhouse")) return "https://job-boards.greenhouse.io/example/jobs/1"
  if (file.startsWith("lever")) return "https://jobs.lever.co/example/abc123/apply"
  if (file.startsWith("ashby")) return "https://jobs.ashbyhq.com/example/1"
  if (file.startsWith("workday")) return "https://example.wd1.myworkdayjobs.com/en-US/careers/job/1"
  return dom.window.location.href
}

interface Row {
  fixture: string
  ats: string
  found: number
  recognized: number
  unmatched: string[]
}

function score(file: string): Row {
  const html = readFileSync(resolve(FIXTURE_DIR, file), "utf8")
  const doc = dom.window.document

  doc.body.replaceChildren()
  doc.body.insertAdjacentHTML("afterbegin", html)

  const adapter = detectAdapter(doc, urlFor(file))

  if (!adapter) {
    return { fixture: file, ats: "none detected", found: 0, recognized: 0, unmatched: [] }
  }

  const fields = scan(doc, adapter)
  const unmatched = fields.filter((f) => match(f, adapter.rules ?? []) === null)

  return {
    fixture: file,
    ats: adapter.name,
    found: fields.length,
    recognized: fields.length - unmatched.length,
    unmatched: unmatched.map((f) => f.label || "(no label)")
  }
}

const fixtures = readdirSync(FIXTURE_DIR).filter((f) => f.endsWith(".html")).sort()

if (fixtures.length === 0) {
  console.log("No fixtures in fixtures/. Save an application page there first.")
  process.exit(0)
}

const rows = fixtures.map(score)
const pad = (s: string, n: number) => s.padEnd(n)

console.log("")
console.log(`${pad("FIXTURE", 30)}${pad("ATS", 14)}${pad("FOUND", 8)}${pad("KNOWN", 8)}RATE`)
console.log("-".repeat(72))

let totalFound = 0
let totalKnown = 0

for (const row of rows) {
  const rate = row.found === 0 ? 0 : Math.round((row.recognized / row.found) * 100)
  totalFound += row.found
  totalKnown += row.recognized

  console.log(
    `${pad(basename(row.fixture), 30)}${pad(row.ats, 14)}${pad(String(row.found), 8)}${pad(String(row.recognized), 8)}${rate}%`
  )

  for (const label of row.unmatched) {
    console.log(`    unmatched: ${label.slice(0, 68)}`)
  }
}

const overall = totalFound === 0 ? 0 : Math.round((totalKnown / totalFound) * 100)

console.log("-".repeat(72))
console.log(`${pad("TOTAL", 44)}${pad(String(totalFound), 8)}${pad(String(totalKnown), 8)}${overall}%`)
console.log("")
console.log("Recognition only. Filling is verified in a real browser, never here.")

// Not every unmatched field is a defect: a company-specific question has no
// profile answer by definition. This threshold is a smoke alarm, not a gate.
if (overall < 60) {
  console.error(`\nRecognition dropped to ${overall}%, which usually means an ATS changed its markup.`)
  process.exit(1)
}
