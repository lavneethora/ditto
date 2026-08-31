/**
 * The page the sentence model runs in.
 *
 * Plain files rather than anything the bundler touches. Parcel cannot parse
 * the import attributes transformers.js ships with, and this is the whole
 * reason the page lives in assets/ instead of src/.
 *
 * Three places the model could have run, and two of them do not work:
 *
 *  - A content script is subject to the PAGE's content security policy for
 *    WebAssembly, and Workday and Greenhouse both ship strict ones, so it
 *    would fail to instantiate on exactly the sites Ditto exists for.
 *  - The service worker is stopped after thirty seconds idle, and reloading
 *    23MB on every autofill is not a cost worth paying.
 *
 * An offscreen document lives until it is closed, so the model loads once per
 * browser session.
 *
 * Everything is local. Remote models are refused, so a build that shipped
 * without the weights fails loudly rather than quietly fetching them from a
 * server, which would break both the offline promise and the privacy one.
 */
import { env, pipeline } from "./transformers.min.js"

env.allowRemoteModels = false
env.allowLocalModels = true
env.localModelPath = chrome.runtime.getURL("assets/")
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL("assets/offscreen/")
// One thread. Cross-origin isolation is not available here, and asking for
// more silently falls back anyway.
env.backends.onnx.wasm.numThreads = 1

let loading = null

function embedder() {
  loading ??= pipeline("feature-extraction", "model", { dtype: "q8" })
  return loading
}

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message?.type !== "ditto:embed" || message?.forwarded !== true) return false

  ;(async () => {
    try {
      const embed = await embedder()
      const vectors = []

      for (const text of message.texts) {
        const out = await embed(text, { pooling: "mean", normalize: true })
        vectors.push(Array.from(out.data))
      }

      respond({ ok: true, vectors })
    } catch (error) {
      // Reported rather than swallowed. A tier that has silently stopped
      // working looks identical to one that matched nothing.
      respond({ ok: false, reason: String(error) })
    }
  })()

  // Keeps the message channel open for the async reply above.
  return true
})

// Warm the model as soon as the document exists, so the first autofill does
// not pay for the load.
embedder().catch(() => {})
