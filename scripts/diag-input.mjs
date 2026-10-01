/** R221 后诊断:键盘无法控制游戏——进 survival 开局,按住 a,读 probe + console 错误。 */
import { assertFreshOut, launchElectron, connectRenderer } from './lib/cdp.mjs'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9298
assertFreshOut()
launchElectron({ port: PORT })
const { page } = await connectRenderer({ port: PORT })
await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {})
const consoleErrors = []
page.on('console', (msg) => {
  const t = msg.type()
  if (t === 'error' || t === 'warning' || (t === 'log' && msg.text().includes('[diag]'))) consoleErrors.push(`${t}: ${msg.text().slice(0, 300)}`)
})
page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${String(err).slice(0, 400)}`))

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
await page.locator('.module-rail .rail-item').nth(5).click()
await sleep(900)
await page.evaluate(() => {
  const card = [...document.querySelectorAll('button, .game-card')]
    .find((b) => /蜂群|Swarm/i.test(b.textContent || ''))
  if (card) card.click()
})
await sleep(1000)
await page.click('[data-action="ready-start"]')
await sleep(800)

// 合成 keydown 打到 body(带 code/key,bubbles)——验证游戏自己的 window 监听器是否在位并写键池
const synthBody = await page.evaluate(() => {
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', bubbles: true, cancelable: true }))
  const k1 = [...(window).__rgbboxVision.probe().keys]
  document.body.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', code: 'KeyA', bubbles: true, cancelable: true }))
  const active = document.activeElement ? String(document.activeElement.tagName) + '#' + String(document.activeElement.className).slice(0, 40) : 'null'
  return { keysAfterDown: k1, active }
})
const before = await page.evaluate(() => (window).__rgbboxVision.probe())
// 捕获层计数器:真实键盘事件到底有没有到达本页 window
await page.evaluate(() => {
  window.__kd = { n: 0, keys: [], targets: [] }
  window.__kdProbe = (e) => { window.__kd.n++; window.__kd.keys.push(e.key); window.__kd.targets.push(e.target ? String(e.target.tagName || e.target) : 'null') }
  window.addEventListener('keydown', window.__kdProbe, true)
})
await page.keyboard.down('a')
await sleep(300)
const held1 = await page.evaluate(() => ({ ...(window).__rgbboxVision.probe(), kd: { ...window.__kd } }))
await sleep(1200)
const held2 = await page.evaluate(() => (window).__rgbboxVision.probe())
await page.keyboard.up('a')
await page.evaluate(() => window.removeEventListener('keydown', window.__kdProbe, true))
// 原生 KeyboardEvent 直发一发,测 window 级监听器是否在
const synth = await page.evaluate(() => {
  let saw = false
  const probe = (ev) => { if (ev.key === 'a') saw = true }
  window.addEventListener('keydown', probe, { once: true })
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
  window.removeEventListener('keydown', probe)
  return saw
})
const after = held2
await page.keyboard.up('a')

console.log(JSON.stringify({
  synthBody,
  before: { x: before.player.x, phase: before.phase },
  held1: { keys: held1.keys, axis: held1.axis, x: held1.player.x, kd: held1.kd },
  held2: { keys: held2.keys, x: held2.player.x, moved: held2.player.x - before.player.x },
  synthKeydownSeen: synth,
  after: { x: after.player.x, moved: after.player.x - before.player.x, phase: after.phase, keys: after.keys },
  consoleErrors: consoleErrors.slice(0, 10),
}, null, 2))
process.exit(0)
