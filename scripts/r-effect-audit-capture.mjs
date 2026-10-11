/**
 * 灯效美学评审 Phase A v3 — 分类 tab 遍历 + 卡片 GL 预览直拍。
 */
import { mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium, launchElectron } from './lib/cdp.mjs'
import { PNG } from 'pngjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/ui-review/r-effect-audit')
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
const udd = join(tmpdir(), `rgbbox-fxaudit-${Date.now()}`)
mkdirSync(udd, { recursive: true })
const PORT = 9332
const electron = launchElectron({ port: PORT, userDataDir: udd, entry: join(ROOT, 'out/main/index.js') })
process.on('exit', () => { try { electron.kill() } catch {} })

let page = null
for (let i = 0; i < 40 && !page; i++) {
  try {
    const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`)
    page = browser.contexts()[0].pages().find((p) => p.url().includes('index.html'))
    if (!page) { await sleep(500); page = null }
  } catch { await sleep(500) }
}
if (!page) { console.error('app never came up'); process.exit(1) }
await page.waitForSelector('.module-rail', { timeout: 15000 })

await page.locator('.module-rail .rail-item').nth(2).click()
await page.waitForSelector('.effect-card', { timeout: 15000 })
await sleep(1500)

const tabSel = '.effects-category-tab'
const tabCount = await page.locator(tabSel).count()
console.log(`category tabs: ${tabCount}`)

const results = []
let idx = 0
for (let t = 0; t < tabCount; t++) {
  await page.locator(tabSel).nth(t).click()
  await sleep(900)
  const cards = page.locator('.effect-card')
  const inTab = await cards.count()
  for (let c = 0; c < inTab; c++) {
    const card = cards.nth(c)
    await card.scrollIntoViewIfNeeded().catch(() => {})
    await sleep(350)
    const name = ((await card.textContent()) ?? `card-${t}-${c}`).trim().replace(/\s+/g, ' ').slice(0, 46)
    const frames = []
    for (let f = 0; f < 3; f++) {
      const path = join(OUT, `fx${String(idx).padStart(2, '0')}-${f}.png`)
      await card.screenshot({ path })
      frames.push(path)
      if (f < 2) await sleep(420)
    }
    const a = PNG.sync.read(readFileSync(frames[0]))
    const b = PNG.sync.read(readFileSync(frames[2]))
    let diff = 0, lit = 0, satSum = 0, n = 0
    const hist = new Array(48).fill(0)
    for (let y = 0; y < a.height; y++) {
      for (let x = 0; x < a.width; x++) {
        const ia = (y * a.width + x) * 4, ib = (y * b.width + x) * 4
        const ra = a.data[ia], ga = a.data[ia + 1], ba = a.data[ia + 2]
        const rb = b.data[ib], gb = b.data[ib + 1], bb = b.data[ib + 2]
        if (Math.abs(ra - rb) > 24 || Math.abs(ga - gb) > 24 || Math.abs(ba - bb) > 24) diff++
        const lum = 0.299 * ra + 0.587 * ga + 0.114 * ba
        if (lum > 60) lit++
        const mx = Math.max(ra, ga, ba), mn = Math.min(ra, ga, ba)
        satSum += mx === 0 ? 0 : (mx - mn) / mx
        hist[(ra >> 4) | 0]++; hist[16 + (ga >> 4)]++; hist[32 + (ba >> 4)]++
        n++
      }
    }
    let entropy = 0
    for (const cc of hist) { if (cc > 0) { const p = cc / (n * 3); entropy -= p * Math.log2(p) } }
    const r = { idx, tab: t, name, motion: +(diff / n * 100).toFixed(2), lit: +(lit / n * 100).toFixed(1), saturation: +(satSum / n * 100).toFixed(1), entropy: +entropy.toFixed(2) }
    results.push(r)
    console.log(`[${idx + 1}] tab${t} ${name} — motion=${r.motion}% lit=${r.lit}% sat=${r.saturation}% H=${r.entropy}`)
    idx += 1
  }
}

const csv = 'idx,tab,name,motion%,lit%,sat%,entropy\n' + results.map((r) => `${r.idx},${r.tab},"${r.name}",${r.motion},${r.lit},${r.saturation},${r.entropy}`).join('\n')
writeFileSync(join(OUT, 'metrics.csv'), csv)
for (const f of readdirSync(OUT)) if (/-[02]\.png$/.test(f)) rmSync(join(OUT, f))
console.log(`\n${idx} effects captured`)
try { electron.kill() } catch {}
await sleep(600)
try { rmSync(udd, { recursive: true, force: true }) } catch { /* temp */ }
process.exit(0)
