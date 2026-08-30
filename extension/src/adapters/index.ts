import type { Adapter } from "~core/types"

import { ashby } from "./ashby"
import { greenhouse } from "./greenhouse"
import { lever } from "./lever"
import { workday } from "./workday"

/**
 * Adapter registry.
 *
 * Order matters only for detection ties. Adapters contribute site knowledge:
 * how to recognize the page, where the form is, extra rules, and what to
 * ignore. None of them implement filling. When a site needs new widget
 * behaviour, that behaviour is generalised into core/fill/ so every adapter
 * gets it, which is the difference between four adapters and four extensions.
 */
export const ADAPTERS: Adapter[] = [greenhouse, lever, ashby, workday]

export function detectAdapter(doc: Document, url: string): Adapter | null {
  const host = hostOf(url)

  // Host first, and authoritative. Markup fingerprints are fuzzy by nature,
  // and two of these ATS ship the same form id, so letting markup outrank the
  // domain means one adapter can claim another's pages depending only on the
  // order of this array.
  if (host) {
    for (const adapter of ADAPTERS) {
      if (adapter.hosts?.some((pattern) => pattern.test(host))) return adapter
    }
  }

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

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ""
  }
}

export { ashby, greenhouse, lever, workday }
