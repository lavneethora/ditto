// Must come first. ES modules evaluate in import order, so this installs the
// chrome.storage shim before anything downstream reaches for the namespace.
import "./chrome-shim"

import { createRoot } from "react-dom/client"

import fixtureHtml from "../../fixtures/greenhouse-react.html?raw"
import { greenhouse } from "~adapters/greenhouse"
import OptionsPage from "~options"
import { Drawer } from "~ui/drawer/Drawer"

import "~ui/styles.css"

/**
 * Dev harness.
 *
 * Two modes, chosen by query string:
 *
 *   /            the options page, for profile editing
 *   /?form       a captured Greenhouse application form with the real drawer
 *                mounted over it
 *
 * The second mode is the closest thing to an end-to-end test that does not
 * require loading an unpacked extension: real captured markup, the real
 * engine, and the real panel. It is still Tier 1 from PRD section 8, since a
 * saved page cannot prove that a live react-select committed a value.
 */

const root = document.getElementById("root")

if (!root) {
  throw new Error("harness root element missing")
}

if (new URLSearchParams(location.search).has("form")) {
  const page = document.createElement("div")
  page.style.cssText = "max-width:760px;margin:0 auto;padding:40px 24px 200px"

  // Static local fixture read at build time, not user input.
  page.insertAdjacentHTML("afterbegin", fixtureHtml)
  document.body.append(page)

  createRoot(root).render(
    <div className="ditto-root">
      <Drawer adapter={greenhouse} doc={document} />
    </div>
  )
} else {
  createRoot(root).render(<OptionsPage />)
}
