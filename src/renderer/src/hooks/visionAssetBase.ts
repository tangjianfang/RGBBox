/**
 * Absolute URL base for the vision assets (ends with '/').
 * - dev / http(s): document-relative → vite serves src/renderer/public at '/'
 * - packaged file://: media://app/ maps to out/renderer (see main mediaProtocol)
 */
export function visionAssetBase(protocol: string = window.location.protocol): string {
  return protocol === 'file:' ? 'media://app/' : document.baseURI
}
