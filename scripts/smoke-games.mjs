/**
 * R222.1 L4b — 运行时冒烟·游戏环：4 作「hub→ready→开局→键盘输入→移动→结算」
 * 核心环断言（T4 GAMES 映射表 + R221.7 复现场景即门禁自证）。
 * exit 0=全过 1=断言败 2=环境败。失败截图 .verify-artifacts/。
 */
import { assertFreshOut, launchElectron, connectRenderer } from './lib/cdp.mjs'
import { mkdirSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9302
const ART = '.verify-artifacts'
mkdirSync(ART, { recursive: true })

let failed = 0
const t0 = Date.now()
const check = (id, title, ok, extra = '') => {
  if (ok) console.log(`  [pass] ${id} ${title}`)
  else { failed++; console.log(`  [FAIL] ${id} ${title}${extra ? ` — ${extra}` : ''}`) }
}

assertFreshOut()
launchElectron({ port: PORT })
const { page } = await connectRenderer({ port: PORT })
await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {})
await page.evaluate(() => {
  const doomed = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith('rgbbox:')) doomed.push(k)
  }
  for (const k of doomed) localStorage.removeItem(k)
}).catch(() => {})
await page.reload()
await page.waitForSelector('.module-rail', { timeout: 15000 })
await sleep(700)
await page.locator('.module-rail .rail-item').nth(5).click()
await sleep(900)

const shot = (n) => page.screenshot({ path: `${ART}/smoke-games-${n}.png` }).catch(() => undefined)
const enterGame = async (idx) => {
  await page.evaluate((i) => {
    const cards = [...document.querySelectorAll('button, .game-card')]
    const byText = [/蜂群|Swarm/i, /塔防|TD|气球/i, /方块|Tetris/i, /斩|Slash/i]
    const card = cards.find((b) => byText[i].test(b.textContent || ''))
    if (card) card.click()
  }, idx).catch(() => undefined)
  await sleep(900)
}
const probe = () => page.evaluate(() => (window).__rgbboxVision.probe()).catch(() => null)

// ═══ 游戏 1：Nova Swarm（survival — R221.7 复现场景为门禁核心）═══
console.log('\n[Swarm] 输入接线/移动/结算环')
await enterGame(0)
check('sv-01', 'ready 面板出现', (await page.locator('[data-field="ready-panel"]').count()) === 1)
await page.click('[data-action="ready-start"]').catch(() => undefined)
await sleep(800)
let p0 = await probe()
check('sv-02', '开局进入 running', p0?.phase === 'running', `phase=${p0?.phase}`)
// 键盘输入接线（R221.7:曾因每帧清键全失效）
await page.keyboard.down('a'); await sleep(1200); const p1 = await probe(); await page.keyboard.up('a')
const moved = Math.abs((p1?.player?.x ?? 0) - (p0?.player?.x ?? 0))
check('sv-03', 'WASD 移动生效(≥100px/s)', moved >= 100, `moved=${moved.toFixed(1)}`)
await page.keyboard.down('ArrowRight'); await sleep(600); const p2 = await probe(); await page.keyboard.up('ArrowRight')
const movedY = Math.abs((p2?.player?.x ?? 0) - (p1?.player?.x ?? 0))
check('sv-04', '方向键同样生效', movedY >= 40, `moved=${movedY.toFixed(1)}`)
// 结算环:回 hub 即按 lost 结算(R220.1⑧)
const back = [...await page.locator('button').all()].find?.call ? null : null
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /返回|Back|games\.backToHub/.test((x.getAttribute('aria-label') || '') + (x.textContent || '')))
  if (b) b.click()
}).catch(() => undefined)
await sleep(700)
const p3 = await probe()
check('sv-05', '中途回 hub 结算为 lost', p3?.phase === 'lost', `phase=${p3?.phase}`)
await shot('survival')
await page.locator('.module-rail .rail-item').nth(5).click(); await sleep(600)

// ═══ 游戏 2：TD（开局→波次推进）═══
console.log('\n[TD] 开局环')
await enterGame(1)
await page.click('[data-action="ready-start"]').catch(() => undefined)
await sleep(900)
const tdState = await page.evaluate(() => {
  const el = document.querySelector('canvas.games-canvas')
  return { hasCanvas: !!el, status: document.querySelector('.games-canvas-status')?.textContent?.slice(0, 60) ?? '' }
})
check('td-01', 'TD 画布+状态条在位', tdState.hasCanvas && tdState.status.length > 0)
// 建一座塔(画布中心点击走统一分发)
await page.evaluate(() => {
  const c = document.querySelector('canvas.games-canvas')
  if (!c) return
  const r = c.getBoundingClientRect()
  c.dispatchEvent(new MouseEvent('click', { clientX: r.left + r.width * 0.5, clientY: r.top + r.height * 0.5, bubbles: true }))
}).catch(() => undefined)
await sleep(500)
const tdAfter = await page.evaluate(() => document.querySelector('.games-canvas-status')?.textContent?.slice(0, 80) ?? '')
check('td-02', 'TD 点击建塔后状态推进(波次/敌数文本变化或塔数>0)', tdAfter !== tdState.status || /1\/\d|波|wave/i.test(tdAfter), `status="${tdAfter.slice(0, 40)}"`)
await shot('td')
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /返回|Back/.test((x.getAttribute('aria-label') || '') + (x.textContent || ''))); if (b) b.click() }).catch(() => undefined)
await sleep(500)
await page.locator('.module-rail .rail-item').nth(5).click(); await sleep(500)

// ═══ 游戏 3：Tetris（开局→键盘命令环——R221.7② won 结算的运行面）═══
console.log('\n[Tetris] 命令环')
await enterGame(2)
await page.click('[data-action="ready-start"]').catch(() => undefined)
await sleep(800)
// Tetris 无 vision probe——用画布存活+键盘命令不炸为断言
await page.keyboard.press('ArrowLeft'); await sleep(150); await page.keyboard.press('ArrowUp'); await sleep(150)
const teCanvasAlive = (await page.locator('canvas.games-canvas').count()) === 1
check('te-01', 'Tetris 开局+键盘命令不炸(画布存活)', teCanvasAlive)
await shot('tetris')
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /返回|Back/.test((x.getAttribute('aria-label') || '') + (x.textContent || ''))); if (b) b.click() }).catch(() => undefined)
await sleep(500)
await page.locator('.module-rail .rail-item').nth(5).click(); await sleep(500)

// ═══ 游戏 4：Slash（开局→方向斩击）═══
console.log('\n[Slash] 斩击环')
await enterGame(3)
await page.click('[data-action="ready-start"]').catch(() => undefined)
await sleep(800)
await page.keyboard.press('ArrowRight'); await sleep(150)
await page.keyboard.press('ArrowUp'); await sleep(150)
const slCanvasAlive = (await page.locator('canvas.games-canvas').count()) === 1
check('sl-01', 'Slash 开局+方向斩击不炸(画布存活)', slCanvasAlive)
await shot('slash')

console.log(`\n[smoke-games] ${failed} FAIL — ${((Date.now() - t0) / 1000).toFixed(1)}s`)
process.exit(failed > 0 ? 1 : 0)
