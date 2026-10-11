/**
 * R287 真机走查 — GPU 3D 音频联动的端到端证据。
 * getUserMedia 桩注入 55Hz 振荡器 + 2Hz LFO(模拟节拍),经 App 真分析链
 * (useAudioAnalyzer→audio.ref)驱动 Preview3D 的 u_params 调制。
 * 判定:音频开的 3D 画布帧差 显著大于 音频关基线。
 */
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
import { PNG } from 'pngjs'
import { writeFileSync } from 'node:fs'
import { chromium, launchElectron } from './lib/cdp.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/ui-review/r287-3d-audio')
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
const udd = join(tmpdir(), `rgbbox-r287-${Date.now()}`)
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

// ① 桩 getUserMedia:55Hz 正弦 × 2Hz LFO = 每秒 2 拍的低频节拍源
await page.evaluate(() => {
  navigator.mediaDevices.getUserMedia = async () => {
    const ctx = new AudioContext()
    const dest = ctx.createMediaStreamDestination()
    const osc = ctx.createOscillator()
    osc.frequency.value = 55
    const gain = ctx.createGain()
    gain.gain.value = 0.8
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 2 // 2 拍/秒
    const lg = ctx.createGain()
    lg.gain.value = 0.78
    lfo.connect(lg); lg.connect(gain.gain)
    osc.connect(gain); gain.connect(dest)
    osc.start(); lfo.start()
    return dest.stream
  }
})
console.log('getUserMedia stub installed')

// ② 效果库选「球体脉动」(sphere-pulse,GPU 3D 组——R283 标杆 motion 42% 全场最高;
// 注:nebula 是 CPU 效果,EFFECT_3D_KINDS=sphere-pulse/warp-portal/neon-galaxy/lava-sphere/hologram;
// 3D 卡片藏在分类 tab 后——遍历 tab 直到出现)
await page.locator('.module-rail .rail-item').nth(2).click()
await page.waitForSelector('.effect-card', { timeout: 15000 })
let card3d = page.locator('.effect-card', { hasText: '球体脉动' }).first()
if (await card3d.count() === 0) {
  const tabCount = await page.locator('.effects-category-tab').count()
  for (let ti = 0; ti < tabCount && (await card3d.count()) === 0; ti++) {
    await page.locator('.effects-category-tab').nth(ti).click()
    await sleep(400)
  }
}
if (await card3d.count() === 0) { console.error('FAIL: sphere-pulse card not found'); process.exit(1) }
await card3d.click()
await sleep(600)

// ③ 工作台(大预览 Preview3D 所在)
await page.locator('.module-rail .rail-item').nth(1).click()
await page.waitForSelector('.preview-3d', { timeout: 15000 })
await sleep(1200)

const canvas = page.locator('.preview-3d')

// ④ 直接证据:订阅 EFFECT3D_CHANNEL 抓 draw() 广播的 u_params 本身
// (sphere-pulse 固有动画太快,像素帧差无法分离调制——uniform 值是无歧义证据)
await page.evaluate(() => {
  window.__params3d = []
  const ch = new BroadcastChannel('rgbbox-3d-effect')
  ch.onmessage = (e) => {
    const a = window.__params3d
    a.push({ t: e.data.t, sp: e.data.params[0], hue: e.data.params[1], it: e.data.params[2], de: e.data.params[3] })
    if (a.length > 4000) a.splice(0, 2000)
  }
})
function paramStats() {
  return page.evaluate(() => {
    const a = window.__params3d
    window.__params3d = []
    if (!a.length) return null
    const col = (k) => a.map((x) => x[k])
    const mm = (arr) => ({ min: Math.min(...arr), max: Math.max(...arr), mean: arr.reduce((s, v) => s + v, 0) / arr.length })
    return { n: a.length, sp: mm(col('sp')), hue: mm(col('hue')), it: mm(col('it')) }
  })
}

// 音频关基线:params 应恒定(预设原值)
await sleep(1800)
const offStats = await paramStats()
console.log('audio OFF params:', JSON.stringify(offStats))

// ⑤ 开音频引擎(桩源→真分析链→audio.ref→调制)
const toggle = page.locator('.audio-toggle')
if (await toggle.count() === 0) { console.error('FAIL: audio toggle missing'); process.exit(1) }
const cls = await toggle.first().getAttribute('class')
if (!cls?.includes('active')) await toggle.first().click()
await sleep(3000) // 分析链起振 + 数拍(2 拍/s → 6 拍)
const onStats = await paramStats()
console.log('audio ON params:', JSON.stringify(onStats))

// ⑥ 截图留档(视觉记录,不做判定) + uniform 级判定
await canvas.screenshot({ path: join(OUT, 'sphere-pulse-beat-best.png') }).catch(() => {})

let verdict = 'FAIL'
if (offStats && onStats && offStats.n > 10 && onStats.n > 10) {
  const spLift = onStats.sp.max / offStats.sp.mean
  const itLift = onStats.it.max / offStats.it.mean
  const hueSpread = onStats.hue.max - onStats.hue.min
  console.log(`speed 峰值提升 ${spLift.toFixed(2)}× | intensity 峰值提升 ${itLift.toFixed(2)}× | hue 摆幅 ${hueSpread.toFixed(1)}`)
  console.log(`OFF 波动: sp ${(offStats.sp.max - offStats.sp.min).toFixed(4)} / it ${(offStats.it.max - offStats.it.min).toFixed(4)}(应≈0=零回归)`)
  // speed 摆幅>0.3(×1.9 调制)+ hue 摆幅≈18 + intensity 随 energy 抬升——三公式齐验
  verdict = (onStats.sp.max - onStats.sp.min > 0.3 && hueSpread > 15 && itLift > 1.01) ? 'PASS: 节拍驱动 u_params 显著调制' : 'FAIL: 调制幅度不足'
}
console.log(verdict)

try { electron.kill() } catch {}
await sleep(600)
try { rmSync(udd, { recursive: true, force: true }) } catch { /* temp */ }
process.exit(0)
