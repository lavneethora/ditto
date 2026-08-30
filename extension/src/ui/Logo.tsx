import { useEffect } from "react"

import iconUrl from "data-base64:../../assets/icon.png"
import markUrl from "data-base64:../../assets/mark.png"

import { loadGeistMono } from "./geist-mono"

/**
 * The Ditto mark, inlined as a data URL.
 *
 * Inlined rather than referenced by extension URL because the drawer renders
 * inside a host page, where a chrome-extension:// image request depends on the
 * page's CSP and on the asset being declared web-accessible. A data URL has
 * neither dependency.
 *
 * Two assets, because they have opposite requirements. `icon.png` carries 6%
 * padding so Chrome can draw it flush in a toolbar square. `mark.png` is
 * trimmed hard to its ink, which is what a lockup beside text needs: with the
 * padded version the ink fills only ~72% of its box, so the box centres
 * perfectly while the mark reads as sitting off centre.
 */
export function Logo({
  size = 28,
  padded = false,
  optical = false
}: {
  size?: number
  padded?: boolean
  optical?: boolean
}) {
  return (
    <img
      src={padded ? iconUrl : markUrl}
      alt=""
      aria-hidden="true"
      style={{
        display: "block",
        flexShrink: 0,
        // Height drives it; the artwork is about 1.2:1, so width follows.
        height: size,
        width: "auto",
        transform: optical ? `translateY(${OPTICAL_Y * 100}%)` : undefined
      }}
    />
  )
}

/**
 * Optical corrections for this particular artwork.
 *
 * Measured, not guessed: weighting every pixel by alpha x (1 - luminance),
 * which approximates how strongly it reads against a white ground, the mark's
 * visual centre sits 3.9% below and 7.0% right of its geometric centre. The
 * solid blue D carries nearly all the weight while the pale streaks above and
 * to its left carry almost none.
 *
 * So a geometrically perfect lockup still looks wrong: the mark reads as
 * sagging, and as crowding the wordmark. These two constants cancel that.
 */
const OPTICAL_Y = -0.039
const OPTICAL_X = 0.07

/**
 * Geist Mono cap height, as a fraction of font size.
 *
 * Measured from the rendered face rather than guessed: at 19.68px the ink
 * ascent of "Ditto" is 14.11px, so 14.11 / 19.68 = 0.717.
 */
const CAP_HEIGHT_RATIO = 0.717

/**
 * Mark height relative to cap height.
 *
 * Slightly taller than the capitals is the usual lockup proportion: matched
 * exactly, a mark reads as too small next to the letterforms.
 */
const MARK_TO_CAP = 1.16

/** Width over height of the trimmed artwork, from scripts/make-icon.mjs. */
const MARK_ASPECT = 1.22

/**
 * Mark plus wordmark and tagline, for panel and page headers.
 *
 * `size` is the wordmark's font size. The mark is derived from the text's cap
 * height rather than set independently, so the two stay locked together at any
 * size instead of drifting apart whenever one is tweaked.
 */
export function Wordmark({ size = 22, tagline = true }: { size?: number; tagline?: boolean }) {
  // Registered here rather than at each call site, so any surface showing the
  // wordmark gets the face without having to remember to ask for it.
  useEffect(() => {
    void loadGeistMono()
  }, [])

  const markHeight = Math.round(size * CAP_HEIGHT_RATIO * MARK_TO_CAP)

  // The mark's weight sits right of its box, so its mass ends up closer to the
  // wordmark than the nominal gap suggests. Widen the gap by that much.
  const markWidth = markHeight * MARK_ASPECT
  const gap = Math.round(9 + markWidth * OPTICAL_X)

  return (
    <div style={{ display: "flex", alignItems: "center", gap, minWidth: 0 }}>
      <Logo size={markHeight} optical />

      {/* Baseline group, centred as a unit against the mark. line-height 1 on
          both spans keeps this box equal to the glyph box, so the centring
          above lands on the letterforms rather than on leading. */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
        <span className="ditto-brand-name" style={{ fontSize: size, lineHeight: 1 }}>
          Ditto
        </span>
        {tagline && (
          <span className="ditto-brand-tag" style={{ lineHeight: 1 }}>
            fill once, ditto everywhere
          </span>
        )}
      </div>
    </div>
  )
}
