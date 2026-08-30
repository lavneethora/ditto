import { useEffect } from "react"

import logoUrl from "data-base64:../../assets/icon.png"

import { loadGeistMono } from "./geist-mono"

/**
 * The Ditto mark, inlined as a data URL.
 *
 * Inlined rather than referenced by extension URL because the drawer renders
 * inside a host page, where a chrome-extension:// image request depends on the
 * page's CSP and on the asset being declared web-accessible. A data URL has
 * neither dependency.
 */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <img
      src={logoUrl}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      style={{ display: "block", flexShrink: 0 }}
    />
  )
}

/** Mark plus wordmark and tagline, for panel and page headers. */
export function Wordmark({ size = 28, tagline = true }: { size?: number; tagline?: boolean }) {
  // Registered here rather than at each call site, so any surface showing the
  // wordmark gets the face without having to remember to ask for it.
  useEffect(() => {
    void loadGeistMono()
  }, [])

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
      <Logo size={size} />
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
        <span className="ditto-brand-name" style={{ fontSize: size * 0.82 }}>
          Ditto
        </span>
        {tagline && <span className="ditto-brand-tag">fill once, ditto everywhere</span>}
      </div>
    </div>
  )
}
