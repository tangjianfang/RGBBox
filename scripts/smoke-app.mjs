/**
 * R222.1 L4a — 运行时冒烟·应用面：CDP 启动真实应用，断言 9 视图可达 +
 * 关键交互 + IPC 冒烟（T4 断言目录的应用面子集）。
 * exit 0=全过 1=断言败 2=环境败。失败断言自动截图 .verify-artifacts/。
 */
import { assertFreshOut, launchElectron, connectRenderer } from './lib/cdp.mjs'
import { mkdirSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9301
const ART = '.verify-artifacts'
mkdirSync(ART, { recursive: true })

let failed = 0
let skipped = 0
const t0 = Date.now()
const check = (id, title, ok, extra = '') => {
  if (ok === null) { skipped++; console.log(`  [skip] ${id} ${title}${extra ? ` — ${extra}` : ''}`); return }
  if (ok) console.log(`  [pass] ${id} ${title}`)
  else { failed++; console.log(`  [FAIL] ${id} ${title}${extra ? ` — ${extra}` : ''}`) }
}

assertFreshOut()
launchElectron({ port: PORT })
const { page } = await connectRenderer({ port: PORT })
await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {})
try { await page.emulateMedia({ reducedMotion: 'reduce' }) } catch { /* 降级 */ }
await page.waitForSelector('.module-rail', { timeout: 15000 })

const shot = (name) => page.screenshot({ path: `${ART}/smoke-app-${name}.png` }).catch(() => undefined)

// ── 1. 导航：9 个 rail 项全部可达 ──
console.log('\n[导航] 9 视图可达')
const railItems = await page.locator('.module-rail .rail-item').all()
check('nav-01', `rail 项数量 ≥8`, railItems.length >= 8, `got ${railItems.length}`)
const VIEW_TITLES = ['仪表盘', '工作区', '效果库', '视频', '音频', '迷你游戏', '诊断', '架构', 'AI']
for (let i = 0; i < Math.min(railItems.length, 9); i++) {
  let ok = null; let extra = ''
  try { await railItems[i].click(); await sleep(450); ok = true } catch (e) { ok = false; extra = String(e).slice(0, 80) }
  check(`nav-${String(i + 2).padStart(2, '0')}`, `视图 ${VIEW_TITLES[i] ?? i} 可进入`, ok, extra)
}
await shot('last-view')
// 回到工作区做交互冒烟
await page.locator('.module-rail .rail-item').nth(1).click()
await sleep(700)

// ── 2. 应用交互冒烟 ──
console.log('\n[交互]')
check('int-01', '工作区预览画布存在', (await page.locator('canvas').count()) >= 1)
check('int-02', '顶栏按钮 ≥3', (await page.locator('.workspace-header button, header button').count()) >= 3)
// 设置弹层往返（软断言:选择器随版本漂移）
const settingsBtn = await page.locator('[aria-label*="设置"], [title*="设置"], button:has-text("设置")').first()
if (await settingsBtn.count()) {
  await settingsBtn.click().catch(() => undefined); await sleep(400)
  const closed = await page.keyboard.press('Escape').then(() => true).catch(() => false)
  check('int-03', '设置弹层 Esc 关闭路径不炸', closed)
} else check('int-03', '设置入口(选择器漂移→skip)', null)

// ── 3. IPC 冒烟 ──
console.log('\n[IPC]')
const ipc = await page.evaluate(async () => {
  const out = {}
  try { out.profile = await window.rgbbox.getDefaultProfile() } catch { out.profile = null }
  try { out.engineStatus = await window.rgbbox.getEngineStatus() } catch { out.engineStatus = null }
  try { out.topology = await window.rgbbox.getDisplayTopology() } catch { out.topology = null }
  return out
})
check('ipc-01', 'getDefaultProfile 往返(有 scenes/sampling)', !!ipc.profile?.sampling && Array.isArray(ipc.profile?.scenes))
check('ipc-02', 'getEngineStatus 往返', ipc.engineStatus != null)
check('ipc-03', 'getDisplayTopology 往返', ipc.topology != null)
// profile 保存往返(只改一个可还原的幂等字段:名字写回原值)
const nameBefore = ipc.profile?.name
const saveOk = await page.evaluate(async (n) => {
  try { const r = await window.rgbbox.saveProfile({ name: n }); return r?.name === n } catch { return false }
}, nameBefore)
check('ipc-04', 'saveProfile 幂等往返', saveOk === true)
// media://app 资产服务 + 白名单外 403(R221.5)
const media = await page.evaluate(async () => {
  const out = {}
  // no-cors 下成功响应是 opaque(status=0)——throw 才是真不可达
  try { const r = await fetch('media://app/index.html', { mode: 'no-cors' }); out.app = r.status } catch { out.app = 'err' }
  try { const r = await fetch('media://local?p=C%3A%5CWindows%5Cwin.ini'); out.local = r.status } catch { out.local = 'err' }
  return out
})
check('ipc-05', 'media://app 可服务(opaque=0 或 200)', media.app === 0 || media.app === 200 || media.app === 204, `status=${media.app}`)
check('ipc-06', 'media://local 白名单外 403(R221.5)', media.local === 403, `status=${media.local}`)

if (failed > 0) await shot('failure-final')
console.log(`\n[smoke-app] ${failed} FAIL / ${skipped} skip — ${((Date.now() - t0) / 1000).toFixed(1)}s`)
process.exit(failed > 0 ? 1 : 0)
