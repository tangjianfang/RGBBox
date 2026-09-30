/**
 * R219.8 取证:①持续移动卡顿——每帧 rAF 间隔分布(静止 vs 按住 ← 3s);
 * ②开始瞬间画布尺寸轨迹(每 60ms 采样 1.2s,断言无逐拍爬升)。
 */
import { assertFreshOut, launchElectron, connectRenderer } from './lib/cdp.mjs'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9297
assertFreshOut()
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

// 页内 rAF 间隔采样器
const sampler = () => page.evaluate(() => new Promise((resolve) => {
  const deltas = []
  let last = performance.now()
  const t0 = last
  const tick = () => {
    const now = performance.now()
    deltas.push(now - last)
    last = now
    if (now - t0 < 3000) requestAnimationFrame(tick)
    else {
      const sorted = [...deltas].sort((a, b) => a - b)
      const pick = (q) => Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))])
      resolve({
        frames: deltas.length,
        p50: pick(0.5), p95: pick(0.95), max: Math.round(sorted[sorted.length - 1]),
        over32: deltas.filter((d) => d > 32).length,
        over20: deltas.filter((d) => d > 20).length,
      })
    }
  }
  requestAnimationFrame(tick)
}))

// 进 Swarm
await page.locator('.module-rail .rail-item').nth(5).click()
await sleep(900)
await page.evaluate(() => {
  const card = [...document.querySelectorAll('button, .game-card')]
    .find((b) => /蜂群|Swarm/i.test(b.textContent || ''))
  if (card) card.click()
})
await sleep(1100)

// ② 开始瞬间画布尺寸轨迹(点 开始 前起,每 60ms 采样 1.2s)
const trackStart = page.evaluate(() => new Promise((resolve) => {
  const samples = []
  const t0 = performance.now()
  const snap = () => {
    const c = document.querySelector('canvas.games-canvas')
    if (c) {
      const r = c.getBoundingClientRect()
      samples.push(Math.round(r.width) + 'x' + Math.round(r.height))
    }
    if (performance.now() - t0 < 1200) setTimeout(snap, 60)
    else resolve(samples)
  }
  snap()
}))
await page.click('[data-action="ready-start"]')
const startTrack = await trackStart

// ① 干净协议:静置 8s 等启动/构建噪声消散,idle/moving 交替 3 轮(2s 每段)对消漂移
const loopAcc = () => page.evaluate(() => {
  const a = (window).__r219loop ?? { n: 0, tick: 0, draw: 0, other: 0 }
  const g = (window).__r219gap ?? { n: 0, gap: 0 }
  return {
    n: a.n,
    tickAvg: +(a.tick / Math.max(1, a.n)).toFixed(2),
    drawAvg: +(a.draw / Math.max(1, a.n)).toFixed(2),
    otherAvg: +(a.other / Math.max(1, a.n)).toFixed(2),
    entryGapAvg: +(g.gap / Math.max(1, g.n)).toFixed(2), // rAF 时间戳→真实入口(pending 布局冲刷)
  }
})
const counts = () => page.evaluate(() => (window).__rgbboxVision.probe().counts)
const resetAcc = () => page.evaluate(() => {
  (window).__r219loop = { n: 0, tick: 0, draw: 0, other: 0 }
  ;(window).__r219gap = { n: 0, gap: 0 }
})
const shortSample = (ms) => page.evaluate((ms) => new Promise((resolve) => {
  const deltas = []
  let last = performance.now()
  const t0 = last
  const tick = () => {
    const now = performance.now()
    deltas.push(now - last)
    last = now
    if (now - t0 < ms) requestAnimationFrame(tick)
    else {
      const sorted = [...deltas].sort((a, b) => a - b)
      resolve({ frames: deltas.length, p50: Math.round(sorted[Math.floor(sorted.length / 2)]), over32: deltas.filter((d) => d > 32).length })
    }
  }
  requestAnimationFrame(tick)
}), ms)

await sleep(8000)
const rounds = []
for (let r = 0; r < 3; r++) {
  resetAcc()
  const idle = await shortSample(2000)
  const accIdle = await loopAcc()
  resetAcc()
  await page.keyboard.down('a')
  const moving = await shortSample(2000)
  await page.keyboard.up('a')
  const accMoving = await loopAcc()
  rounds.push({ round: r + 1, idle, accIdle, moving, accMoving, counts: await counts().catch(() => null) })
}
// 对照:隐藏画布(停合成/光栅)
await page.evaluate(() => { const c = document.querySelector('canvas.games-canvas'); if (c) c.style.display = 'none' })
await sleep(800)
const hidden = await sampler()
const hiddenAcc = await loopAcc()
await page.evaluate(() => { const c = document.querySelector('canvas.games-canvas'); if (c) c.style.display = '' })

console.log(JSON.stringify({
  rounds,
  hiddenCanvas: { frames: hidden, acc: hiddenAcc },
  start: {
    track: startTrack,
    distinct: [...new Set(startTrack)],
    settledAtIndex: startTrack.findIndex((s) => s === startTrack[startTrack.length - 1]),
  },
}, null, 2))
process.exit(0)
