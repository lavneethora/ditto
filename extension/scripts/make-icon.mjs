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

/*
 * assets/mark.png: the same artwork trimmed hard to its ink, for the wordmark
 * lockup in the UI.
 *
 * The toolbar icon needs that 6% padding, because Chrome draws it flush inside
 * a small square. The lockup needs the opposite: with padding, the mark's ink
 * fills only ~72% of its box, so the box centres perfectly against the text
 * while the mark itself reads as sitting off. Trimming makes the box the ink,
 * and centring then does what it looks like it should.
 *
 * Not square: the artwork is about 1.2:1, so height is set in CSS and width
 * follows.
 */
const markOut = resolve(here, "../assets/mark.png")

await sharp(source).trim({ threshold: 1 }).png().toFile(markOut)

const markMeta = await sharp(markOut).metadata()
console.log(
  `wrote ${markOut} (${markMeta.width}x${markMeta.height}, ratio ${(markMeta.width / markMeta.height).toFixed(3)})`
)
