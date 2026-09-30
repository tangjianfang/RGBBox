/**
 * R219 verify v2: 表现层修复轮真机取证——
 *  R219 基线:①窗口态 ready 面板在画布下方/唯一 CTA/无裁切;②移动中飞船居中
 *   (probe.shipVp + 邻域像素采样);③矮窗 contain-fit;④fps。
 *  R219.7 增补:⑤fs 真铺满——**4:3 视口(1440×1040)** 下 survival fs 画布与
 *   视口全等(0 黑边),backing/CSS 同比(无拉伸);⑥fs 运行态画布 HUD
 *   「开始/重开」按钮条隐藏(像素检测),ready 态可见;⑦动态背景停用——
 *   移动中相隔 500ms 双帧背景区域逐字节一致(静止);⑧TD fs 维持 contain 细边。
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
/** 画布指定逻辑区域采样亮青白像素数(fs HUD 按钮文字 #e2f8ff / 船体 hull)。 */
const brightPixelsIn = (x, y, w, h) => page.evaluate(({ x, y, w, h }) => {
  const c = document.querySelector('canvas.games-canvas')
  const s = (window).__rgbboxVision.probe()
  const ctx = c.getContext('2d')
  const sx = Math.round((x / s.vp.w) * c.width)
  const sy = Math.round((y / s.vp.h) * c.height)
  const sw = Math.max(2, Math.round((w / s.vp.w) * c.width))
  const sh = Math.max(2, Math.round((h / s.vp.h) * c.height))
  const img = ctx.getImageData(Math.max(0, sx), Math.max(0, sy), Math.min(sw, c.width - Math.max(0, sx)), Math.min(sh, c.height - Math.max(0, sy)))
  let bright = 0
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i] > 200 && img.data[i + 1] > 230 && img.data[i + 2] > 240) bright += 1
  }
  return bright
}, { x, y, w, h })
/** 画布逻辑区域位图哈希(双帧对比→背景是否静止)。 */
const regionSig = (x, y, w, h) => page.evaluate(({ x, y, w, h }) => {
  const c = document.querySelector('canvas.games-canvas')
  const s = (window).__rgbboxVision.probe()
  const ctx = c.getContext('2d')
  const sx = Math.round((x / s.vp.w) * c.width)
  const sy = Math.round((y / s.vp.h) * c.height)
  const sw = Math.max(2, Math.round((w / s.vp.w) * c.width))
  const sh = Math.max(2, Math.round((h / s.vp.h) * c.height))
  const img = ctx.getImageData(Math.max(0, sx), Math.max(0, sy), Math.min(sw, c.width - Math.max(0, sx)), Math.min(sh, c.height - Math.max(0, sy)))
  let h1 = 5381
  for (let i = 0; i < img.data.length; i += 4) { h1 = ((h1 * 33) ^ img.data[i] ^ (img.data[i + 1] << 3) ^ (img.data[i + 2] << 6)) >>> 0 }
  return h1.toString(16)
}, { x, y, w, h })

// ── 进 Swarm + ready 窗口态取证 ──
await page.locator('.module-rail .rail-item').nth(5).click()
await sleep(900)
await page.evaluate(() => {
  const card = [...document.querySelectorAll('button, .game-card')]
    .find((b) => /蜂群|Swarm/i.test(b.textContent || ''))
  if (card) card.click()
})
await sleep(1100)
await page.screenshot({ path: `${OUT}/sv-ready-window.png` })
report.ready = await page.evaluate(() => {
  const canvas = document.querySelector('canvas.games-canvas')
  const panel = document.querySelector('[data-field="ready-panel"]')
  const cr = canvas?.getBoundingClientRect()
  const pr = panel?.getBoundingClientRect()
  const startish = [...document.querySelectorAll('button')]
    .filter((b) => /games\.start|开始|Start/.test((b.textContent || '').trim()))
  return {
    canvasInViewport: cr ? cr.bottom <= window.innerHeight + 1 && cr.top >= 0 : null,
    panelBelowCanvas: cr && pr ? Math.round(pr.top - cr.bottom) : null,
    startButtonCount: startish.length,
  }
})

// ── 开局 + 持续左移 → 飞船居中(窗口态)──
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
  vp: { w: Math.round(after.vp.w), h: Math.round(after.vp.h) },
  // R219.9: 1P 固定视口——移动中相机钉死 vp 中心(画面零滚动)+飞船在画内
  cameraFixed: Math.abs(after.camera.x - after.vp.w / 2) < 1 && Math.abs(after.camera.y - after.vp.h / 2) < 1 && after.camera.zoom === 1,
  shipOnScreen: after.shipVp.x > 0 && after.shipVp.x < after.vp.w && after.shipVp.y > 0 && after.shipVp.y < after.vp.h,
  phase: after.phase,
}
report.shipPixels = await brightPixelsIn(after.shipVp.x - 24, after.shipVp.y - 24, 48, 48)
await page.screenshot({ path: `${OUT}/sv-running-window.png` })
report.runningWindow = await canvasGeom()

// ── ⑦ 动态背景停用:移动中双帧背景区域一致(静止)──
await page.keyboard.down('a')
await sleep(300)
const sig1 = await regionSig(360, 90, 120, 50)
await sleep(500)
const sig2 = await regionSig(360, 90, 120, 50)
await page.keyboard.up('a')
report.bgStaticWhileMoving = { sig1, sig2, identical: sig1 === sig2 }

// ── ⑤ fs 真铺满(4:3 视口 1440×1040)──
await page.setViewportSize({ width: 1440, height: 1040 }).catch(() => {})
await sleep(700)
await page.keyboard.press('Escape')
await sleep(400)
await page.click('[data-action="fs-enter"]')
await sleep(1400)
report.fs4x3 = {
  fullscreenElement: await page.evaluate(() => document.fullscreenElement !== null),
  geom: await canvasGeom(),
}
await page.keyboard.down('a')
await sleep(400)
await page.keyboard.up('a')
await page.screenshot({ path: `${OUT}/sv-fs-4x3.png` })
// ⑥ fs 运行态:底部按钮条区域( vp 中心±180, vp.h-62..-12 )不应有按钮文字亮像素
//   (对抗审查修正:坐标走 probe().vp,不硬编码视口——否则采样错空间空过)
{
  const p = await page.evaluate(() => (window).__rgbboxVision.probe())
  report.fsRunningBar = {
    vp: { w: Math.round(p.vp.w), h: Math.round(p.vp.h) },
    brightTextPixels: await brightPixelsIn(p.vp.w / 2 - 180, p.vp.h - 62, 360, 50),
  }
}
// ⑦ fs 态双帧背景静止
await page.keyboard.down('a')
await sleep(300)
const fsSig1 = await regionSig(360, 90, 120, 50)
await sleep(500)
const fsSig2 = await regionSig(360, 90, 120, 50)
await page.keyboard.up('a')
report.bgStaticInFs = { sig1: fsSig1, sig2: fsSig2, identical: fsSig1 === fsSig2 }

// 退出 fs,重开回 ready(跨 hub 往返引擎状态残留 running——先重开再进 fs)
await page.keyboard.press('Escape').catch(() => {})
await sleep(500)
await page.evaluate(() => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}) })
await sleep(600)
await page.evaluate(() => {
  const back = [...document.querySelectorAll('button')].find((b) => /返回|Back|games\.backToHub/.test(b.textContent || ''))
  if (back) back.click()
})
await sleep(600)
await page.evaluate(() => {
  const card = [...document.querySelectorAll('button, .game-card')]
    .find((b) => /蜂群|Swarm/i.test(b.textContent || ''))
  if (card) card.click()
})
await sleep(1000)
// running 态:Esc 暂停 → 浮层「重开」→ 回 ready → 关暂停
await page.keyboard.press('Escape')
await sleep(400)
await page.click('[data-action="fs-restart"]').catch(() => {})
await sleep(500)
await page.click('[data-action="fs-resume"]').catch(() => {})
await sleep(500)
// ready 态 header 可见 → 工具栏「全屏」进入
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => /全屏|Fullscreen|games\.fullscreen/.test((b.getAttribute('title') || '') + (b.textContent || '')))
  if (btn) btn.click()
})
await sleep(1400)
report.fsReady = {
  fullscreenElement: await page.evaluate(() => document.fullscreenElement !== null),
  barPixels: await page.evaluate(() => {
    const c = document.querySelector('canvas.games-canvas')
    if (!c) return -1
    const s = (window).__rgbboxVision.probe()
    const ctx = c.getContext('2d')
    const y0 = Math.round(((s.vp.h - 62) / s.vp.h) * c.height)
    const img = ctx.getImageData(0, y0, c.width, Math.round((50 / s.vp.h) * c.height))
    let bright = 0
    for (let i = 0; i < img.data.length; i += 4) {
      if (img.data[i] > 200 && img.data[i + 1] > 230 && img.data[i + 2] > 240) bright += 1
    }
    return bright
  }),
  geom: await canvasGeom(),
}
await page.screenshot({ path: `${OUT}/sv-fs-ready.png` })
await page.evaluate(() => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}) })
await sleep(500)

// ── ⑧ TD fs:维持 contain 细边(居中 letterbox,比例锁)──
await page.evaluate(() => {
  const back = [...document.querySelectorAll('button')].find((b) => /返回|Back|games\.backToHub/.test(b.textContent || ''))
  if (back) back.click()
})
await sleep(600)
await page.evaluate(() => {
  const card = [...document.querySelectorAll('button, .game-card')]
    .find((b) => /塔防|TD/i.test(b.textContent || ''))
  if (card) card.click()
})
await sleep(1000)
await page.click('[data-action="ready-start"]').catch(() => {})
await sleep(800)
await page.keyboard.press('Escape')
await sleep(400)
await page.click('[data-action="fs-enter"]').catch(() => {})
await sleep(1200)
report.tdFs = { geom: await canvasGeom() }
await page.screenshot({ path: `${OUT}/td-fs-4x3.png` })
await page.evaluate(() => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}) })
await sleep(500)

// ── ⑩ size-large 档位回归(对抗审查确认项):fs+画面占比=大 仍全铺满 ──
await page.evaluate(() => {
  const back = [...document.querySelectorAll('button')].find((b) => /返回|Back|games\.backToHub/.test(b.textContent || ''))
  if (back) back.click()
})
await sleep(500)
await page.evaluate(() => { localStorage.setItem('rgbbox:gamesFocusMode', 'large') })
await page.reload()
await page.waitForSelector('.module-rail', { timeout: 15000 })
await sleep(800)
await page.locator('.module-rail .rail-item').nth(5).click()
await sleep(800)
await page.evaluate(() => {
  const card = [...document.querySelectorAll('button, .game-card')]
    .find((b) => /蜂群|Swarm/i.test(b.textContent || ''))
  if (card) card.click()
})
await sleep(900)
await page.click('[data-action="ready-start"]')
await sleep(600)
await page.keyboard.press('Escape')
await sleep(400)
await page.click('[data-action="fs-enter"]').catch(() => {})
await sleep(1400)
report.fsSizeLarge = await canvasGeom()
await page.screenshot({ path: `${OUT}/sv-fs-size-large.png` })
await page.evaluate(() => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}) })
await page.evaluate(() => { localStorage.setItem('rgbbox:gamesFocusMode', 'standard') })
await sleep(500)

// ── ⑪ 小屏(800×600)fs:backing/CSS 同比(单轴下限回归)──
await page.setViewportSize({ width: 800, height: 600 }).catch(() => {})
await sleep(700)
await page.keyboard.press('Escape')
await sleep(400)
await page.click('[data-action="fs-enter"]').catch(() => {})
await sleep(1400)
report.fsSmall = await canvasGeom()
await page.evaluate(() => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}) })
await sleep(400)
await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {})

// ── ⑨ fps(窗口态 running)──
await page.evaluate(() => {
  const back = [...document.querySelectorAll('button')].find((b) => /返回|Back|games\.backToHub/.test(b.textContent || ''))
  if (back) back.click()
}).catch(() => {})
report.fps = await page.evaluate(() => new Promise((resolve) => {
  let frames = 0
  const t0 = performance.now()
  const tick = () => { frames++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else resolve(Math.round((frames * 1000) / (performance.now() - t0))) }
  requestAnimationFrame(tick)
}))

console.log(JSON.stringify(report, null, 2))
process.exit(0)
