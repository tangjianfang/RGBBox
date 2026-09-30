/**
 * R216 merge-gate UI probe: interactive states of the newly merged features
 * that the 9 static views don't cover (G: LanPanel tetris room type;
 * AI: agent tab fold affordances; V: player-mode superres entry).
 * Screenshot what's reachable without media/session data; the rest is
 * covered by component tests (recorded in the report).
 */
import { assertFreshOut, launchElectron, connectRenderer } from './lib/cdp.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9293
const OUT = 'docs/ui-review/r216'
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

const findings = {}

// ── G: LanPanel / tetris room type (games view) ─────────────────────────────
try {
  await page.locator('.module-rail .rail-item').nth(5).click() // games
  await sleep(800)
  const lanInfo = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    const lan = btns.find((b) => /LAN|联机|局域网/.test(b.textContent || ''))
    if (lan) { lan.click(); return { clicked: (lan.textContent || '').trim() } }
    return { clicked: null, hint: [...document.querySelectorAll('button')].slice(0, 12).map((b) => (b.textContent || '').trim()).filter(Boolean) }
  })
  await sleep(900)
  const tetrisRoom = await page.evaluate(() => {
    const txt = document.body.innerText
    return {
      hasRoomType: /Tetris|对战|俄罗斯/.test(txt) && /合作|TD|塔防/.test(txt),
      hasTetrisWord: /Tetris|俄罗斯/.test(txt),
      hasHost: /建房|创建房间|Host/i.test(txt)
    }
  })
  findings.lan = { ...lanInfo, ...tetrisRoom }
  await page.screenshot({ path: `${OUT}/games-lan.png` })
  console.log('SHOT games-lan', JSON.stringify(findings.lan))
} catch (e) { findings.lan = { error: e.message.split('\n')[0] }; console.error('LAN probe fail:', findings.lan.error) }

// ── V: video player mode superres entry ────────────────────────────────────
try {
  await page.locator('.module-rail .rail-item').nth(3).click() // video
  await sleep(800)
  const player = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button,[role=tab],[role=button]')]
    const p = btns.find((b) => /播放器|player/i.test(b.textContent || b.getAttribute('aria-label') || ''))
    if (p) { p.click(); return { clicked: (p.textContent || '').trim() } }
    return { clicked: null }
  })
  await sleep(700)
  const sr = await page.evaluate(() => {
    const txt = document.body.innerText
    return {
      playerMode: player => player,
      hasSuperresWord: /画质|超分|增强/.test(txt),
      hasTransportBtns: /播放|暂停/.test(txt)
    }
  }, player.clicked)
  findings.video = { ...player, ...sr }
  await page.screenshot({ path: `${OUT}/video-player.png` })
  console.log('SHOT video-player', JSON.stringify(findings.video))
} catch (e) { findings.video = { error: e.message.split('\n')[0] }; console.error('video probe fail:', findings.video.error) }

// ── AI: agent tab (empty state; fold needs tool output — component tests cover) ──
try {
  await page.locator('.module-rail .rail-item').nth(8).click() // ai
  await sleep(800)
  const agent = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('button,[role=tab]')]
    const t = tabs.find((b) => /^AGENT$/i.test((b.textContent || '').trim()))
    if (t) { t.click(); return { clicked: 'AGENT' } }
    return { clicked: null }
  })
  await sleep(900)
  const agentState = await page.evaluate(() => {
    const txt = document.body.innerText
    return { hasSend: /发送|运行任务|Send/i.test(txt), hasApproval: /审批|信任/i.test(txt), hasWorkspace: /工作区|workspace/i.test(txt) }
  })
  findings.agent = { ...agent, ...agentState }
  await page.screenshot({ path: `${OUT}/ai-agent.png` })
  console.log('SHOT ai-agent', JSON.stringify(findings.agent))
} catch (e) { findings.agent = { error: e.message.split('\n')[0] }; console.error('agent probe fail:', findings.agent.error) }

writeFileSync(`${OUT}/ui-probe.json`, JSON.stringify(findings, null, 2))
console.log('report →', `${OUT}/ui-probe.json`)
process.exit(0)
