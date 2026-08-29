/**
 * Plasmo's asset import schemes.
 *
 * `data-base64:` inlines a file as a data URL at build time. That matters for
 * the content script: an extension URL is not reliably fetchable from inside a
 * host page, but a data URL always renders.
 */
declare module "data-base64:*" {
  const value: string
  export default value
}

declare module "data-text:*" {
  const value: string
  export default value
}
