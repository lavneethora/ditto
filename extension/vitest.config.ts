import { resolve } from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    // Plasmo maps `~*` to `./src/*`, so `~profile/resume` is `src/profile/resume`.
    // The trailing separator is what makes that a path join rather than a
    // string concatenation into `srcprofile/`.
    alias: [{ find: /^~(?!\/)/, replacement: resolve(__dirname, "src") + "/" }]
  },
  test: {
    // The engine is DOM code end to end, so every test needs a document.
    // This is Tier 1 from PRD section 8: it proves recognition and mapping,
    // never that a real Workday listbox opened.
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    restoreMocks: true
  }
})
