/**
 * R321 verification: the UI must render with the bundled fonts in BOTH
 * languages — no sampled node may fall back to a system font. Also checks
 * <html lang> follows the UI language.
 *
 *   node scripts/verify-r321-fonts.mjs        (needs a fresh `yarn build`)
 *
 * exit 0 = all bundled, 1 = a node used a system font / lang mismatch.
 * Runs in an isolated userData dir (no pollution of the real profile).
 */
import { assertFreshOut, launchElectron, connectRenderer } from './lib/cdp.mjs'
import { probeFonts, usesOnlyBundledFonts, describeFonts } from './lib/fontProbe.mjs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9286
assertFreshOut()
launchElectron({ port: PORT, userDataDir: join(tmpdir(), `rgbbox-r321-${Date.now()}`) })
const { page } = await connectRenderer({ port: PORT })
await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {})

// rail index: 0 dashboard, 1 workspace, … 4 audio (has the mono `.audio-value` readouts)
const SAMPLES = [
  { view: 0, label: 'rail label', selector: '.module-rail .rail-item:nth-child(2)' },
  { view: 0, label: 'rail label #1', selector: '.module-rail .rail-item:nth-child(1)' },
  { view: 4, label: 'audio mono readout', selector: '.audio-value' },
]

let failed = 0
for (const [lang, expectLang] of [['zh', 'zh-CN'], ['en', 'en']]) {
  await page.evaluate((l) => localStorage.setItem('rgbbox:lang', l), lang)
  await page.reload()
  await page.waitForSelector('.module-rail', { timeout: 15000 })
  await page.evaluate(() => document.fonts.ready)
  await sleep(600)

  const htmlLang = await page.evaluate(() => document.documentElement.lang)
  const langOk = htmlLang === expectLang
  if (!langOk) failed++
  console.log(`\n=== ui lang=${lang} ===`)
  console.log(`  ${langOk ? '[pass]' : '[FAIL]'} <html lang="${htmlLang}"> (expected "${expectLang}")`)

  let currentView = -1
  for (const s of SAMPLES) {
    if (s.view !== currentView) {
      await page.locator('.module-rail .rail-item').nth(s.view).click()
      await sleep(900)
      await page.evaluate(() => document.fonts.ready)
      currentView = s.view
    }
    const [r] = await probeFonts(page, [s])
    const ok = usesOnlyBundledFonts(r)
    if (!ok) failed++
    console.log(`  ${ok ? '[pass]' : '[FAIL]'} ${s.label.padEnd(20)} "${r.text ?? ''}" -> ${describeFonts(r)}`)
  }
}

console.log(failed ? `\nR321 fonts: ${failed} FAIL` : '\nR321 fonts: ALL PASS — sampled text renders with bundled fonts only')
process.exit(failed ? 1 : 0)
