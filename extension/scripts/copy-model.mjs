/**
 * Copies the model weights into the build.
 *
 * The bundler leaves the .onnx alone, so it has to be placed by hand. Run
 * after every build, and loud if the file is missing: the offscreen document
 * is configured to refuse remote models, so a build without this ships a
 * recognition tier that silently never matches anything.
 */
import { cpSync, existsSync, mkdirSync } from "node:fs"

/**
 * Everything the bundler will not carry: the weights, and the offscreen page
 * that loads them.
 */
const PARTS = ["assets/model", "assets/offscreen"]
const BUILDS = ["build/chrome-mv3-prod", "build/chrome-mv3-dev"]

for (const part of PARTS) {
  if (existsSync(part)) continue

  console.error(`Missing ${part}. See scripts/fetch-model.mjs.`)
  process.exit(1)
}

for (const build of BUILDS) {
  if (!existsSync(build)) continue

  for (const part of PARTS) {
    const to = `${build}/${part}`
    mkdirSync(to, { recursive: true })
    cpSync(part, to, { recursive: true })
    console.log(`${part} -> ${to}`)
  }
}
