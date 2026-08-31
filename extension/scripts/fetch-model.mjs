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
import { createHash } from "node:crypto"
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs"

/**
 * Pinned to a revision, and checked against the bytes this build was made
 * with.
 *
 * `main` is a moving branch. If the model behind it changed, the vectors in
 * src/core/semantic/vectors.json would still describe the OLD model, every
 * comparison would be between two different embedding spaces, and the tier
 * would quietly stop recognising anything while continuing to look installed.
 *
 * A mismatch here means the vectors need rebuilding, not that the checksum
 * needs updating.
 */
const REVISION = "751bff37182d3f1213fa05d7196b954e230abad9"
const HOST = `https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/${REVISION}`

const EXPECTED = {
  "config.json": "7135149f7cffa1a573466c6e4d8423ed73b62fd2332c575bf738a0d033f70df7",
  "tokenizer.json": "da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0",
  "tokenizer_config.json": "9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3",
  "special_tokens_map.json": "b6d346be366a7d1d48332dbc9fdf3bf8960b5d879522b7799ddba59e76237ee3",
  "onnx/model_quantized.onnx":
    "afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1"
}

/** Writes the file, or stops the build if it is not what was expected. */
function keep(path, name, bytes) {
  const got = createHash("sha256").update(bytes).digest("hex")

  if (got !== EXPECTED[name]) {
    console.error(`${name} is not the file this build was made with.`)
    console.error(`  expected ${EXPECTED[name]}`)
    console.error(`  got      ${got}`)
    console.error("Rebuild the vectors with npm run build:vectors before trusting them.")
    process.exit(1)
  }

  writeFileSync(path, bytes)
  console.log(name)
}
const CONFIG = ["config.json", "tokenizer.json", "tokenizer_config.json", "special_tokens_map.json"]
const RUNTIME = [
  "transformers.min.js",
  "ort-wasm-simd-threaded.jsep.mjs",
  "ort-wasm-simd-threaded.jsep.wasm"
]

mkdirSync("assets/model/onnx", { recursive: true })
mkdirSync("assets/offscreen", { recursive: true })

for (const file of [...CONFIG, "onnx/model_quantized.onnx"]) {
  const response = await fetch(`${HOST}/${file}`)
  if (!response.ok) throw new Error(`${file}: ${response.status}`)

  keep(`assets/model/${file}`, file, Buffer.from(await response.arrayBuffer()))
}

// Taken from the installed package rather than downloaded, so the runtime
// always matches the library the vectors were built with.
for (const file of RUNTIME) {
  const from = `node_modules/@huggingface/transformers/dist/${file}`
  if (!existsSync(from)) throw new Error(`${from} missing: run npm install first`)

  cpSync(from, `assets/offscreen/${file}`)
  console.log(`offscreen/${file}`)
}
