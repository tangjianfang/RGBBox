#!/usr/bin/env node
/**
 * checkBuildEnv — R311 (REVIEW_2026-10-24 附录06 Top#1/#7/#8) 构建环境层（L-1）。
 *
 * 触发背景：另一台机器 `yarn dist:win` 在 packaging 阶段报
 *   ENOENT rename release\win-unpacked\electron.exe → RGBBox.exe
 * 根因链：electron-builder 26.x 默认**不读** node_modules/electron/dist，而是从
 * 共享缓存 `%LOCALAPPDATA%\electron\Cache\electron-v<ver>-win32-x64.zip` 解压；
 * 缓存 zip 损坏/缺失 → unpack-electron 静默产出缺 electron.exe 的 win-unpacked
 * → rename ENOENT。node_modules dist 缺 exe 是同一缓存/网络故障的共症状
 * （electron npm 包 postinstall 也从该 zip 解压）。该故障家族仓内已 ≥4 次，
 * 此前零防线、零入库知识（PRD R216.6 有 `-c.electronDist` 绕过先例）。
 *
 * 检查项（红即 exit 1 并打印恢复指引）：
 *   1. node_modules/electron/dist 可执行存在（yarn dev 同样依赖它）
 *   2. node_modules/electron/path.txt 无尾换行/非空（spawn ENOENT 的已知成因）
 *   3. win32：electron zip 缓存存在且 >100MB（残缺 zip 的粗粒度完整性检查；
 *      该缓存由 yarn install 的 electron postinstall 落盘——install 成功后缺失
 *      即说明 install 期下载就已失败）
 *
 * 接线：verify-release.mjs LAYERS 首层（predist:win/mac/dir 钩子既有接线，
 * dist 链必经）。也可独立运行：node scripts/lib/checkBuildEnv.mjs
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const failures = []
const notes = []

// ── 1) electron dist 可执行 ────────────────────────────────────────────────
let electronVersion = '(unknown)'
const electronPkgPath = join('node_modules', 'electron', 'package.json')
if (!existsSync(electronPkgPath)) {
  failures.push(`node_modules/electron 缺失 —— 先 yarn install`)
} else {
  electronVersion = JSON.parse(readFileSync(electronPkgPath, 'utf8')).version
  const exe = process.platform === 'win32'
    ? 'electron.exe'
    : process.platform === 'darwin' ? join('Electron.app', 'Contents', 'MacOS', 'Electron') : 'electron'
  const distExe = join('node_modules', 'electron', 'dist', exe)
  if (!existsSync(distExe)) {
    failures.push(`electron dist 可执行缺失: ${distExe}（yarn dev 与打包都会死）`)
  } else {
    notes.push(`electron dist ok (${electronVersion})`)
  }
}

// ── 2) path.txt 无尾换行 ───────────────────────────────────────────────────
const pathTxt = join('node_modules', 'electron', 'path.txt')
if (existsSync(pathTxt)) {
  const txt = readFileSync(pathTxt, 'utf8')
  if (txt === '' || txt !== txt.trim()) {
    failures.push(`node_modules/electron/path.txt 为空/带尾换行: ${JSON.stringify(txt)}（spawn ENOENT 已知成因）`)
  }
} else if (failures.length === 0) {
  failures.push(`node_modules/electron/path.txt 缺失（postinstall 未完整跑过）`)
}

// ── 3) electron zip 缓存完整性（win32 x64 打包通道）────────────────────────
if (process.platform === 'win32') {
  const cacheRoot = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local')
  const cacheZip = join(cacheRoot, 'electron', 'Cache', `electron-v${electronVersion}-win32-x64.zip`)
  if (!existsSync(cacheZip)) {
    failures.push(`electron zip 缓存缺失: ${cacheZip}（electron-builder 的解压来源；yarn install 成功时本应落盘）`)
  } else {
    const mb = statSync(cacheZip).size / 1024 / 1024
    if (mb < 100) {
      failures.push(`electron zip 缓存疑似残缺: ${cacheZip} 仅 ${mb.toFixed(1)}MB（<100MB）`)
    } else {
      notes.push(`electron zip 缓存 ok (${mb.toFixed(0)}MB)`)
    }
  }
}

if (failures.length > 0) {
  console.error('\n[checkBuildEnv] 构建环境层 FAIL (R311):')
  for (const f of failures) console.error(`  ✗ ${f}`)
  console.error(`
恢复指引（按序执行）:
  1) 删除上面报错的缓存 zip（如有）:
       %LOCALAPPDATA%\\electron\\Cache\\electron-v${electronVersion}-win32-x64.zip
  2) 设镜像后重新拉取（仓库 .npmrc 已固化 electron_mirror，未生效时手动设）:
       set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
       node node_modules\\electron\\install.js
  3) 复查: node scripts/lib/checkBuildEnv.mjs
  打包应急绕过（PRD R216.6 先例，仅当缓存无法修复时）:
       electron-builder --win -c.electronDist=node_modules/electron/dist
`)
  process.exit(1)
}
console.log(`[checkBuildEnv] 构建环境层 PASS: ${notes.join('; ')}`)
