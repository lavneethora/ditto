import cssText from "data-text:~ui/styles.css"
import type { PlasmoCSConfig, PlasmoGetStyle } from "plasmo"
import { useEffect, useState } from "react"

import { detectAdapter } from "~adapters"
import type { Adapter } from "~core/types"
import { Drawer } from "~ui/drawer/Drawer"

/**
 * Mounts the Ditto drawer on a supported application page.
 *
 * `all_frames` is on because Greenhouse embeds itself into company career
 * sites through an iframe whose src is a greenhouse.io origin. The host
 * permissions match that iframe, so the content script reaches it.
 *
 * Which frame gets the drawer is decided in `shouldMount` below, and getting
 * that wrong produces either a drawer squeezed inside a 600px iframe or no
 * drawer at all on an embedded board.
 */
export const config: PlasmoCSConfig = {
  matches: [
    "https://*.myworkdayjobs.com/*",
    "https://boards.greenhouse.io/*",
    "https://job-boards.greenhouse.io/*",
    "https://jobs.lever.co/*",
    "https://*.ashbyhq.com/*"
  ],
  all_frames: true,
  run_at: "document_idle"
}

/**
 * Plasmo renders content UI into a shadow root, and this is the stylesheet for
 * it. Without the shadow root, Workday's and Greenhouse's global CSS reach in
 * and take the panel apart.
 */
export const getStyle: PlasmoGetStyle = () => {
  const style = document.createElement("style")
  style.textContent = cssText
  return style
}

const isTopFrame = () => {
  try {
    return window.top === window.self
  } catch {
    // Cross-origin parent. From here this frame cannot talk to the top, so it
    // has to treat itself as the host if it holds the form.
    return false
  }
}

/**
 * Exactly one drawer, in the right frame.
 *
 * The top frame gets it whenever it holds the form. A sub-frame only gets it
 * when it holds the form and the top frame is cross-origin, which is the
 * embedded-Greenhouse case: without this the board would get no drawer at all,
 * since the extension has no permission to inject into the company's own page.
 */
function shouldMount(adapter: Adapter | null): boolean {
  if (!adapter) return false
  if (isTopFrame()) return true

  // A sub-frame that owns the form is the only place left to put the panel.
  return adapter.detect(document, location.href)
}

function Mount() {
  const [adapter, setAdapter] = useState<Adapter | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // These are single-page apps: the application form frequently is not in
    // the DOM at document_idle, and Workday swaps the whole form between
    // wizard steps without navigating. Re-detect until something appears, then
    // keep watching.
    const detect = () => {
      const found = detectAdapter(document, location.href)
      setAdapter(found)
      setReady(true)
    }

    detect()

    const observer = new MutationObserver(detect)
    observer.observe(document.documentElement, { childList: true, subtree: true })

    return () => observer.disconnect()
  }, [])

  if (!ready || !shouldMount(adapter) || !adapter) return null

  return <Drawer adapter={adapter} doc={document} />
}

export default Mount
