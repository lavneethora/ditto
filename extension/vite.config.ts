import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { defineConfig, type Plugin } from "vite"

/**
 * Teaches the harness Plasmo's `data-base64:` import scheme, which inlines a
 * file as a data URL. The extension uses it for the logo, since a content
 * script cannot rely on a host page letting it fetch an extension URL.
 *
 * Without this the harness cannot load any module that imports an asset, so
 * it would stop being able to render the real UI.
 */
function plasmoDataBase64(): Plugin {
  const PREFIX = "data-base64:"
  const VIRTUAL = "\0" + PREFIX

  const MIME: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".webp": "image/webp"
  }

  return {
    name: "plasmo-data-base64",

    resolveId(id, importer) {
      if (!id.startsWith(PREFIX)) return null

      const target = id.slice(PREFIX.length)
      const absolute = target.startsWith("~")
        ? resolve(__dirname, "src", target.slice(1))
        : resolve(importer ? dirname(importer) : __dirname, target)

      return VIRTUAL + absolute
    },

    load(id) {
      if (!id.startsWith(VIRTUAL)) return null

      const file = id.slice(VIRTUAL.length)
      const extension = file.slice(file.lastIndexOf("."))
      const mime = MIME[extension] ?? "application/octet-stream"
      const base64 = readFileSync(file).toString("base64")

      return `export default "data:${mime};base64,${base64}"`
    }
  }
}

/**
 * Dev harness only. Serves the extension UI as a plain page so it can be
 * looked at and clicked through without loading an unpacked extension.
 *
 * Named vite.config.ts rather than passed with --config, because a bare
 * `vite` is the only invocation every launcher agrees on. Vitest reads
 * vitest.config.ts in preference to this one, so the two do not collide.
 *
 * Plasmo builds the real extension. This exists purely to give UI work a fast
 * feedback loop, and nothing here ships.
 */
export default defineConfig({
  root: resolve(__dirname, "dev"),
  plugins: [plasmoDataBase64()],
  resolve: {
    alias: [{ find: /^~(?!\/)/, replacement: resolve(__dirname, "src") + "/" }],
    // The harness reaches the app through a dynamic import, which lets Vite
    // hand out two separate React instances. Hooks then fail with "Invalid
    // hook call", because the copy holding the dispatcher is not the copy the
    // components imported.
    dedupe: ["react", "react-dom"]
  },
  esbuild: {
    jsx: "automatic"
  }
})
