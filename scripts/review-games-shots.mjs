/**
 * R96 review: per-game screenshots (ready + mid-play) + runtime probes
 * (console errors, FPS sample, canvas activity). Closes the browser handle.
 */
import { chromium } from 'playwright-core'
import { setTimeout as sleep } from 'node:timers/promises'

const OUT = 'docs/screenshots'
const browser = await chromium.connectOverCDP('http://localhost:9250')
const page = browser.contexts()[0].pages().find(p => p.url().includes('index.html'))
if (!page) { console.error('no page'); process.exit(1) }

const errors = []
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)))
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)) })

await page.locator('.rail-item', { hasText: '游戏' }).first().click()
await sleep(1200)

// game list entries live in the right panel; click by title text
const games = [
  ['Balloon TD Arena', 'balloon'],
  ['Fancy Pants', 'fancy'],
  ['Line Rider', 'lineRider'],
  ['Helicopter', 'helicopter'],
  ['Club Penguin', 'clubPenguin'],
  ['Run ', 'run'],
  ['Age of War', 'ageOfWar'],
  ['Boxhead', 'boxhead'],
  ['Motherload', 'motherload'],
  ['WOP', 'qwop'],
]

// park the mini player out of the way: close it if present
const closeMini = page.locator('.mini-player-header button').nth(1)
if (await closeMini.count()) { await closeMini.click(); await sleep(400) }

for (const [label, id] of games) {
  const btn = page.locator(`button:has-text("${label}")`).first()
  if (!(await btn.count())) { console.log(`SKIP ${id} (no button)`); continue }
  await btn.click()
  await sleep(900)
  await page.screenshot({ path: `${OUT}/r96-${id}-ready.png` })

  // try to start playing: click the primary start control or the canvas
  const startBtn = page.locator('button:has-text("开始"), button:has-text("Start")').first()
  if (await startBtn.count()) { await startBtn.click().catch(() => {}) }
  await sleep(300)
  // interact: click canvas / press space a few times
  const canvas = page.locator('canvas').first()
  if (await canvas.count()) {
    const box = await canvas.boundingBox()
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      if (['helicopter', 'run', 'qwop', 'fancy'].includes(id)) await page.keyboard.down('Space')
      if (id === 'balloon') {
        // place a couple of towers along the path
        await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.35)
        await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.6)
      }
    }
  }
  await page.keyboard.up('Space').catch(() => {})
  await sleep(3500) // let it run
  await page.screenshot({ path: `${OUT}/r96-${id}-play.png` })

  // probe: fps + canvas activity + phase text
  const probe = await page.evaluate(() => {
    const c = document.querySelector('canvas')
    if (!c) return { noCanvas: true }
    const ctx = c.getContext('2d')
    const d = ctx.getImageData(0, 0, c.width, c.height).data
    let sum = 0, n = 0
    for (let i = 0; i < d.length; i += 997) { sum += d[i]; n++ }
    const bodyText = document.body.innerText.slice(0, 400)
    return { w: c.width, h: c.height, brightness: Math.round(sum / n), phaseHint: (bodyText.match(/准备|进行中|胜利|失败|Won|Lost|Ready|Wave \d+\/\d+/) || [])[0] ?? null }
  })
  console.log(`${id}: ${JSON.stringify(probe)}`)

  // back to hub for the next selection (clicking the list item directly also works)
  await sleep(300)
}

console.log('pageErrors:', errors.length ? errors.slice(0, 8).join('\n') : '(none)')
await browser.close()
process.exit(0)
