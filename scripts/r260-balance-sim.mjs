/**
 * R260 game-balance-sim — 弹幕质变四卡平衡验证（4-skill Phase 4）。
 * 真实引擎(esbuild 打包 survival.ts) → bot 圆周走位 → levelup 自动选卡。
 * 对照:transform 组(质变卡优先) vs baseline 组(跳过质变卡=旧版数值流)。
 * 指标:存活 P25/P50/P75 / 等级 P50 / 分数 P50 / boss 首杀率 / 击杀 P50。
 */
import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmp = mkdtempSync(join(tmpdir(), 'r260-sim-'))
const enginePath = join(tmp, 'survival-engine.mjs')
const r = build({
  entryPoints: ['src/renderer/src/games/survival.ts'],
  bundle: true, format: 'esm', platform: 'node', outfile: enginePath, logLevel: 'silent',
})
if ((await r).errors?.length) process.exit(1)

// Windows 下 ESM 绝对路径导入
const { pathToFileURL } = await import('node:url')
const engine = await import(pathToFileURL(enginePath).href)

const DT = 1 / 60
const CAP_SECONDS = 300
const RUNS = 20
/** 质变卡优先序(eightway 齐射质变 > laser 穿透 > chain 链电 > homing 追踪)。 */
const TRANSFORM_ORDER = ['eightway', 'laser', 'chain', 'homing']
/** 数值主轴(baseline 与 transform 组共用;对齐 swarmAutoPick 估值序)。 */
const NUMERIC_ORDER = ['multishot', 'damage', 'fireRate', 'speed', 'magnet', 'maxHp', 'blade', 'pierce', 'crit', 'regen', 'bulletSpeed', 'thorns']

function pickCard(offers, useTransform) {
  if (useTransform) {
    for (const id of TRANSFORM_ORDER) if (offers.includes(id)) return id
  }
  for (const id of NUMERIC_ORDER) if (offers.includes(id)) return id
  return offers[0]
}

function runOnce(seed, useTransform) {
  const state = engine.initialSurvivalState('wisp', undefined, undefined, 'standard')
  state.rng = engine.mulberry32(seed)
  engine.startSurvival(state)
  const cx = 900 / 2, cy = 520 / 2, radius = 150
  for (let frame = 0; frame < CAP_SECONDS * 60; frame++) {
    if (state.phase === 'levelup') {
      engine.applyUpgrade(state, pickCard(state.offers, useTransform))
      continue
    }
    if (state.phase === 'roulette') {
      engine.openRoulette(state) // 无 spin 直接跳过不了 → 让其开轮盘后用 dissolve? 轮盘需外部驱动,bot 直接关掉
      state.phase = 'running'
      state.pendingSpins = 0
      continue
    }
    if (state.phase !== 'running') break
    // 圆周走位(两组同策略,公平底座)
    const a = (frame / 60) * 1.1
    state.axis.x = Math.cos(a)
    state.axis.y = Math.sin(a)
    engine.tickSurvival(state, DT)
  }
  return {
    survived: state.time,
    score: state.score,
    kills: state.kills,
    level: state.level,
    bossKills: state.bossKills,
    takenTransform: TRANSFORM_ORDER.filter((id) => state.taken[id] > 0),
  }
}

function pct(sorted, p) {
  const i = Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))
  return sorted[i]
}

function summarize(runs) {
  const s = (key) => runs.map((x) => x[key]).sort((a, b) => a - b)
  return {
    存活P25: Math.round(pct(s('survived'), 0.25)),
    存活P50: Math.round(pct(s('survived'), 0.5)),
    存活P75: Math.round(pct(s('survived'), 0.75)),
    等级P50: pct(s('level'), 0.5),
    击杀P50: pct(s('kills'), 0.5),
    分数P50: pct(s('score'), 0.5),
    boss首杀率: `${Math.round((runs.filter((x) => x.bossKills > 0).length / runs.length) * 100)}%`,
    质变卡均取: (runs.reduce((acc, x) => acc + x.takenTransform.length, 0) / runs.length).toFixed(2),
  }
}

const baseline = [], transform = []
for (let i = 0; i < RUNS; i++) {
  baseline.push(runOnce(1000 + i, false))
  transform.push(runOnce(1000 + i, true))
}

const b = summarize(baseline)
const t = summarize(transform)
const fmt = (x) => Object.entries(x).map(([k, v]) => `${k}=${v}`).join('  ')
console.log(`baseline (旧版数值流,${RUNS} 局): ${fmt(b)}`)
console.log(`transform(质变卡优先,${RUNS} 局): ${fmt(t)}`)
console.log(`delta: 存活P50 ${t.存活P50 - b.存活P50 > 0 ? '+' : ''}${Math.round(t.存活P50 - b.存活P50)}s | 等级P50 ${t.等级P50 - b.等级P50 > 0 ? '+' : ''}${t.等级P50 - b.等级P50} | 击杀P50 ${t.击杀P50 - b.击杀P50 > 0 ? '+' : ''}${t.击杀P50 - b.击杀P50} | boss首杀率 ${t.boss首杀率} vs ${b.boss首杀率}`)

// 红线:存活 P50 < 90s = 死亡墙(skill 判定线);质变组不应显著劣于基线
const redline = t.存活P50 < 90 ? 'RED: transform 组存活 P50 < 90s(死亡墙)' : 'PASS: 存活 P50 ≥ 90s'
console.log(redline)

try { rmSync(tmp, { recursive: true, force: true }) } catch { /* temp */ }
// esbuild child cleanup
spawnSync('cmd', ['/c', 'echo ok'], { stdio: 'ignore' })
