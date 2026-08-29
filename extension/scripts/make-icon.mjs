/**
 * Derives assets/icon.png from assets/logo-source.png.
 *
 * Plasmo resizes icon.png into every manifest size at build time, but it does
 * a plain downscale. The source logo is 1254px with the mark inset in a lot of
 * transparent padding, and at 16px that padding is most of the icon and the
 * mark turns to mush. So this trims the transparent margin first, then adds a
 * small, predictable one back.
 *
 * Run: node scripts/make-icon.mjs
 */
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import sharp from "sharp"

const here = dirname(fileURLToPath(import.meta.url))
const source = resolve(here, "../assets/logo-source.png")
const out = resolve(here, "../assets/icon.png")

const SIZE = 512
/** Roughly 6% padding on each side, which reads as balanced in the toolbar. */
const PADDING = Math.round(SIZE * 0.06)
const INNER = SIZE - PADDING * 2

const trimmed = await sharp(source)
  // Trim fully transparent edges. The threshold is on alpha, so the soft
  // motion streaks on the left survive.
  .trim({ threshold: 1 })
  .resize(INNER, INNER, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .toBuffer()

await sharp({
  create: {
    width: SIZE,
    height: SIZE,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 }
  }
})
  .composite([{ input: trimmed, top: PADDING, left: PADDING }])
  .png()
  .toFile(out)

const meta = await sharp(out).metadata()
console.log(`wrote ${out} (${meta.width}x${meta.height}, alpha: ${meta.hasAlpha})`)
