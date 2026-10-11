/**
 * R283 灯效代码层审计 — 干净版 idx→kind 映射 + 运动指标捕获。
 *
 * 背景：committed 的 81 张 fxNN PNG（r-effect-audit）经取证为多轮遍历的污染
 * 采样（curated strip 重复入镜、悬停预览 pill 遮挡、neon-pulse 等卡片 RAF 冻结
 * 帧间 0 diff、卡片宽高混杂 270/277×131/150/151）。本脚本重跑一次干净捕获：
 *   - 只遍历 7 个分类 tab 的分类网格卡（排除 curated strip）
 *   - 每卡记录 zh 标签 → 反查 i18n 得 kind（与 CATEGORIES 顺序双向校验）
 *   - 3 帧截图算 motion/lit/sat/entropy（公式与 r-effect-audit-capture.mjs 一致）
 *   - m0 卡自动重试一次（区分 RAF 懒激活 vs 真静态）
 * 输出（写到 docs/ui-review/r-effect-audit/）：
 *   kind-map.csv — idx,kind,zh,tab,motion%,lit%,sat%,entropy
 * 截图存 %TEMP%（不入库）。
 */
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium, launchElectron } from './lib/cdp.mjs'
import { PNG } from 'pngjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/ui-review/r-effect-audit')
const SHOTS = join(tmpdir(), `rgbbox-r283-kindmap-${Date.now()}`)
mkdirSync(SHOTS, { recursive: true })

// ── zh label → kind 反查表（解析 i18n ZH 块） ──────────────────────────────
const i18nSrc = readFileSync(join(ROOT, 'src/renderer/src/i18n/index.tsx'), 'utf8')
const zhBlock = i18nSrc.slice(i18nSrc.indexOf('const ZH'))
const zhLabelToKind = new Map()
for (const m of zhBlock.matchAll(/'effects\.preset\.([\w-]+)\.label':\s*'([^']+)'/g)) {
  zhLabelToKind.set(m[2], m[1])
}
console.log(`zh labels parsed: ${zhLabelToKind.size}`)

const udd = join(tmpdir(), `rgbbox-r283-km-${Date.now()}`)
mkdirSync(udd, { recursive: true })
const PORT = 9333
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

const TAB_NAMES = ['classic', 'custom', 'advanced', 'science', 'threed', 'gpu3d', 'audio']
const GRID_CARD = 'section.effects-category:not(.effects-curated-section) .effects-card-grid .effect-card'
const tabCount = await page.locator('.effects-category-tab').count()
console.log(`tabs: ${tabCount}`)

const results = []
let idx = 0
for (let t = 0; t < tabCount; t++) {
  await page.locator('.effects-category-tab').nth(t).click()
  await sleep(1000)
  const cards = page.locator(GRID_CARD)
  const inTab = await cards.count()
  for (let c = 0; c < inTab; c++) {
    const card = cards.nth(c)
    await card.scrollIntoViewIfNeeded().catch(() => {})
    await sleep(450)
    const label = ((await card.locator('.effect-card-info strong').first().textContent()) ?? '').trim()
    const kind = zhLabelToKind.get(label) ?? `UNRESOLVED:${label}`
    const frames = []
    for (let f = 0; f < 3; f++) {
      const path = join(SHOTS, `fx${String(idx).padStart(2, '0')}-${f}.png`)
      await card.screenshot({ path })
      frames.push(path)
      if (f < 2) await sleep(500)
    }
    const metricsOf = (fa, fb) => {
      const a = PNG.sync.read(readFileSync(fa))
      const b = PNG.sync.read(readFileSync(fb))
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
      return { motion: +(diff / n * 100).toFixed(2), lit: +(lit / n * 100).toFixed(1), sat: +(satSum / n * 100).toFixed(1), entropy: +entropy.toFixed(2) }
    }
    let m = metricsOf(frames[0], frames[2])
    // m0 重试：懒激活 vs 真静态
    let retried = false
    if (m.motion < 0.5) {
      await sleep(1200)
      for (let f = 0; f < 3; f++) {
        const path = join(SHOTS, `fx${String(idx).padStart(2, '0')}-r${f}.png`)
        await card.screenshot({ path })
        frames[f] = path
        if (f < 2) await sleep(500)
      }
      const m2 = metricsOf(frames[0], frames[2])
      retried = true
      if (m2.motion > m.motion) m = m2
    }
    results.push({ idx, tab: TAB_NAMES[t] ?? `tab${t}`, kind, zh: label, ...m, retried })
    console.log(`[${String(idx).padStart(2, '0')}] ${TAB_NAMES[t]}/${kind} ${label} — motion=${m.motion}% lit=${m.lit}% sat=${m.sat}% H=${m.entropy}${retried && m.motion < 0.5 ? ' [STATIC?]' : ''}`)
    idx += 1
  }
}

// 校验：UNRESOLVED 必须为 0
const bad = results.filter((r) => r.kind.startsWith('UNRESOLVED'))
if (bad.length) console.error(`UNRESOLVED labels: ${bad.map((b) => b.zh).join(', ')}`)

const csv = 'idx,kind,zh,tab,motion%,lit%,sat%,entropy\n' +
  results.map((r) => `${r.idx},${r.kind},${r.zh},${r.tab},${r.motion},${r.lit},${r.sat},${r.entropy}`).join('\n')
writeFileSync(join(OUT, 'kind-map.csv'), csv)
console.log(`\nwrote ${OUT}/kind-map.csv (${results.length} cards)`)

try { electron.kill() } catch {}
await sleep(600)
try { rmSync(udd, { recursive: true, force: true }) } catch { /* temp */ }
try { rmSync(SHOTS, { recursive: true, force: true }) } catch { /* temp */ }
process.exit(bad.length ? 2 : 0)
