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
