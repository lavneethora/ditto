/**
 * Owns the offscreen document the sentence model runs in.
 *
 * Content scripts cannot create one, and only a single offscreen document may
 * exist per extension, so creation is funnelled through here and guarded
 * against the race of two tabs autofilling at once.
 */

let creating: Promise<void> | null = null

async function ensureOffscreen(): Promise<void> {
  const existing = await chrome.runtime.getContexts?.({
    contextTypes: ["OFFSCREEN_DOCUMENT" as chrome.runtime.ContextType]
  })

  if (existing && existing.length > 0) return

  creating ??= chrome.offscreen
    .createDocument({
      url: "assets/offscreen/index.html",
      reasons: ["WORKERS" as chrome.offscreen.Reason],
      justification: "Runs the local sentence model that recognises unfamiliar form labels."
    })
    .finally(() => {
      creating = null
    })

  await creating
}

/**
 * Warmed as soon as the browser starts, not on the first request.
 *
 * Loading 23MB of weights takes seconds. Created lazily, the very first
 * autofill would race that load, blow its budget and come back with nothing,
 * so the tier would look broken exactly once per install: the run where
 * someone is deciding whether it works.
 *
 * The page starts loading the model the moment it exists, so by the time
 * anyone fills a form it is ready.
 */
chrome.runtime.onStartup?.addListener(() => void ensureOffscreen().catch(() => {}))
chrome.runtime.onInstalled?.addListener(() => void ensureOffscreen().catch(() => {}))

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== "ditto:embed" || sender.tab === undefined) return false

  void (async () => {
    try {
      await ensureOffscreen()
      // Re-sent, now that somewhere exists to answer it.
      respond(await chrome.runtime.sendMessage({ ...message, forwarded: true }))
    } catch (error) {
      respond({ ok: false, reason: String(error) })
    }
  })()

  return true
})
