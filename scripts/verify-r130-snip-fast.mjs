/**
 * verify-r130-snip-fast — R130 真机验收脚本。
 *
 * 流程：启动打包产物（--remote-debugging-port）→ 等捕获栈/窗口池预热 →
 * SendKeys 触发全局 Alt+A（真实 OS 输入，走 RegisterHotKey）→ CDP 断言
 * snip 窗口 .snip-flash 动画 + 截图 → ESC 取消 → 重复 5 轮 → 解析应用日志
 * 「session start … shown +Xms」取证 ≤500ms 验收口径。
 *
 * 用法：node scripts/verify-r130-snip-fast.mjs [exePath]
 */
import { spawn, execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const EXE = process.argv[2] ?? join(process.cwd(), 'release', 'win-unpacked', 'RGBBox.exe')
const PORT = 9223
const ROUNDS = 5
const SHOT_DIR = join(process.cwd(), 'docs', 'screenshots')

if (!existsSync(EXE)) {
  console.error(`FAIL: exe not found: ${EXE}`)
  process.exit(1)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function sendKeys(keys) {
  execSync(
    `powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${keys}')"`,
    { stdio: 'ignore' },
  )
}

async function httpJson(pathname) {
  const res = await fetch(`http://127.0.0.1:${PORT}${pathname}`)
  return res.json()
}

/** 最小 CDP 客户端（Node ≥21 原生 WebSocket）。 */
function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl)
  let seq = 0
  const pending = new Map()
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg)
      pending.delete(msg.id)
    }
  })
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve)
    ws.addEventListener('error', reject)
  })
  return {
    async call(method, params = {}) {
      await ready
      const id = ++seq
      ws.send(JSON.stringify({ id, method, params }))
      return new Promise((resolve) => pending.set(id, resolve))
    },
    close: () => ws.close(),
  }
}

async function snipTargets() {
  const list = await httpJson('/json/list')
  return list.filter((t) => t.type === 'page' && t.url.includes('snip.html'))
}

/** 预注入闪烁探针：animationstart 命中 .snip-flash 时置 __flashSeen。 */
async function injectFlashProbe(target) {
  const conn = cdp(target.webSocketDebuggerUrl)
  await conn.call('Runtime.evaluate', {
    expression: `(() => {
      if (window.__flashProbeArmed) return 'already';
      window.__flashProbeArmed = true; window.__flashSeen = false;
      document.addEventListener('animationstart', (e) => {
        if (e.target && e.target.classList && e.target.classList.contains('snip-flash')) window.__flashSeen = true;
      });
      return 'armed';
    })()`,
  })
  conn.close()
}

async function readFlashState(target) {
  const conn = cdp(target.webSocketDebuggerUrl)
  const r = await conn.call('Runtime.evaluate', {
    expression: `(() => ({
      flashSeen: window.__flashSeen === true,
      flashNodePresent: !!document.querySelector('.snip-flash'),
      maskPresent: !!document.querySelector('.snip-mask'),
      canvasPx: (() => { const c = document.querySelector('.snip-canvas'); return c ? c.width + 'x' + c.height : null })(),
    }))()`,
    returnByValue: true,
  })
  conn.close()
  return r?.result?.value ?? null
}

async function screenshot(target, file) {
  const conn = cdp(target.webSocketDebuggerUrl)
  const r = await conn.call('Page.captureScreenshot', { format: 'png' })
  conn.close()
  if (r?.result?.data) {
    writeFileSync(file, Buffer.from(r.result.data, 'base64'))
    return true
  }
  return false
}

function findAppLog() {
  const appData = join(homedir(), 'AppData', 'Roaming')
  const candidates = []
  const tryDir = (d) => {
    const f = join(d, 'logs', 'rgbbox.log')
    if (existsSync(f)) candidates.push(f)
  }
  tryDir(join(appData, 'rgbbox'))
  tryDir(join(appData, 'RGBBox'))
  tryDir(join(appData, 'Electron'))
  try {
    for (const name of readdirSync(appData)) {
      if (/rgb/i.test(name)) tryDir(join(appData, name))
    }
  } catch { /* ignore */ }
  candidates.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  return candidates[0]
}

// ── main ───────────────────────────────────────────────────────────────
console.log(`exe: ${EXE}`)
const logBefore = findAppLog()
const logSizeBefore = logBefore ? statSync(logBefore).size : 0
console.log(`app log: ${logBefore ?? '(none yet)'} @ ${logSizeBefore}`)

const app = spawn(EXE, [`--remote-debugging-port=${PORT}`], { stdio: 'ignore', detached: false })
process.on('exit', () => { try { app.kill() } catch { /* */ } })

// 等 CDP 端口起来
let ok = false
for (let i = 0; i < 40; i++) {
  await sleep(500)
  try { await httpJson('/json/version'); ok = true; break } catch { /* retry */ }
}
if (!ok) { console.error('FAIL: CDP endpoint never came up'); app.kill(); process.exit(1) }
console.log('CDP up. waiting 6.5s for capture-stack warm + window pool…')
await sleep(6500)

let pooled = await snipTargets()
console.log(`pooled hidden snip windows: ${pooled.length}`)
for (const t of pooled) await injectFlashProbe(t)

const flashResults = []
for (let round = 1; round <= ROUNDS; round++) {
  sendKeys('%a')                       // Alt+A —— 全局热键（真实 OS 输入）
  await sleep(150)                     // 闪第二脉冲窗口内抢截图
  const targets = await snipTargets()
  const shown = targets.find((t) => !pooled.some((p) => p.id === t.id)) ?? targets[0]
  if (round === 1 && shown) {
    const got = await screenshot(shown, join(SHOT_DIR, 'r130-flash-mid.png'))
    console.log(`round ${round}: mid-flash screenshot ${got ? 'saved' : 'FAILED'}`)
  }
  await sleep(1100)
  const state = shown ? await readFlashState(shown) : null
  flashResults.push(state)
  console.log(`round ${round}: ${JSON.stringify(state)}`)
  sendKeys('{ESC}')                    // 全局 Esc 取消会话
  await sleep(1200)                    // 窗口销毁 + 池重建（200ms + 加载）
  pooled = await snipTargets()
  for (const t of pooled) await injectFlashProbe(t)
}

// 进程/内存快照
try {
  const out = execSync('powershell -NoProfile -Command "Get-Process RGBBox -ErrorAction SilentlyContinue | Select-Object Id,@{n=\'MB\';e={[math]::Round($_.WorkingSet64/1MB,1)}} | ConvertTo-Json -Compress"').toString()
  console.log(`processes: ${out.trim()}`)
} catch { /* ignore */ }

app.kill()
await sleep(1200)

// 日志取证
const logAfter = findAppLog()
if (!logAfter) { console.error('FAIL: app log not found'); process.exit(1) }
const text = readFileSync(logAfter, 'utf8')
const tail = logSizeBefore > 0 ? text.slice(Math.max(0, logAfter ? text.length - (statSync(logAfter).size - logSizeBefore) * 3 : 0)) : text
const lines = text.split(/\r?\n/).filter((l) => l.includes('session start') || l.includes('pool rebuilt') || l.includes('capture stack warmed') || l.includes('session cancelled'))
console.log('--- relevant log lines (this run) ---')
const sessionLines = []
let recording = false
for (const l of text.split(/\r?\n/).slice(-400)) {
  if (l.includes('capture stack warmed')) recording = true
  if (recording && (l.includes('session start') || l.includes('pool rebuilt') || l.includes('warmed') || l.includes('cancelled'))) console.log(l)
  if (l.includes('session start')) sessionLines.push(l)
}
const shownTimes = sessionLines.slice(-ROUNDS).map((l) => {
  const m = l.match(/shown \+(\d+)ms/)
  return m ? Number(m[1]) : null
}).filter((v) => v !== null)
console.log('--- verdict ---')
console.log(`shown times (hotkey → frozen frame visible): ${JSON.stringify(shownTimes)} ms`)
const maxShown = shownTimes.length ? Math.max(...shownTimes) : null
const flashOk = flashResults.filter((r) => r && r.flashSeen).length
console.log(`flash fired in ${flashOk}/${ROUNDS} rounds`)
if (maxShown !== null && maxShown <= 500 && flashOk === ROUNDS) {
  console.log(`PASS: max shown ${maxShown}ms ≤ 500ms; flash ×2 fired every round`)
} else {
  console.log(`FAIL: max shown ${maxShown}ms; flash ${flashOk}/${ROUNDS}`)
  process.exit(1)
}
