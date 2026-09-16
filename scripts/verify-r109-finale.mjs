/**
 * R109 finale long-run: one real 90s+ Nova Swarm run — level-up cards clicked
 * automatically, boss killed, roulette claimed (build grows), player wiggles
 * into the portal, island advances. Also captures the zh TD ready overlay.
 */
import { chromium } from 'file:///C:/Users/tjf/AppData/Roaming/npm/node_modules/playwright/index.mjs'
import { setTimeout as sleep } from 'node:timers/promises'

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

const browser = await chromium.connectOverCDP('http://localhost:9250')
const page = browser.contexts()[0].pages().find(p => p.url().includes('index.html'))
if (!page) { console.error('no page'); process.exit(1) }
const errors = []
page.on('pageerror', e => errors.push(String(e).slice(0, 200)))
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)) })

// ── zh TD ready overlay screenshot (U7 收口, human-review artifact) ──
await page.locator('.rail-item', { hasText: '游戏' }).first().click()
await sleep(1000)
const closeMini = page.locator('.mini-player-header button').nth(1)
if (await closeMini.count()) { await closeMini.click(); await sleep(300) }
const backBtn = page.locator('button:has-text("返回游戏库"), button:has-text("Game library")')
if (await backBtn.count()) { await backBtn.first().click(); await sleep(400) }
await page.locator('.game-tile:not(.ghost)').first().click()
await sleep(700)
await page.locator('button:has-text("重新开始")').first().click()
await sleep(500)
await page.screenshot({ path: 'docs/screenshots/r109-td-ready-zh.png' })

// ── seed a strong, non-glass profile and remount ──
await page.evaluate(() => localStorage.setItem('rgbbox:gamesMeta:swarm', JSON.stringify({
  coins: 0,
  perm: { damage: 3, fireRate: 3, moveSpeed: 2, maxHp: 3, xpGain: 2, luck: 3 },
  stats: { runs: 20, totalKills: 3000, bosses: 6, bestCombo: 30, bestScore: 5000 },
  artifacts: {},
  achievements: {},
})))
const railHome = page.locator('.rail-item').first()
await railHome.click().catch(() => {})
await sleep(700)
await page.locator('.rail-item', { hasText: '游戏' }).first().click()
await sleep(900)
if (await backBtn.count()) { await backBtn.first().click(); await sleep(400) }

await page.locator('.game-tile:not(.ghost)').nth(1).click()
await sleep(600)
// Volt: innate orbit blade + 15% fire rate — roughly double DPS; kills are defense
await page.locator('.char-card').nth(2).click()
await sleep(300)
await page.locator('button:has-text("重新开始")').first().click()
await sleep(300)
await page.locator('button:has-text("开始"), button:has-text("Start")').first().click()

let rouletteClaimed = false
let islandReached = false
let portalSeen = false
let portalHint = null
let sweepTick = 0
let invBeforeClaim = -1
let attempts = 0
let attemptTick = 0
let bossSeeded = false
let seedTick = 0
// dead-reckoned player position (we command every move; Volt speed ≈ 190 px/s)
let px = 450
let py = 260
const MOVE_SPEED = 190
const HOLD_MS = 500

const holdMove = async (dir, ms) => {
  await page.keyboard.down(dir)
  await sleep(ms)
  await page.keyboard.up(dir)
  const dist = (MOVE_SPEED * ms) / 1000
  if (dir === 'd') px = Math.min(884, px + dist)
  else if (dir === 'a') px = Math.max(16, px - dist)
  else if (dir === 's') py = Math.min(504, py + dist)
  else if (dir === 'w') py = Math.max(16, py - dist)
}

// scan the live canvas for the enemy-mass centroid (red/pink hues, HUD rows skipped)
const enemyCentroid = async () => page.evaluate(() => {
  const canvas = document.querySelector('canvas')
  if (!canvas) return null
  const ctx = canvas.getContext('2d')
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  let sx = 0
  let sy = 0
  let n = 0
  for (let y = 70; y < canvas.height - 30; y += 6) {
    for (let x = 0; x < canvas.width; x += 6) {
      const i = (y * canvas.width + x) * 4
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      if (r > 195 && g < 175 && b < 195) {
        sx += x
        sy += y
        n += 1
      }
    }
  }
  return n > 4 ? { cx: sx / n, cy: sy / n, n } : null
})

// scan for the portal (cyan arc OR gold arc, 3px grid — the ring is thin)
const portalScan = async () => page.evaluate(({ skipX, skipY }) => {
  const canvas = document.querySelector('canvas')
  if (!canvas) return null
  const ctx = canvas.getContext('2d')
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  let sx = 0
  let sy = 0
  let n = 0
  for (let y = 90; y < canvas.height - 40; y += 3) {
    for (let x = 30; x < canvas.width - 30; x += 3) {
      if (Math.hypot(x - skipX, y - skipY) < 40) continue
      const i = (y * canvas.width + x) * 4
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      // cyan only — the gold channel matches kill-burst particles everywhere
      if (r < 170 && g > 180 && b > 210) {
        sx += x
        sy += y
        n += 1
      }
    }
  }
  return n > 8 && n < 70 ? { cx: sx / n, cy: sy / n, n } : null
}, { skipX: px, skipY: py })

outer:
for (let tick = 0; tick < 600; tick++) {
  await sleep(1000)
  attemptTick += 1

  // R109.2 E2E seam: place a boss ~10s into each attempt instead of a 90s wait
  if (!bossSeeded && attemptTick >= 10) {
    bossSeeded = true
    seedTick = attemptTick
    await page.evaluate(() => window.__rgbboxGames?.spawnBoss()).catch(() => {})
  }

  // auto-fire targets the NEAREST enemy — stand still right after seeding so
  // the boss closes in, becomes the nearest target, and melts under fire.
  // Bail to fleeing if the HP chip dips to 3.
  if (bossSeeded && !portalSeen && attemptTick - seedTick < 12) {
    const hp = await page.evaluate(() => {
      const chip = [...document.querySelectorAll('.games-stat-grid span')].find(el => (el.getAttribute('aria-label') || '').includes('生命'))
      return Number(chip?.textContent.replace(/\D/g, '') ?? 9)
    })
    if (hp > 3) continue
  }

  // click level-up cards when frozen — prefer damage/multishot/sustain builds
  const cards = await page.evaluate(() => document.querySelectorAll('.levelup-card').length)
  if (cards > 0) {
    const smart = page.locator('.levelup-card', { hasText: '重弹头' }).or(page.locator('.levelup-card', { hasText: '分裂齐射' })).or(page.locator('.levelup-card', { hasText: '速射循环' })).or(page.locator('.levelup-card', { hasText: '纳米修复' })).or(page.locator('.levelup-card', { hasText: '贯穿弹' })).or(page.locator('.levelup-card', { hasText: '环绕刃' })).first()
    if (await smart.count()) await smart.click({ force: true })
    else await page.locator('.levelup-card').first().click({ force: true })
    await sleep(250)
    continue
  }

  // claim a roulette when the boss has paid out — tolerate mid-flow races
  // (a level-up can freeze the game and detach the FAB between check & click)
  const fab = await page.evaluate(() => document.querySelectorAll('.spin-fab').length)
  if (fab > 0) portalSeen = true
  if (fab > 0 && !rouletteClaimed) {
    invBeforeClaim = await page.evaluate(() => document.querySelectorAll('.swarm-inv li').length)
    const opened = await page.locator('.spin-fab').click({ force: true, timeout: 4000 }).then(() => true).catch(() => false)
    if (!opened) continue
    const wheels = await page.locator('.roulette-wheels button').first().click({ force: true, timeout: 4000 }).then(() => true).catch(() => false)
    if (!wheels) continue
    for (let w = 0; w < 10; w++) {
      await sleep(400)
      if (await page.evaluate(() => document.querySelectorAll('.roulette-result').length)) break
    }
    const claimed = await page.locator('.roulette-actions button').first().click({ force: true, timeout: 4000 }).then(() => true).catch(() => false)
    if (!claimed) continue
    await sleep(600)
    rouletteClaimed = true
    // the boss died chasing us — the portal is near where we stood at claim time
    portalHint = { x: px, y: py }
    const postClaim = await page.evaluate(() => ({
      roulette: document.querySelectorAll('.swarm-roulette').length,
      inv: document.querySelectorAll('.swarm-inv li').length,
    }))
    check('roulette: claimed via wheel, overlay closes, run resumes', postClaim.roulette === 0, `roulette=${postClaim.roulette} inv ${invBeforeClaim}→${postClaim.inv}`)
  }

  // island probe
  const status = await page.evaluate(() => document.querySelector('.games-canvas-status')?.textContent ?? '')
  if (/[岛屿|Island]\s*[2-9]/i.test(status)) {
    islandReached = true
    check('island: portal entered, status shows Island 2+', status.match(/[岛屿|Island]\s*\d/i)?.[0] ?? '')
    break
  }

  // death guard — retry with a fresh run (RNG-heavy survival), max 3 attempts
  const summary = await page.evaluate(() => document.querySelectorAll('.swarm-summary').length)
  if (summary > 0) {
    attempts += 1
    if (attempts >= 4) {
      check('long-run: survived to the portal within 3 attempts', false, `last death at tick=${tick}s`)
      break outer
    }
    portalSeen = false
    attemptTick = 0
    bossSeeded = false
    px = 450
    py = 260
    await page.locator('button:has-text("重新开始")').first().click()
    await sleep(500)
    await page.locator('.char-card').nth(2).click().catch(() => {})
    await sleep(200)
    await page.locator('button:has-text("开始"), button:has-text("Start")').first().click()
    continue
  }

  // autopilot: hunt the portal (scan → hint → sweep), otherwise flee the swarm
  const portal = portalSeen ? await portalScan() : null
  const swarm = await enemyCentroid()
  if (tick % 5 === 0) console.log(`t=${tick} est=(${px | 0},${py | 0}) portal=${portal ? `${(portal.cx | 0)},${(portal.cy | 0)}n${portal.n}` : '-'} swarm=${swarm ? `n${swarm.n}` : '-'}`)
  let dir
  if (portal) {
    const dx = portal.cx - px
    const dy = portal.cy - py
    if (Math.hypot(dx, dy) > 150) {
      const primary = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'd' : 'a') : (dy >= 0 ? 's' : 'w')
      const secondary = Math.abs(dx) >= Math.abs(dy) ? (dy >= 0 ? 's' : 'w') : (dx >= 0 ? 'd' : 'a')
      await holdMove(primary, HOLD_MS)
      await holdMove(secondary, 300)
    } else {
      // dead-reckoning drifts — brute-force the 30px contact ring with an
      // 8-spoke sweep around the current spot
      const spokes = ['d', 'w', 's', 'a', 'd', 's', 'w', 'a']
      for (const spoke of spokes) await holdMove(spoke, 300)
    }
    continue
  } else if (portalHint) {
    const dx = portalHint.x - px
    const dy = portalHint.y - py
    if (Math.hypot(dx, dy) > 70) {
      dir = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'd' : 'a') : (dy >= 0 ? 's' : 'w')
      await holdMove(dir, HOLD_MS)
      continue
    }
    // near the hint but scan sees nothing — tight radial sweep around it
    const spokes = ['d', 's', 'a', 'w', 'd', 'w', 'a', 's']
    await holdMove(spokes[sweepTick++ % spokes.length], 260)
    continue
  } else if (swarm && swarm.n > 12) {
    const dx = px - swarm.cx
    const dy = py - swarm.cy
    dir = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'd' : 'a') : (dy >= 0 ? 's' : 'w')
    // avoid hugging walls while fleeing — fold back toward center instead
    if ((dir === 'd' && px > 700) || (dir === 'a' && px < 200) || (dir === 's' && py > 400) || (dir === 'w' && py < 120)) {
      dir = px < 450 ? 'd' : px > 450 ? 'a' : py < 260 ? 's' : 'w'
    }
  } else {
    dir = px < 420 ? 'd' : px > 480 ? 'a' : py < 240 ? 's' : py > 280 ? 'w' : 'd'
  }
  await holdMove(dir, HOLD_MS)
}

check('long-run: boss roulette claimed', rouletteClaimed)
check('long-run: island advanced to 2+', islandReached)
check('zero page errors', errors.length === 0, errors.slice(0, 5).join(' | '))
await page.screenshot({ path: 'docs/screenshots/r109-island.png' })

const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} PASS`)
await browser.close()
process.exit(failed.length ? 1 : 0)
