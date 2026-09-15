/**
 * R97 real-machine smoke: TD tower upgrade + wave + speed toggle, helicopter
 * 3-life crash survival, motherload dig/fuel loop, best-score persistence,
 * replay via Start after game over. Zero page errors expected throughout.
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

const stats = async () => page.evaluate(() => {
  const out = {}
  document.querySelectorAll('.games-stat-grid span').forEach(el => {
    const label = el.getAttribute('aria-label') || ''
    const num = label.match(/(\d+)/)
    if (label.includes('生命') || label.includes('Lives')) out.lives = num?.[1]
    else if (label.includes('金币') || label.includes('coins')) out.coins = num?.[1]
    else if (label.includes('状态') || label.includes('status')) out.phase = el.textContent.trim()
    else if (label.includes('波次') || label.includes('wave')) out.wave = label.match(/(\d+)\s*\/\s*(\d+)/)?.[0]
  })
  return out
})

await page.locator('.rail-item', { hasText: '游戏' }).first().click()
await sleep(1200)
const closeMini = page.locator('.mini-player-header button').nth(1)
if (await closeMini.count()) { await closeMini.click(); await sleep(400) }

// ── TD: build → upgrade (coins 220→150→90), speed toggle, wave running ──
// NB: activeGame survives across CDP script runs (component stays mounted) and
// once wave > 0 the primary button label flips to 下一波 (a has-text("开始")
// locator would then hit 重新开始) — pin the game card + restart explicitly.
await page.locator('button:has-text("Balloon TD")').first().click()
await sleep(400)
await page.locator('button:has-text("重新开始")').first().click()
await sleep(400)
const canvas = page.locator('canvas').first()
const box = await canvas.boundingBox()
await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.35)
await sleep(600)
let s = await stats()
check('td: tower built, coins 220→150', s.coins === '150', `coins=${s.coins}`)
await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.35)
await sleep(600)
s = await stats()
check('td: tower upgraded to Lv2, coins 150→90', s.coins === '90', `coins=${s.coins}`)
const speedBtn = page.locator('button[title="加速播放"], button[title="Playback speed"]')
check('td: 2x speed toggle present', (await speedBtn.count()) === 1)
await sleep(1500)
s = await stats()
check('td: wave 1 running after build (auto-launch)', s.wave === '1/12' && (s.phase === '运行中' || s.phase === 'Running'), `wave=${s.wave} phase=${s.phase}`)
await page.screenshot({ path: 'docs/screenshots/r97-td-upgrade.png' })

// ── Helicopter: 3 lives → crash survives at 2, then game over → best + replay ──
await page.locator('button:has-text("Helicopter")').first().click()
await sleep(400)
await page.locator('button:has-text("重新开始")').first().click()
await sleep(800)
s = await stats()
check('heli: starts with 3 lives', s.lives === '3', `lives=${s.lives}`)
await page.locator('button:has-text("开始"), button:has-text("Start")').first().click()
await sleep(300)
await page.keyboard.down('Space')
await sleep(1300)
await page.keyboard.up('Space')
await sleep(600)
s = await stats()
check('heli: ceiling crash costs one life, still running', s.lives === '2' && (s.phase === '运行中' || s.phase === 'Running'), `lives=${s.lives} phase=${s.phase}`)
await sleep(1500)
await page.screenshot({ path: 'docs/screenshots/r97-heli-lives.png' })
await page.keyboard.down('Space')
for (let i = 0; i < 16; i++) {
  await sleep(500)
  s = await stats()
  if (s.phase === '失败' || s.phase === 'Defeated') break
}
await page.keyboard.up('Space')
check('heli: game over reached', s.phase === '失败' || s.phase === 'Defeated', `phase=${s.phase}`)
const best = await page.evaluate(() => localStorage.getItem('rgbbox:gamesBest:helicopter'))
check('heli: best score persisted', best !== null && Number(best) > 0, `best=${best}`)
await page.locator('button:has-text("开始"), button:has-text("Start")').first().click()
await sleep(600)
s = await stats()
check('heli: Start replays with fresh 3 lives', s.lives === '3' && (s.phase === '运行中' || s.phase === 'Running'), `lives=${s.lives} phase=${s.phase}`)

// ── Motherload: dig drains fuel, surface refuels ──
await page.locator('button:has-text("Motherload")').first().click()
await sleep(400)
await page.locator('button:has-text("重新开始")').first().click()
await sleep(800)
await page.locator('button:has-text("开始"), button:has-text("Start")').first().click()
await sleep(300)
await page.keyboard.down('S')
await sleep(4000)
await page.keyboard.up('S')
s = await stats()
check('mine: digging drains fuel', s.coins !== null && Number(s.coins) < 95, `fuel=${s.coins}`)
await page.screenshot({ path: 'docs/screenshots/r97-mine-deep.png' })
await page.keyboard.down('W')
await sleep(8000)
await page.keyboard.up('W')
await sleep(800)
s = await stats()
check('mine: surface refuels', s.coins !== null && Number(s.coins) > 90, `fuel=${s.coins}`)
await page.screenshot({ path: 'docs/screenshots/r97-mine-surface.png' })

check('zero page errors', errors.length === 0, errors.slice(0, 5).join(' | '))
const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} PASS`)
await browser.close()
process.exit(failed.length ? 1 : 0)
