/**
 * R295 真机验收 — 录制 webm 带 Duration 元数据(可拖动进度条的根因修复)。
 * 链路:视频工作站→窗口源直播→录制 4s→停止→拦 <a>.click 读下载 Blob
 * →EBML 解析 Duration 元素(0x4489, float ns)→断言非空且≈实际时长。
 */
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { chromium, launchElectron } from './lib/cdp.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/ui-review/r295-webm-duration')
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
const udd = join(tmpdir(), `rgbbox-r295-${Date.now()}`)
mkdirSync(udd, { recursive: true })
const PORT = 9410 + (Date.now() % 80)
const electron = launchElectron({ port: PORT, userDataDir: udd, entry: join(ROOT, 'out/main/index.js') })
process.on('exit', () => { try { electron.kill() } catch {} })

let page = null
for (let i = 0; i < 40 && !page; i++) {
  try {
    const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`)
    page = browser.contexts()[0].pages().find((p) => p.url().includes('index.html'))
    if (!page) { await sleep(500); page = null }
  } catch { await sleep(500) }
}
if (!page) { console.error('app never came up'); process.exit(1) }
await page.waitForSelector('.module-rail', { timeout: 15000 })
await sleep(800)

// 一个可录的窗口
const notepad = spawn('notepad.exe', [], { detached: false, stdio: 'ignore' })
await sleep(1800)

// ① 拦截录制下载:记录 Blob 的 base64
await page.evaluate(() => {
  window.__recB64 = null
  const origClick = HTMLAnchorElement.prototype.click
  HTMLAnchorElement.prototype.click = function (...args) {
    if (this.download && String(this.download).startsWith('rgbbox-recording')) {
      fetch(this.href).then((r) => r.blob()).then(async (b) => {
        const buf = new Uint8Array(await b.arrayBuffer())
        let bin = ''
        const CH = 0x8000
        for (let i = 0; i < buf.length; i += CH) bin += String.fromCharCode.apply(null, buf.subarray(i, i + CH))
        window.__recB64 = btoa(bin)
      }).catch(() => { window.__recB64 = '' })
    }
    return origClick.apply(this, args)
  }
})

// ② 视频工作站 → 屏幕/窗口模式 → 选记事本直播
await page.locator('.module-rail .rail-item').nth(3).click()
await sleep(1200)
const screenChip = page.locator('button', { hasText: '屏幕' }).first()
if (await screenChip.count() > 0) await screenChip.click()
await sleep(1500)
const windowChip = page.locator('.video-source-filter button', { hasText: '窗口' }).first()
if (await windowChip.count() > 0) await windowChip.click()
await page.waitForSelector('.video-source-card', { timeout: 15000 })
await sleep(800)
let card = null
for (let i = 0; i < await page.locator('.video-source-card').count(); i++) {
  const txt = (await page.locator('.video-source-card').nth(i).textContent()) ?? ''
  if (txt.includes('记事本') || txt.toLowerCase().includes('notepad')) { card = page.locator('.video-source-card').nth(i); break }
}
if (!card) { console.error('FAIL: notepad 窗口未列出'); try { notepad.kill() } catch {}; process.exit(1) }
await card.locator('.video-source-pick').click()
await sleep(2500) // 直播起流

// ③ 录制 4s → 停止
const recBtn = page.locator('button', { hasText: '录制' }).first()
if (await recBtn.count() === 0) { console.error('FAIL: 录制按钮未找到'); try { notepad.kill() } catch {}; process.exit(1) }
await recBtn.click()
console.log('录制中…')
await sleep(4000)
const stopBtn = page.locator('.video-btn-rec', { hasText: '停止' }).first()
if (await stopBtn.count() === 0) { console.error('FAIL: 停止按钮未找到'); try { notepad.kill() } catch {}; process.exit(1) }
await stopBtn.click()
await sleep(2500) // onstop → fixWebmDuration → 下载被拦

// ④ 读 Blob 字节 → EBML Duration 解析
const b64 = await page.evaluate(() => window.__recB64)
if (!b64) { console.error('FAIL: 未拦到录制 Blob'); try { notepad.kill() } catch {}; process.exit(1) }
const buf = Buffer.from(b64, 'base64')
writeFileSync(join(OUT, 'recording.webm'), buf)
console.log('webm 大小:', (buf.length / 1024).toFixed(0) + 'KB')

// EBML: Info 内 Duration(0x4489, double, 单位=TimecodeScale)与
// TimecodeScale(0x2AD7B1, uint, ns/单位——fix 库写 1e6=1ms)。
// 真实时长 = Duration 值 × TimecodeScale。
function parseDuration(bytes) {
  let scale = 1e6, dur = null
  for (let i = 0; i < bytes.length - 12; i++) {
    if (bytes[i] === 0x2a && bytes[i + 1] === 0xd7 && bytes[i + 2] === 0xb1) {
      const size = bytes[i + 3]
      if (size >= 1 && size <= 4) {
        let v = 0
        for (let k = 0; k < size; k++) v = v * 256 + bytes[i + 4 + k]
        scale = v
      }
    }
    if (bytes[i] === 0x44 && bytes[i + 1] === 0x89 && bytes[i + 2] === 0x88) {
      const dv = new DataView(bytes.buffer, bytes.byteOffset + i + 3, 8)
      const v = dv.getFloat64(0)
      if (Number.isFinite(v) && v >= 0 && v < 1e12) dur = v
    }
  }
  return dur === null ? null : { value: dur, scale, secs: (dur * scale) / 1e9 }
}
const d = parseDuration(buf)
if (d === null || d.value <= 0) { console.error('FAIL: Duration 元素缺失或为 0(还是流式无元数据)'); try { notepad.kill() } catch {}; process.exit(1) }
console.log(`Duration 值=${d.value} × TimecodeScale=${d.scale}ns = ${d.secs.toFixed(2)}s (实际录制 ≈4s)`)
console.log(d.secs >= 3 && d.secs <= 8 ? 'PASS: webm 带真实时长元数据,播放器可拖动' : 'FAIL: 时长异常')

try { notepad.kill() } catch {}
try { electron.kill() } catch {}
await sleep(600)
try { rmSync(udd, { recursive: true, force: true }) } catch { /* temp */ }
process.exit(0)
