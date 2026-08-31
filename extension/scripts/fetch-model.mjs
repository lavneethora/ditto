/**
 * Fetches the sentence model and the runtime the offscreen page loads it with.
 *
 * Not committed to the repository: 45MB of binaries do not belong in git
 * history, and this makes the checkout reproducible without them. Run once
 * after cloning, and again if the transformers version changes, since the
 * WASM runtime has to match the library that loads it.
 *
 * all-MiniLM-L6-v2, quantised to int8. Chosen for size against a task that is
 * ranking a short label against forty fixed keys, where a larger model buys
 * accuracy the threshold does not need.
 */
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs"

const HOST = "https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main"
const CONFIG = ["config.json", "tokenizer.json", "tokenizer_config.json", "special_tokens_map.json"]
const RUNTIME = [
  "transformers.min.js",
  "ort-wasm-simd-threaded.jsep.mjs",
  "ort-wasm-simd-threaded.jsep.wasm"
]

mkdirSync("assets/model/onnx", { recursive: true })
mkdirSync("assets/offscreen", { recursive: true })

for (const file of CONFIG) {
  const response = await fetch(`${HOST}/${file}`)
  if (!response.ok) throw new Error(`${file}: ${response.status}`)

  writeFileSync(`assets/model/${file}`, Buffer.from(await response.arrayBuffer()))
  console.log(`model/${file}`)
}

const weights = await fetch(`${HOST}/onnx/model_quantized.onnx`)
if (!weights.ok) throw new Error(`weights: ${weights.status}`)

writeFileSync("assets/model/onnx/model_quantized.onnx", Buffer.from(await weights.arrayBuffer()))
console.log("model/onnx/model_quantized.onnx")

// Taken from the installed package rather than downloaded, so the runtime
// always matches the library the vectors were built with.
for (const file of RUNTIME) {
  const from = `node_modules/@huggingface/transformers/dist/${file}`
  if (!existsSync(from)) throw new Error(`${from} missing: run npm install first`)

  cpSync(from, `assets/offscreen/${file}`)
  console.log(`offscreen/${file}`)
}
