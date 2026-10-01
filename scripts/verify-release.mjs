/**
 * R222.1 — 发布门禁编排器（六层，首败即停）。
 *
 * 用法：
 *   node scripts/verify-release.mjs --quick               # L0-L4 快速档
 *   node scripts/verify-release.mjs --full                # 全部六层（含 L5 性能抽档）
 *   node scripts/verify-release.mjs --quick --dist-hook   # dist 前置钩子（out/ 新鲜时跳过 L2）
 *
 * Exit code 语义（T4 设计）：
 *   0   = 全部通过
 *   1   = 产品失败（断言红 / 测试败 / 快照超限 / 冒烟断言败）
 *   2   = 门禁环境失败（CDP 起不来 / 编排器自身崩溃）
 *   124 = 总超时（默认 30 分钟）
 */

import { spawnSync } from 'node:child_process'
import { statSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const FULL = args.includes('--full')
const DIST_HOOK = args.includes('--dist-hook')
const TOTAL_TIMEOUT_MS = 30 * 60 * 1000

/** out/ 新鲜度（镜像 scripts/lib/cdp.mjs 的 assertFreshOut 语义；不可判时按不新鲜处理）。 */
function outIsFresh() {
  try {
    const outMain = statSync(join(process.cwd(), 'out', 'main', 'index.js')).mtimeMs
    const srcDirs = ['src/main', 'src/renderer/src', 'src/engine', 'src/shared', 'src/preload']
    let srcMtime = 0
    for (const d of srcDirs) srcMtime = Math.max(srcMtime, statSync(join(process.cwd(), d)).mtimeMs)
    return outMain > srcMtime
  } catch { return false }
}

const LAYERS = [
  { id: 'L0', name: '静态类型', cmd: ['yarn', 'typecheck'] },
  { id: 'L1', name: '全量单测', cmd: ['yarn', 'test'] },
  { id: 'L2', name: '构建', cmd: ['yarn', 'build'], skip: DIST_HOOK && outIsFresh(), skipNote: 'out 新鲜(dist 链已构建)' },
  { id: 'L3', name: '视觉快照', cmd: ['yarn', 'ui:snapshot'] },
  { id: 'L4a', name: '冒烟·应用面', cmd: ['node', 'scripts/smoke-app.mjs'] },
  { id: 'L4b', name: '冒烟·游戏环', cmd: ['node', 'scripts/smoke-games.mjs'] },
  { id: 'L5', name: '性能抽档', cmd: ['node', 'scripts/r219-perf.mjs'], fullOnly: true },
]

function fmt(ms) { return `${(ms / 1000).toFixed(1)}s` }

const timer = setTimeout(() => { console.error('\n[verify:release] 总超时(30min) — exit 124'); process.exit(124) }, TOTAL_TIMEOUT_MS)
timer.unref?.()

const results = []
const t0 = Date.now()

console.log(`\n=== RGBBox 发布门禁 ${FULL ? '--full' : '--quick'}${DIST_HOOK ? ' --dist-hook' : ''} ===\n`)

for (const layer of LAYERS) {
  if (layer.fullOnly && !FULL) { results.push({ ...layer, status: 'SKIP', note: 'full-only' }); continue }
  if (layer.skip) { results.push({ ...layer, status: 'SKIP', note: layer.skipNote }); console.log(`-  ${layer.id} ${layer.name} SKIP(${layer.skipNote})`); continue }
  const lt = Date.now()
  process.stdout.write(`>  ${layer.id} ${layer.name} ... `)
  const res = spawnSync(layer.cmd[0], layer.cmd.slice(1), {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    cwd: process.cwd(),
    timeout: 20 * 60 * 1000,
  })
  const dur = Date.now() - lt
  const out = `${res.stdout?.toString() ?? ''}\n${res.stderr?.toString() ?? ''}`
  const tail = out.split('\n').filter(Boolean).slice(-6).join('\n     ')
  if (res.status === 0) {
    console.log(`PASS (${fmt(dur)})`)
    results.push({ ...layer, status: 'PASS', dur })
  } else {
    console.log(`FAIL (${fmt(dur)}) exit=${res.status}`)
    if (tail) console.log(`     ${tail}`)
    results.push({ ...layer, status: 'FAIL', dur })
    finish(1)
  }
}

function finish(code) {
  console.log(`\n=== 门禁汇总 ===`)
  for (const r of results) {
    const icon = r.status === 'PASS' ? '[PASS]' : r.status === 'SKIP' ? '[skip]' : '[FAIL]'
    console.log(`  ${icon} ${r.id.padEnd(4)} ${r.name.padEnd(12)} ${r.dur ? `(${fmt(r.dur)})` : ''}${r.note ? ` — ${r.note}` : ''}`)
  }
  console.log(`  总时长 ${fmt(Date.now() - t0)} — exit ${code}\n`)
  process.exit(code)
}

finish(0)
