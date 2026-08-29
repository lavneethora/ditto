// Must come first. ES modules evaluate in import order, so this installs the
// chrome.storage shim before anything downstream reaches for the namespace.
import "./chrome-shim"

import { createRoot } from "react-dom/client"

import OptionsPage from "~options"

const root = document.getElementById("root")

if (!root) {
  throw new Error("harness root element missing")
}

createRoot(root).render(<OptionsPage />)
