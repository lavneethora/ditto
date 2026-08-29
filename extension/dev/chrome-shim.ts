/**
 * Minimal chrome.storage.local shim so the UI can run in a plain browser tab.
 *
 * This exists for the dev harness only and never ships. It is backed by
 * localStorage rather than a Map on purpose: "does a profile survive a
 * reload" is the thing M0 has to prove, and an in-memory stub would pass that
 * check without proving anything.
 *
 * The promise-returning shape matches MV3, which is what @plasmohq/storage
 * detects and uses.
 */

const PREFIX = "ditto-harness:"

type Listener = (
  changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
  areaName: string
) => void

const listeners = new Set<Listener>()

function readAll(): Record<string, unknown> {
  const out: Record<string, unknown> = {}

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key?.startsWith(PREFIX)) continue

    const raw = localStorage.getItem(key)
    if (raw === null) continue

    try {
      out[key.slice(PREFIX.length)] = JSON.parse(raw)
    } catch {
      // A value we cannot parse is treated as absent, matching how the real
      // store falls back to defaults rather than throwing.
    }
  }

  return out
}

function normalizeKeys(keys: string | string[] | Record<string, unknown> | null): string[] | null {
  if (keys === null || keys === undefined) return null
  if (typeof keys === "string") return [keys]
  if (Array.isArray(keys)) return keys
  return Object.keys(keys)
}

const local = {
  QUOTA_BYTES: 10_485_760,

  async get(keys: string | string[] | Record<string, unknown> | null = null) {
    const all = readAll()
    const wanted = normalizeKeys(keys)

    if (wanted === null) return all

    const out: Record<string, unknown> = {}
    for (const key of wanted) {
      if (key in all) out[key] = all[key]
    }
    return out
  },

  async set(items: Record<string, unknown>) {
    const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {}

    for (const [key, value] of Object.entries(items)) {
      const storageKey = PREFIX + key
      const previous = localStorage.getItem(storageKey)

      localStorage.setItem(storageKey, JSON.stringify(value))
      changes[key] = {
        oldValue: previous === null ? undefined : JSON.parse(previous),
        newValue: value
      }
    }

    for (const listener of listeners) listener(changes, "local")
  },

  async remove(keys: string | string[]) {
    const list = Array.isArray(keys) ? keys : [keys]
    const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {}

    for (const key of list) {
      const storageKey = PREFIX + key
      const previous = localStorage.getItem(storageKey)
      localStorage.removeItem(storageKey)
      changes[key] = { oldValue: previous === null ? undefined : JSON.parse(previous) }
    }

    for (const listener of listeners) listener(changes, "local")
  },

  async clear() {
    for (const key of Object.keys(readAll())) localStorage.removeItem(PREFIX + key)
  },

  async getBytesInUse() {
    let bytes = 0
    for (const [key, value] of Object.entries(readAll())) {
      bytes += key.length + JSON.stringify(value).length
    }
    return bytes
  }
}

const onChanged = {
  addListener: (fn: Listener) => listeners.add(fn),
  removeListener: (fn: Listener) => listeners.delete(fn),
  hasListener: (fn: Listener) => listeners.has(fn)
}

function installChromeShim() {
  if (typeof globalThis === "undefined") return

  const existing = (globalThis as Record<string, unknown>).chrome
  if (existing && (existing as { storage?: unknown }).storage) return

  ;(globalThis as Record<string, unknown>).chrome = {
    runtime: {
      id: "ditto-harness",
      lastError: undefined,
      getURL: (path: string) => path,
      openOptionsPage: () => console.info("[harness] openOptionsPage()")
    },
    storage: {
      local,
      sync: local,
      onChanged
    }
  }
}

// Self-installing side-effect module. Importing this before anything that
// touches chrome.* is what guarantees ordering, since ES modules evaluate in
// import order. That is why the harness entry can use a static import of the
// app rather than a dynamic one, which is what was handing Vite an excuse to
// hand out two React instances.
installChromeShim()
