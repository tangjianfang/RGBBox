/**
 * R219 verify: 表现层修复轮真机取证——
 *  ①窗口态 ready:画布下方面板(菜单不再压画布)/无重复开始按钮/画布完整无裁切;
 *  ②窗口态 running(移动中):飞船恒在画布中央 60%(世界层归位的程序化断言,
 *    经 __rgbboxVision.probe().shipVp——修复前 shipVp=裸世界坐标,移动后必然出界);
 *  ③fs 态:无 320px 死列/无底部裁切/等比无拉伸(盒比例==backing 比例);
 *  ④矮窗(1200×700)contain-fit:画布底部不出视口;
 *  ⑤帧率抽样。
 */
import { assertFreshOut, launchElectron, connectRenderer } from './lib/cdp.mjs'
import { mkdirSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9295
const OUT = 'docs/ui-review/r219'
assertFreshOut()
mkdirSync(OUT, { recursive: true })
launchElectron({ port: PORT })
const { page } = await connectRenderer({ port: PORT })
await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {})
await page.evaluate(() => {
  const doomed = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && (k.startsWith('rgbbox:') || k.startsWith('rgbbox-'))) doomed.push(k)
  }
  for (const k of doomed) localStorage.removeItem(k)
}).catch(() => {})
await page.reload()
await page.waitForSelector('.module-rail', { timeout: 15000 })
await sleep(700)

const report = {}
const canvasGeom = () => page.evaluate(() => {
  const c = document.querySelector('canvas.games-canvas')
  if (!c) return null
  const r = c.getBoundingClientRect()
  return {
    css: { w: Math.round(r.width), h: Math.round(r.height), left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom) },
    backing: { w: c.width, h: c.height },
    viewport: { w: window.innerWidth, h: window.innerHeight },
  }
})

// ── 进 Swarm ──
await page.locator('.module-rail .rail-item').nth(5).click()
await sleep(900)
await page.evaluate(() => {
  const card = [...document.querySelectorAll('button, .game-card')]
    .find((b) => /蜂群|Swarm/i.test(b.textContent || ''))
  if (card) card.click()
})
await sleep(1100)

// ── ① 窗口态 ready ──
await page.screenshot({ path: `${OUT}/sv-ready-window.png` })
report.ready = await page.evaluate(() => {
  const canvas = document.querySelector('canvas.games-canvas')
  const panel = document.querySelector('[data-field="ready-panel"]')
  const cr = canvas?.getBoundingClientRect()
  const pr = panel?.getBoundingClientRect()
  const startish = [...document.querySelectorAll('button')]
    .filter((b) => /games\.start|开始|Start/.test((b.textContent || '').trim()))
  return {
    canvasBelowChrome: cr ? { top: Math.round(cr.top), bottom: Math.round(cr.bottom), innerH: window.innerHeight } : null,
    panelBelowCanvas: cr && pr ? Math.round(pr.top - cr.bottom) : null, // 期望 ≈ 列 gap(≤20):面板紧跟画布下方
    startButtonCount: startish.length, // 期望 1(唯一主 CTA)
    panelOverlapsCanvas: cr && pr ? pr.top < cr.bottom - 2 : null,
  }
})

// ── ② 开局(data-action 确定性选择器)+ 持续左移 → 飞船居中断言 ──
await page.click('[data-action="ready-start"]')
await sleep(600)
const before = await page.evaluate(() => (window).__rgbboxVision.probe())
await page.keyboard.down('a')
await sleep(1600)
await page.keyboard.up('a')
await sleep(400)
const after = await page.evaluate(() => (window).__rgbboxVision.probe())
report.shipCentered = {
  movedWorld: Math.round(Math.abs(after.player.x - before.player.x)),
  shipVp: { x: Math.round(after.shipVp.x), y: Math.round(after.shipVp.y) },
  center: { x: 450, y: 260 },
  withinCentral60: after.shipVp.x > 450 * 0.7 && after.shipVp.x < 450 * 1.3 && after.shipVp.y > 260 * 0.7 && after.shipVp.y < 260 * 1.3,
  phase: after.phase,
}
// 像素级取证:shipVp 邻域 48×48 采样,数船体/尾焰亮青白像素(hull #e2f8ff /
// accent #67e8f9;深空背景星点稀疏 ≤ 个位数,阈值 ≥25 判在)——直接证明
// 「飞船真的画在了屏幕中央」,不依赖目检。
report.shipPixels = await page.evaluate(() => {
  const c = document.querySelector('canvas.games-canvas')
  const s = (window).__rgbboxVision.probe()
  const ctx = c.getContext('2d')
  const sx = Math.max(0, Math.min(c.width - 1, Math.round((s.shipVp.x / 900) * c.width)))
  const sy = Math.max(0, Math.min(c.height - 1, Math.round((s.shipVp.y / 520) * c.height)))
  const r = 24
  const x0 = Math.max(0, sx - r); const y0 = Math.max(0, sy - r)
  const w = Math.min(r * 2, c.width - x0); const h = Math.min(r * 2, c.height - y0)
  const img = ctx.getImageData(x0, y0, w, h)
  let bright = 0
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i] > 90 && img.data[i + 1] > 200 && img.data[i + 2] > 220) bright += 1
  }
  return { bright, sampled: Math.round((img.data.length / 4)) }
})
await page.screenshot({ path: `${OUT}/sv-running-window.png` })
report.runningWindow = await canvasGeom()

// ── ④ 矮窗 contain-fit(1200×700)──
await page.setViewportSize({ width: 1200, height: 700 }).catch(() => {})
await sleep(700)
await page.screenshot({ path: `${OUT}/sv-running-shortwindow.png` })
report.shortWindow = await canvasGeom()

// ── ③ fs 态(运行中 Esc 暂停浮层 → 全屏按钮;ready 态 Esc 不出浮层)──
await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {})
await sleep(600)
await page.keyboard.press('Escape')
await sleep(400)
const overlaySeen = await page.evaluate(() => document.querySelector('[data-field="fs-pause"]') !== null)
await page.click('[data-action="fs-enter"]').catch(async () => {
  // 兜底:浮层未出则直接用工具栏按钮
  await page.evaluate(() => document.querySelector('button[title]')?.click()).catch(() => {})
})
await sleep(1200)
report.fs = {
  pauseOverlaySeen: overlaySeen,
  fullscreenElement: await page.evaluate(() => document.fullscreenElement !== null),
}
await page.screenshot({ path: `${OUT}/sv-fs.png` })
report.fsGeom = await canvasGeom()
// 退出全屏 + 返回 hub
await page.keyboard.press('Escape').catch(() => {})
await sleep(400)
await page.keyboard.press('Escape').catch(() => {})
await sleep(400)
await page.evaluate(() => {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
})

// ── ⑤ 帧率抽样(回到运行态)──
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')]
  const resume = btns.find((b) => /games\.pause\.resume|继续|Resume/.test(b.textContent || ''))
  if (resume) resume.click()
}).catch(() => {})
await sleep(600)
report.fps = await page.evaluate(() => new Promise((resolve) => {
  let frames = 0
  const t0 = performance.now()
  const tick = () => { frames++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else resolve(Math.round((frames * 1000) / (performance.now() - t0))) }
  requestAnimationFrame(tick)
}))

console.log(JSON.stringify(report, null, 2))
process.exit(0)
