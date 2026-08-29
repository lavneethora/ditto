/**
 * Test environment shims.
 *
 * jsdom does not implement `Blob.prototype.arrayBuffer`, which every browser
 * Ditto actually runs in has had for years. Polyfilling it here keeps the
 * production code on the modern API instead of carrying a FileReader fallback
 * that exists only to satisfy the test runner.
 */

if (typeof Blob !== "undefined" && typeof Blob.prototype.arrayBuffer !== "function") {
  Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => reject(reader.error)
      reader.readAsArrayBuffer(this)
    })
  }
}
