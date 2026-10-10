/**
 * R263 #8 性能基准 — 600 敌场景 tick 100 帧计时。
 * 历史对照:playtest 诊断 600 敌 ≈26ms/帧(O(n²) 分离+弹命中)。
 * 目标:<5ms/帧(空间哈希后)。
 */
import { build } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmp = mkdtempSync(join(tmpdir(), 'r263-bench-'))
const enginePath = join(tmp, 'survival-engine.mjs')
await build({
  entryPoints: ['src/renderer/src/games/survival.ts'],
  bundle: true, format: 'esm', platform: 'node', outfile: enginePath, logLevel: 'silent',
})
const { pathToFileURL } = await import('node:url')
const engine = await import(pathToFileURL(enginePath).href)

const DT = 1 / 60
function bench(label, enemyCount) {
  const s = engine.initialSurvivalState()
  engine.startSurvival(s)
  s.spawnTimer = 9999
  s.bossTimer = 9999
  s.taken.eightway = 1 // 质变卡满弹幕(最坏弹数)
  s.stats.multishot = 3
  for (let i = 0; i < enemyCount; i++) {
    engine.spawnEnemyKind(s, 'chaser', 100 + (i % 30) * 55, 80 + Math.floor(i / 30) * 50)
  }
  // 预热 10 帧(JIT)
  for (let i = 0; i < 10; i++) {
    if (s.phase === 'levelup') { engine.applyUpgrade(s, s.offers[0]); continue }
    engine.tickSurvival(s, DT)
  }
  const t0 = process.hrtime.bigint()
  let frames = 0
  for (let i = 0; i < 100; i++) {
    if (s.phase === 'levelup') { engine.applyUpgrade(s, s.offers[0]); continue }
    engine.tickSurvival(s, DT)
    frames++
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / frames
  console.log(`${label}: 敌=${s.enemies.length}(终) 帧=${frames} 平均 ${ms.toFixed(2)}ms/帧`)
  return ms
}

const e600 = bench('600 敌(8 向弹幕+multishot3)', 600)
const e1200 = bench('1200 敌(压力档)', 1200)
console.log(`红线: 600 敌 <5ms/帧 → ${e600 < 5 ? 'PASS' : 'RED'}(${e600.toFixed(2)}ms) | 历史对照 ~26ms`)

try { rmSync(tmp, { recursive: true, force: true }) } catch { /* temp */ }
