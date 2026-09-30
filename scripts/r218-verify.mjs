/**
 * R218 verify: four-game visual pass — ready-panel redesign (≤5 + drawer),
 * in-game HUD (health bars / capsules), Survival big-world camera, and a
 * frame-rate sanity sample while the game runs.
 */
import { assertFreshOut, launchElectron, connectRenderer } from './lib/cdp.mjs'
import { mkdirSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9299
const OUT = 'docs/ui-review/r218'
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

// ── Survival: ready panel → start → in-game (HUD/bars/world) ────────────────
await page.locator('.module-rail .rail-item').nth(5).click()
await sleep(900)
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button, [role=button], .game-card, a')]
  const card = btns.find((b) => /蜂群|Swarm/i.test(b.textContent || ''))
  if (card) card.click()
})
await sleep(1100)
await page.screenshot({ path: `${OUT}/sv-ready.png` })
report.readyPanel = await page.evaluate(() => {
  const txt = document.body.innerText
  return {
    hasDrawer: /更多设置|More settings/i.test(txt),
    hasDifficulty: /休闲|困难|炼狱|casual|hard|insane/i.test(txt),
    startBtn: [...document.querySelectorAll('button')].filter((b) => /games\.start|开局/.test(b.textContent || '')).length
  }
})
// start the run
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')]
  const start = btns.find((b) => /games\.start|开局/.test(b.textContent || ''))
  if (start) start.click()
})
await sleep(1800)
await page.screenshot({ path: `${OUT}/sv-running.png` })
report.inGame = await page.evaluate(() => {
  const c = document.querySelector('canvas')
  return { canvasFound: c !== null, backing: c ? c.width : null }
})
// frame-rate sample
report.fps = await page.evaluate(() => new Promise((resolve) => {
  let frames = 0
  const t0 = performance.now()
  const tick = () => { frames++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else resolve(Math.round((frames * 1000) / (performance.now() - t0))) }
  requestAnimationFrame(tick)
}))
await page.keyboard.press('Escape').catch(() => {})
await sleep(400)

// ── TD / Tetris / Slash ready panels ────────────────────────────────────────
const tiles = [/塔防|TD/i, /方块|Tetris/i, /斩|Slash/i]
const names = ['td', 'tetris', 'slash']
for (let i = 0; i < tiles.length; i++) {
  await page.evaluate((re) => {
    const btns = [...document.querySelectorAll('button, [role=button], .game-card, a')]
    const back = btns.find((b) => /返回|Back/i.test(b.textContent || ''))
    if (back) back.click()
  }, null).catch(() => {})
  await sleep(500)
  await page.evaluate((reSrc) => {
    const re = new RegExp(reSrc.replace(/^\/|\/i$/g, ''), 'i')
    const btns = [...document.querySelectorAll('button, [role=button], .game-card, a')]
    const card = btns.find((b) => re.test(b.textContent || ''))
    if (card) card.click()
  }, tiles[i].source).catch(() => {})
  await sleep(1000)
  await page.screenshot({ path: `${OUT}/${names[i]}-ready.png` })
  report[`${names[i]}Ready`] = await page.evaluate(() => {
    const txt = document.body.innerText
    return { hasDrawer: /更多设置|More settings/i.test(txt), hasDifficulty: /休闲|casual/i.test(txt) }
  })
}

console.log(JSON.stringify(report, null, 1))
const ok = report.readyPanel?.hasDrawer && report.readyPanel?.hasDifficulty && (report.fps ?? 0) >= 55
console.log(ok ? 'R218-VERIFY OK' : 'R218-VERIFY CHECK NEEDED')
process.exit(ok ? 0 : 1)
