/**
 * R321: runtime proof that the UI renders with the BUNDLED fonts, not whatever
 * the host OS has. Uses CDP `CSS.getPlatformFontsForNode`, which reports the
 * font Chromium actually shaped each node's text with — `isCustomFont` is true
 * for @font-face web fonts and false for system fonts.
 */

/**
 * @param {import('playwright-core').Page} page
 * @param {{ label: string, selector: string }[]} targets
 * @returns {Promise<{ label: string, selector: string, text?: string, missing?: boolean, fonts: { familyName: string, isCustomFont: boolean, glyphCount: number }[] }[]>}
 */
export async function probeFonts (page, targets) {
  const cdp = await page.context().newCDPSession(page)
  try {
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 })
    const out = []
    for (const { label, selector } of targets) {
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector })
      if (!nodeId) { out.push({ label, selector, missing: true, fonts: [] }); continue }
      const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId })
      const text = await page.evaluate((s) => (document.querySelector(s)?.textContent ?? '').trim().slice(0, 16), selector)
      out.push({ label, selector, text, fonts })
    }
    return out
  } finally {
    await cdp.detach().catch(() => {})
  }
}

/** A node passes when it rendered some glyphs and every one of them came from a bundled web font. */
export const usesOnlyBundledFonts = (r) => !r.missing && r.fonts.length > 0 && r.fonts.every((f) => f.isCustomFont)

export const describeFonts = (r) => r.missing
  ? '(selector not found)'
  : r.fonts.map((f) => `${f.familyName}${f.isCustomFont ? '' : ' [SYSTEM]'} x${f.glyphCount}`).join(' | ') || '(no glyphs)'
