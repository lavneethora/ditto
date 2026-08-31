/**
 * Embeds the phrasings and writes the vectors the extension ships with.
 *
 * Run at build time, never at run time. The model is 23MB and lives in the
 * extension; only the label being matched is embedded on the user's machine,
 * against these.
 *
 * Rounded to four decimals, which costs nothing at a 0.46 threshold and takes
 * the file from megabytes to hundreds of kilobytes.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { pipeline, env } from "@huggingface/transformers"

env.localModelPath = "./assets"
env.allowRemoteModels = false

const source = readFileSync("./src/core/semantic/phrasings.ts", "utf8")
const body = source.slice(source.indexOf("= {") + 2)

// The table is plain data, so it is read rather than imported: this script
// runs in node and the file is TypeScript.
const PHRASINGS = {}
for (const match of body.matchAll(/"?([\w.[\]]+)"?:\s*\[([^\]]*)\]/g)) {
  const key = match[1]
  const values = [...match[2].matchAll(/"([^"]+)"/g)].map((m) => m[1])
  if (values.length > 0) PHRASINGS[key] = values
}

const embed = await pipeline("feature-extraction", "model", { dtype: "q8" })

const vectors = []
for (const [key, phrasings] of Object.entries(PHRASINGS)) {
  for (const phrasing of phrasings) {
    const out = await embed(phrasing, { pooling: "mean", normalize: true })
    vectors.push({ key, of: phrasing, v: Array.from(out.data).map((n) => Math.round(n * 1e4) / 1e4) })
  }
}

writeFileSync("./src/core/semantic/vectors.json", JSON.stringify({ dims: vectors[0].v.length, vectors }))
console.log(`${vectors.length} phrasings across ${new Set(vectors.map((v) => v.key)).size} keys`)
