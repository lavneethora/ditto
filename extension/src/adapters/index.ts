import type { Adapter } from "~core/types"

import { greenhouse } from "./greenhouse"

/**
 * Adapter registry.
 *
 * Order matters only for detection ties. Adapters contribute site knowledge:
 * how to recognize the page, where the form is, extra rules, and what to
 * ignore. None of them implement filling. When a site needs new widget
 * behaviour, that behaviour is generalised into core/fill/ so every adapter
 * gets it, which is the difference between four adapters and four extensions.
 */
export const ADAPTERS: Adapter[] = [greenhouse]

export function detectAdapter(doc: Document, url: string): Adapter | null {
  for (const adapter of ADAPTERS) {
    try {
      if (adapter.detect(doc, url)) return adapter
    } catch {
      // A broken detector must not take down the whole extension on a page
      // some other adapter would have handled.
    }
  }

  return null
}

export { greenhouse }
