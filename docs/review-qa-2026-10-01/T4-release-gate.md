# T4 — 发布门禁 v1 设计（verify:release 全功能验证体系）

> 评审轮：应用面多角色评审 · 发布工程/自动化测试架构师
> 仓库：C:\tjf\github\RGBBox（branch feat/app-review-fixes，2026-10-01）
> 定位：**可执行门禁**——不是又一轮人工 checklist，而是 `yarn verify:release` 一条命令在发布前验证所有功能层。
> 约束：不引入新依赖（复用 playwright-core + 自研 cdp.mjs 驱动）；单人+AI 维护；本地门禁总预算 ≤15 分钟；按 CLAUDE.md 需先在 PRD-0002 追加 R-N 条款（下文记作 **R-REL-GATE**，编号由维护者定）才可动代码。

---

## 0. 摘要

现状：发布链 `dist:win = npm version patch → dist-clean → build → electron-builder`（package.json:21），CI 仅 typecheck（.github/workflows/ci.yml:14-23）。**门禁资产其实已齐**——typecheck/vitest、ui:snapshot 9 视图 pixelmatch 硬门禁、--perf-selftest 5 场景自测、r219-verify/diag-input 的 CDP 游戏 E2E 模式——但它们是散件，没有一个总入口，且全部缺「运行时功能冒烟」这一层。R221.7 键盘回归在「全量绿 + 快照 9/9 绿」下逃逸，证明单测+hub 快照够不着「游戏内输入接线」，缺的正是这层。

本方案：**L0 静态 → L1 单测 → L2 构建 → L3 快照 → L4 运行时功能冒烟（新）→ L5 性能** 六层，`scripts/verify-release.mjs` 顺序编排、层间首败即停、汇总表 + 语义化 exit code；L4 拆成 `smoke-app.mjs`（9 视图 + 应用交互 + IPC，~30 断言）与 `smoke-games.mjs`（4 游戏核心环，~17 断言，从 r219-verify/diag-input 提炼），合计 **47 条断言**（§4 目录）；dist 集成用 `predist:win` 前置钩子（门禁在 `npm version patch` **之前**失败，天然消除版本号回滚问题）；快照基线治理用 `BASELINE-LOG.md` + pre-commit 提示脚本绑定 PRD R-N。v1 工作量 ≈2 人日，快速档估算 7-10 分钟、完整档 13-15 分钟（估算值，见 §9）。

---

## 1. 分层门禁模型（L0-L5）

设计原则：**每层只回答一个问题**；下层通过才跑上层（fail-fast 省时间）；任何一层的失败输出必须能直接指到「哪个文件/哪条断言/哪个数字超了」。

| 层 | 回答的问题 | 命令（新增/复用） | 通过判据 | 失败输出 | 预计时长（估算） |
|---|---|---|---|---|---|
| **L0 静态** | 类型还编译吗 | `yarn typecheck`（package.json:15，复用） | node+web 两套 tsc 退出码 0 | tsc 原文（file:line: error TS…） | ~40-90s |
| **L1 单测** | 纯逻辑层回归了吗 | `yarn test`（vitest run，复用；155 文件/1493 用例） | 退出码 0；0 failed | vitest 摘要（failed 用例名 + diff） | ~70-120s |
| **L2 构建** | 还打得出生产包吗 | `yarn build`（= typecheck + electron-vite build，package.json:13，复用） | 退出码 0 且 `out/` 生成；**若 `assertFreshOut()`（scripts/lib/cdp.mjs:74-100）判 out/ 已新于源码则跳过**，直接复用上次产物 | electron-vite/tsc 报错原文 | 全量 ~2-4min / 已新则 ~0s |
| **L3 快照** | UI 结构/视觉回归了吗 | `yarn ui:snapshot`（scripts/ui-snapshot.mjs --compare，复用） | 9 视图全捕获 + pixelmatch diff-rate ≤ 0.1%（ui-snapshot.mjs:32-34,142-186） | 每视图 diff-rate 表 + `docs/ui-baseline/diff/<view>.png` | ~1-2min |
| **L4 运行时功能冒烟（新）** | 功能在**真实运行的应用里**还通吗（视图可达/交互/游戏环/IPC） | `node scripts/smoke-app.mjs` + `node scripts/smoke-games.mjs`（新，复用 cdp.mjs 驱动） | 47 条断言（§4）全部 pass（软断言超时计 skip 不计 fail，但汇总表显式列出） | 断言清单表：`FAIL <id> <title> <got> != <want>` + 当场 screenshot 落 `.verify-artifacts/` | quick 档 ~3min / full 档 ~5min |
| **L5 性能** | 性能档位没塌吧 | `node scripts/perf-gate.mjs`（新）：① 跑 `electron . --perf-selftest --user-data-dir=<temp>`（src/main/perfSelfTest.ts）解析 verdicts；② r219-perf 模式帧分布抽档 | perf-selftest verdicts 无 "FAIL"（perfSelfTest.ts:231-264 三条判定）；running p50 ≤17ms 且 over32 帧占比 <5%（阈值首版为 advisory，从实测基线定，见 §9 未验证项） | verdict 原文（含 CPU/fps 数字）+ rAF 分布 JSON | ~2-4min |

**层间依赖与首败即停**：L2-L4 都内置 `assertFreshOut()`（cdp.mjs:74-100，stale build 直接 exit 1——T1 教训），所以编排器只在 L0/L1 之后补跑一次 L2 即可，后续层不再重复构建。L4 两个子脚本各自启动一次真实 Electron（隔离 `--user-data-dir`，不碰开发者真实 profile/localStorage——renderer 的 localStorage 与 profileStore 都落在 userData 下）；两次启动之间必须等真退出（单实例锁，probe-runtime.mjs:74-82 的 exitCode 轮询模式，≤15s）。

**快速档 vs 完整档**：
- `--quick`（默认给 dist 钩子用）：L0→L1→L2→L3→L4。L4 游戏环只做「hub→ready→开局→输入响应」（每游戏 ~30-40s），survival 加 settle+best 断言（有 `__rgbboxGames.spawnBoss()` 快速死亡通道，MiniGamesView.tsx:556）；tetris/slash 的自然结算在 quick 档降级为软断言或跳过。
- `--full`（手动 `yarn verify:release`）：全 47 断言 + L5。估算 13-15min。

---

## 2. `yarn verify:release` 总入口与编排器骨架

### 2.1 package.json scripts 增量（经 R-REL-GATE 批准后修改——CLAUDE.md 禁止顺手改 scripts）

```jsonc
"verify:release": "node scripts/verify-release.mjs --full",
"verify:quick": "node scripts/verify-release.mjs --quick",
"smoke:app": "node scripts/smoke-app.mjs",
"smoke:games": "node scripts/smoke-games.mjs",
"perf:gate": "node scripts/perf-gate.mjs",
// dist 集成（§5）：
"predist:win": "node scripts/verify-release.mjs --quick --dist-hook",
"predist:mac": "node scripts/verify-release.mjs --quick --dist-hook",
"predist:dir": "node scripts/verify-release.mjs --quick --dist-hook"
```

### 2.2 `scripts/verify-release.mjs` 骨架（完整伪代码，可直接实施）

```js
#!/usr/bin/env node
/**
 * R-REL-GATE: 发布门禁编排器。
 *   node scripts/verify-release.mjs --quick [--dist-hook]
 *   node scripts/verify-release.mjs --full
 * 层间首败即停;层内(smoke)跑完全部断言再判。产物: .verify-artifacts/verify-release-latest.json
 * exit code: 0=全过  1=某层产品失败  2=门禁自身/环境故障(CDP不通、stale build、spawn失败)
 *            3=用法错误  124=层超时
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const argv = process.argv.slice(2)
const mode = argv.includes('--full') ? 'full' : argv.includes('--quick') ? 'quick' : null
if (!mode) { console.error('usage: verify-release.mjs --quick|--full'); process.exit(3) }
const DIST_HOOK = argv.includes('--dist-hook') // dist 钩子里跑: 结论行带 dist 提示,失败时明确「版本号未 bump」

// ── 层注册表:唯一需要维护的表 ──────────────────────────────────────────
const LAYERS = [
  { id: 'L0', title: 'typecheck',  cmd: ['yarn', 'typecheck'],             timeoutMs: 5 * 60_000 },
  { id: 'L1', title: 'unit tests', cmd: ['yarn', 'test'],                  timeoutMs: 10 * 60_000 },
  { id: 'L2', title: 'build',      cmd: ['yarn', 'build'],                 timeoutMs: 10 * 60_000,
    skip: () => freshOutAlready(), // 复用 cdp.mjs 的 newestMtime/oldestMtime 逻辑(以 {quiet:true} 调
                                   // assertFreshOut 的 try 变体;新鲜则跳过 build,打印 skip 理由)
  },
  { id: 'L3', title: 'ui snapshots', cmd: ['yarn', 'ui:snapshot'],         timeoutMs: 5 * 60_000 },
  { id: 'L4a', title: 'smoke: app',  cmd: ['node', 'scripts/smoke-app.mjs', ...(mode==='full'?['--full']:[])],
    timeoutMs: 6 * 60_000 },
  { id: 'L4b', title: 'smoke: games', cmd: ['node', 'scripts/smoke-games.mjs', ...(mode==='full'?['--full']:[])],
    timeoutMs: 6 * 60_000 },
  { id: 'L5', title: 'perf gate',  cmd: ['node', 'scripts/perf-gate.mjs'], timeoutMs: 6 * 60_000,
    only: 'full' },
]

// ── 单层执行:流式转发输出(操作者要看进度),同时 tee 到工件 ─────────────
async function runLayer (layer) {
  const t0 = Date.now()
  console.log(`\n━━ ${layer.id} ${layer.title} ━━ ${layer.cmd.join(' ')}`)
  return await new Promise((resolve) => {
    const child = spawn(layer.cmd[0], layer.cmd.slice(1), { stdio: ['ignore', 'pipe', 'pipe'], shell: true })
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL') }, layer.timeoutMs)
    const log = []
    const onChunk = (b) => { const s = b.toString(); log.push(s); process.stdout.write(s) }
    child.stdout.on('data', onChunk); child.stderr.on('data', onChunk)
    child.on('error', (err) => { clearTimeout(timer); resolve({ ...layer, status: 'env-error', code: 2, ms: Date.now()-t0, log, err: err.message }) })
    child.on('close', (code) => {
      clearTimeout(timer)
      const status = timedOut ? 'timeout' : (code === 0 ? 'pass' : (code === 2 ? 'env-error' : 'fail'))
      resolve({ ...layer, status, code: timedOut ? 124 : code, ms: Date.now() - t0, log: log.join('') })
    })
  })
}

// ── 主循环:顺序 + 首败即停 ─────────────────────────────────────────────
mkdirSync('.verify-artifacts', { recursive: true })   // .gitignore 追加一行
const results = []
let exitCode = 0
for (const layer of LAYERS) {
  if (layer.only && mode !== layer.only) { results.push({ ...layer, status: 'skipped', ms: 0 }); continue }
  if (layer.skip && (await layer.skip())) { results.push({ ...layer, status: 'skipped', ms: 0 }); continue }
  const r = await runLayer(layer)
  results.push(r)
  if (r.status !== 'pass') { exitCode = (r.status === 'fail') ? 1 : (r.status === 'timeout' ? 124 : 2); break }
}

// ── 汇总表(最后一条结论行给人也给 CI 看) ──────────────────────────────
const fmt = (ms) => `${Math.round(ms/1000)}s`
console.log('\n╔════════ verify:release 汇总 ════════')
for (const r of results) console.log(`║ ${r.id.padEnd(4)} ${(r.title).padEnd(14)} ${(r.status).toUpperCase().padEnd(10)} ${fmt(r.ms)}`)
const totalMs = results.reduce((s, r) => s + r.ms, 0)
console.log(`║ 总计 ${fmt(totalMs)} (mode=${mode})`)
if (exitCode === 0) console.log('║ GATE PASS — 可以发布')
else console.log(`║ GATE FAIL(${exitCode}) — ${DIST_HOOK ? 'dist 已中止,版本号【未】bump,无需回滚' : '修复后重跑'}`)
console.log('╚══════════════════════════════════════')
writeFileSync('.verify-artifacts/verify-release-latest.json',
  JSON.stringify({ date: new Date().toISOString(), mode, results: results.map(({id,title,status,code,ms}) => ({id,title,status,code,ms})) }, null, 2))
process.exit(exitCode)
```

要点：
- **exit code 三分法**是刻意设计：`1`（产品坏了，修产品）/`2`（门禁自身坏了，如 CDP 不通、stale build——ui-snapshot/smoke 里 assertFreshOut 与连接失败已按此约定 exit 2，实现时把 smoke 脚本的「环境异常」与「断言失败」分开抛）/`124`（超时）。dist 钩子只认 0。
- `shell: true` 是 Windows 上 `yarn`/`node` 解析所需（.cmd shim）；产物目录 `.verify-artifacts/` 加入 .gitignore（与 docs/ui-baseline/current 同一先例，.gitignore:19-20）。
- L2 的 skip 是可选优化：直接 import `scripts/lib/cdp.mjs` 的 newestMtime 逻辑做 dry-run 判定（把 assertFreshOut 重构出一个不退出的 `checkFreshOut()` 返回 boolean——对 cdp.mjs 是加法不改行为，属 R-REL-GATE 范围内）。

### 2.3 `scripts/smoke-app.mjs` / `smoke-games.mjs` 公共骨架

两个脚本共享同一个 assertion harness（放 `scripts/lib/smoke-harness.mjs`，~60 行）：

```js
import { assertFreshOut, connectRenderer } from './cdp.mjs'
import { spawn } from 'node:child_process'

// ── 启动:隔离 user-data-dir 的真实 Electron(复用 cdp.mjs 模式) ──
assertFreshOut()
const TMPUserData = mkdtempSync(join(tmpdir(), 'rgbbox-smoke-'))
const PORT = 9301 // ui-snapshot 9281 / probe 9290s / r219 9295-9298 已占用,门禁用 93xx 段
const electron = spawn('node_modules/electron/dist/electron.exe',
  [`--remote-debugging-port=${PORT}`, '--user-data-dir=' + TMPUserData, 'out/main/index.js'], { stdio: 'ignore' })
process.on('exit', () => { try { electron.kill() } catch {} })
// (v1.5: 把 args 参数化进 cdp.mjs launchElectron({ port, args }) —— 向后兼容的加法;
//  v1 先按 probe-runtime.mjs:40-42 直接 spawn,少动共享库)
const { page } = await connectRenderer({ port: PORT })

// ── 断言登记:每条 { id, title, run },失败不中断(收集齐再判,好定位) ──
const A = []
const reg = (id, title, run) => A.push({ id, title, run })
const ok = (id, cond, got, want) => { /* 记 pass/fail + got/want + 失败时 page.screenshot 到 .verify-artifacts/fails/ */ }

// ── 统一收尾 ──
//   ① console/pageerror 卫生计数器挂全程(diag-input.mjs:11-15 模式)
//   ② 断言汇总表 → exit(fails===0 ? 0 : 1);环境级异常(选择器都找不到/CDP 断) → exit(2)
```

`smoke-games.mjs` 的核心是一张**游戏映射表**，驱动一个共享的「核心环」runner——这正是从 r219-verify/diag-input 提炼的部分：

```js
// 每游戏: 怎么进卡、怎么开局、怎么给输入、怎么读状态、怎么快速死
const GAMES = [
  {
    key: 'survival', bestKey: 'rgbbox:gamesBest:survival',           // MiniGamesView.tsx:146-151
    card: /蜂群|Swarm/i,                                             // r219-verify.mjs:79-82
    start: '[data-action="ready-start"]',                            // r219-verify.mjs:100
    input: { hold: 'a', ms: 1600 },                                  // r219-verify.mjs:103-105
    probe: () => window.__rgbboxVision.probe(),                      // MiniGamesView.tsx:585-605
    assertMoving: (before, after) => Math.abs(after.player.x - before.player.x) > 0
      && after.shipVp.x > 0 && after.shipVp.x < after.vp.w           // r219-verify.mjs:108-116
      && Math.abs(after.camera.x - after.vp.w / 2) < 1,              // r219-verify.mjs:113 cameraFixed
    kill: async (page) => { for (let i = 0; i < 6; i++) { await page.evaluate(() => window.__rgbboxGames.spawnBoss()); await sleep(1500) } }, // MiniGamesView.tsx:556
  },
  { key: 'td',      bestKey: 'rgbbox:gamesBest:balloon', card: /塔防|TD/i,
    start: '[data-action="ready-start"]', input: { press: 'Escape', then: '[data-action="fs-resume"]' }, /* r219-verify.mjs:180-184 */
    probe: null /* TD 无 vision probe:断言走 DOM([data-field="td-ctl"] 波次文本) + canvasGeom */ },
  { key: 'tetris',  bestKey: 'rgbbox:gamesBest:tetris', card: /方块|Tetris/i,
    start: '[data-action="ready-start"]', input: { hold: 'ArrowLeft', ms: 500 },
    probe: null /* 输入生效断言走 regionSig 双帧对比(r219-verify.mjs:61-73) */ },
  { key: 'slash',   bestKey: 'rgbbox:gamesBest:slash', card: /斩|Slash/i,
    start: '[data-action="ready-start"]', input: { press: 'j' }, probe: null },
]
// runner(GAMES[i]) = ①点卡→ready ②开局→running ③键驻留断言(diag-input.mjs:54-58:
//   keyboard.down 后 probe().keys 必须含该键——R221.7 逃逸的那一层) ④移动/画面变化
//   ⑤quick: survival 走 kill→lost→recap+best;full: 全部 settle(限时软断言)
```

---

## 3. （并入 §1 表格与 §2 骨架）

---

## 4. L4 冒烟断言目录（47 条）

> 格式：**ID · 视图/对象 · 操作 · 期望** · 来源（可直接复刻的脚本段）。所有断言在 1440×900 视口 + 隔离 user-data-dir 下执行；`[软]` = 超时降级 skip（汇总表列出但不 fail）；`[full]` = 仅完整档。

### A. 导航与 9 视图可达（12 条）

| # | 断言 | 来源 |
|---|---|---|
| NAV-01 | boot · 无 · `.module-rail` 15s 内出现 | ui-snapshot.mjs:89 |
| NAV-02 | rail · 无 · rail-item 数 === 9（dashboard + CARD_VIEWS 8 个，model3d 由编译期 flag 过滤） | ui-snapshot.mjs:25,92-94；shellModules.ts:20-23 |
| NAV-03 | dashboard · 无 · 卡片网格 `[data-tint]` ≥ 8 | shellModules.ts:29-39（MODULE_META） |
| NAV-04 | workspace · 无 · `.display-map` 存在 | DisplayMap.tsx:81 |
| NAV-05 | effects · 无 · `.effects-view` + `.effect-card-main` ≥ 40（49 CPU 效果） | EffectsView.tsx:392,127 |
| NAV-06 | video · 无 · `.video-mode-bar` 存在 | verify-packaged-app.mjs:28-30 |
| NAV-07 | audio · 无 · `.audio-studio-view` 存在 | AudioStudioView.tsx:2100 |
| NAV-08 | games · 无 · `.games-hub` 存在 | MiniGamesView.tsx:2025 |
| NAV-09 | diagnostics · 无 · `.diagnostics-list` ≥ 1 组且行文本非空 | DiagnosticsView.tsx:78；probe-runtime.mjs:177-184 |
| NAV-10 | architecture · 无 · `<canvas>` ≥ 1 且 backing 尺寸 > 0 | ui-snapshot.mjs:107-121 canvas 枚举 |
| NAV-11 | ai · 无 · ai 视图根节点存在（selector 实施时核实，见 §9） | — |
| NAV-12 | 全视图 · 逐个点 rail-item · 点击后活动视图标识变化（aria-selected/active 类），证明切换真生效而非静默失败 | ui-snapshot.mjs:100-101 模式 |

### B. 应用面关键交互（10 条）

| # | 断言 | 来源 |
|---|---|---|
| APP-01 | effects · 点击首个 `.effect-card-main` · 选中态类名出现（如 selected/active），再次进入视图保持 | probe-runtime.mjs:171-173 |
| APP-02 | effects · focus `input[type=range]` + ArrowRight×2 · input.value 数值变化 | probe-runtime.mjs:219-222 |
| APP-03 | 引擎 · 经桥 `setEngineRunning(true)`→读 status→false · `.running` 翻转对称 | preload/index.ts:22 |
| APP-04 | 主题 · `rgbbox:theme=light` + reload · `<html data-theme="light">` | r148-s5-light-walkthrough.mjs:38-46 |
| APP-05 | 视图记忆 · 切到 games + reload · 恢复后 active view === games（`rgbbox:view`） | tabNavigation.ts:20 |
| APP-06 | overlay · `openOverlay(primaryId)` · `getOverlayDisplayIds()` 含该 id | preload/index.ts:69-76；useOverlayTopology.ts:36-44 |
| APP-07 | overlay · `closeOverlay(id)` · ids 回空且 `onOverlayClosed` 回调收到该 id | preload/index.ts:104 |
| APP-08 | overlay · 打开 3s 内 · `onOverlayFrame` 订阅收到 ≥2 帧 | preload/index.ts:98 |
| APP-09 | 抓屏 · `getCaptureProviderStatus()` · 返回含 provider 字段的对象 | preload/index.ts:29-30；ipc.ts:11 |
| APP-10 | 全程卫生 · 无 · pageerror === 0；console error ≤ 白名单数（首版 0，实测后再放宽） | diag-input.mjs:11-15 |

### C. IPC 冒烟（8 条）

| # | 断言 | 来源 |
|---|---|---|
| IPC-01 | `getAppVersion()` === package.json version | preload/index.ts:17 |
| IPC-02 | `getDefaultProfile()` 返回完整 profile（engine/zones 字段非空） | preload/index.ts:19 |
| IPC-03 | `saveProfile(p)` → `getDefaultProfile()` 往返一致（改一个 effect 参数读回相同） | preload/index.ts:20 |
| IPC-04 | `saveProfileAs('smoke-tmp')` → `listProfiles()` 含它 → `deleteProfile` 后消失（前后自清理） | preload/index.ts:275-280 |
| IPC-05 | `fetch('media://app/<已知资产>')` → status 200 且 body 非空 | index.ts:1620-1629 |
| IPC-06 | `fetch('media://local?p=C:\\Windows\\win.ini')` → status 403（白名单外拒绝） | index.ts:1637-1650 |
| IPC-07 | 关机 arm-cancel：`shutdownArm(86400)` → `shutdownStatus().armed===true` → `shutdownCancel()` → armed===false。**安全设计**：24h 长引信 + finally 里二次 cancel + 兜底直接 `exec('shutdown /a')`（node 兜底，防进程中途死掉留下真关机） | preload/index.ts:146-149；index.ts:297 |
| IPC-08 | `crashLogList()` 返回数组（只读探针） | preload/index.ts:37 |

### D. 4 游戏核心环（17 条）

| # | 断言 | 来源 |
|---|---|---|
| GM-SW-01 | swarm · 点蜂群卡 · `[data-field="ready-panel"]` 可见且画布在视口内 | r219-verify.mjs:76-97 |
| GM-SW-02 | swarm · 点 `[data-action="ready-start"]` · `probe().phase === 'running'` | r219-verify.mjs:100-102；MiniGamesView.tsx:585 |
| GM-SW-03 | swarm · `keyboard.down('a')` 300ms · `probe().keys` 含 `'a'` 且 `axis.x ≠ 0`（**R221.7 防回归主断言**：真实键盘事件→window 监听→键池） | diag-input.mjs:40-58 |
| GM-SW-04 | swarm · 按住 1.6s 后松开 · `|Δplayer.x| > 0` 且 shipVp 在视口内 | r219-verify.mjs:102-116 |
| GM-SW-05 | swarm · 相机钉死 · `cameraFixed === true`（camera≈vp 中心且 zoom===1） | r219-verify.mjs:113 |
| GM-SW-06 | swarm · `spawnBoss()`×6 → 等待 · phase==='lost'，`[data-field="run-recap"]` 可见，localStorage `rgbbox:gamesBest:survival` ≥ 0（结算写 best 链） | MiniGamesView.tsx:556,2433,146-151,621-638 |
| GM-TD-01 | td · 点塔防卡 · ready-panel + `[data-field="td-ctl"]` 出现 | MiniGamesView.tsx:2476,2537 |
| GM-TD-02 | td · ready-start · 波次控件文本出现「第 1 波/Wave 1」类增量起点 | r219-verify.mjs:225 |
| GM-TD-03 | td · Esc → 点 `[data-action="fs-restart"]` → `[data-action="fs-resume"]` · 序列全部可点且执行后仍在运行态 | r219-verify.mjs:180-184 |
| GM-TD-04 | td · 点 `[data-action="td-next-wave"]` · 波次指示 +1 | MiniGamesView.tsx:2489 |
| GM-TT-01 | tetris · 卡→ready→开局 · 运行态 HUD 出现（开局无异常即 pass，probe 缺席时以画布活跃度判定） | r219-verify.mjs:100 模式 |
| GM-TT-02 | tetris · hold ArrowLeft 500ms · 画布活动区 regionSig 变化（双帧哈希不等） | r219-verify.mjs:61-73 |
| GM-TT-03 | tetris · ArrowUp ×1（旋转） · regionSig 变化 | 同上 |
| GM-TT-04 | [软][full] tetris · 等待自然死亡（≤90s） · recap + best 写入 | MiniGamesView.tsx:146-151,2433 |
| GM-SL-01 | slash · 卡→ready→开局 · 运行态 | 同 GM-TT-01 模式 |
| GM-SL-02 | slash · 按 'j'（斩击）×2 · regionSig 变化 | r219-verify.mjs:61-73 |
| GM-SL-03 | [软][full] slash · 等待结算 · recap + best 写入 | 同 GM-TT-04 |

另有横断：GM-HUB-01（每游戏结束态点「返回」→ `.games-hub` 恢复，r219-verify.mjs:168-171）计入 D 组共 18 行（上表 17 + 横断 1）。

**合计：12 + 10 + 8 + 18 = 48 条**（≥40 达标）。每条断言失败时 harness 自动截 `.verify-artifacts/fails/<id>.png` + 记录 got/want JSON——「机制对但视觉差」类的裁切/溢出硬伤可以当场看图（呼应表现层质量零容忍约束）。

---

## 5. 与 dist 链集成（版本号时序坑的解法）

现状：`dist:win = npm version patch --no-git-tag-version && yarn predist:clean && yarn build && electron-builder --win`（package.json:21）。

**方案（推荐）：`predist:win` 前置钩子**——npm/yarn 生命周期钩子在 script body **之前**执行：

```jsonc
"predist:win": "node scripts/verify-release.mjs --quick --dist-hook",
"dist:win": "npm version patch --no-git-tag-version && yarn predist:clean && yarn build && electron-builder --win"  // 不动
```

- **时序坑消解**：钩子失败 → yarn 中止 → `npm version patch` 根本没跑 → **不存在版本号回滚问题**。门禁绿了才允许 bump，语义也正确（「验证的是即将发布的代码」）。
- 权衡 ①（快速 vs 完整）：钩子固定 `--quick`（估算 7-10min）；`--full` 留给发版日前手动 `yarn verify:release`。完整档不进钩子的理由：≤15min 预算被 dist 本身（electron-builder maximum 压缩通常 5-10min）挤压；且 L5 性能阈值在机器负载高时（编译并行）易假阳。
- 权衡 ②（重复构建）：钩子的 L2 产出 `out/`，但 body 里 `yarn build` 会再跑一遍 typecheck+vite（~2-4min 浪费）。v1 **接受**（`predist:clean` 只删 `release/` 不删 `out/`，dist-clean.mjs:5,44——重建虽重复但语义最安全）；v1.5 用「L2 检测 out/ 新鲜即跳过」压缩钩子时长。
- 兜底：`RGBBOX_SKIP_GATE=1 yarn dist:win` 环境变量逃生口（verify-release 开头检查并大字警告+要求确认）——留给「只改了 README 也要等 10 分钟门禁」的场景，但每次使用都在汇总 JSON 里留痕。
- 反模式（不做）：把门禁串在 `npm version patch` **之后**再自动回滚版本号——回滚脚本会覆盖手工版本编辑，且 bump 与回滚之间崩溃留下脏树；钩子前移已让这个复杂度彻底不需要。

**注意**：`dist`（不带 :win）已有隐式 `predist` 钩子（package.json:18 自动生效）在做 version bump；`dist:win/mac/dir` 的钩子名必须精确是 `predist:win` / `predist:mac` / `predist:dir`。yarn 1.22 对带冒号脚本的 pre-hook 支持需 1 分钟实测（§9 未验证项①）；若不支持，退化为显式改链首：`"dist:win": "yarn verify:quick && npm version patch && …"`（等效，只是显式）。

---

## 6. 基线治理（快照重立必须绑定 PRD R-N）

现状：`ui:snapshot:update` 直写 git-tracked `docs/ui-baseline/`（ui-snapshot.mjs:8-9,22），重立纪律是「视觉变更后人工判断」；update 完成时打印 baseline 所钉 HEAD（ui-snapshot.mjs:133-139）但**没有任何机制阻止无 R-N 的基线漂白**——改坏 UI 的人可以 update 基线让门禁回绿。

设计（零新依赖，两层）：

1. **`docs/ui-baseline/BASELINE-LOG.md`（git-tracked 台账）**：每次 `--update-baseline` 自动 append 一行模板 `| <日期> | <git short HEAD> | R-N: __RN-TBD__ | <一句话原因> |`。HEAD 戳复用 ui-snapshot.mjs:135-137 现有逻辑（v1 给 ui-snapshot.mjs 加 ~10 行：update 模式下 append 此行）。
2. **`scripts/check-baseline-rn.mjs` + pre-commit 安装器**：`node scripts/install-hooks.mjs` 把 pre-commit 写进 `.git/hooks/`（仓库级安装，一次性，CLAUDE.md 允许经 R-N 入库 install-hooks 本体）。钩子逻辑（~40 行）：
   - `git diff --cached --name-only -- docs/ui-baseline` 非空（current/diff 已 gitignore，天然排除）；
   - 且暂存 diff 里 BASELINE-LOG.md **没有新增**含 `R\d+`（非 TBD）的行；
   - → 阻止提交，输出：「基线变更必须伴随 PRD-0002 的 R-N：在 BASELINE-LOG.md 填入 R-N 编号与原因，或 `git reset docs/ui-baseline`」。提交信息本身在 pre-commit 阶段尚不存在，所以锚点是台账行而非 commit msg——这是选台账不选 commit-msg 钩子的原因。
   - `--no-verify` 可绕过是已知局限（单人仓库，防线定位是「提示纪律」不是「防对抗」）；verify-release 的 L3 兜底保证至少跑过比对。
3. **PRD 侧**：R-REL-GATE 验收点写明「基线变更 = 视觉行为变更 = 必须有 R-N，证据附 diff/ 图」；R-N 完成自检时把 BASELINE-LOG 行链接进 PRD §6。

---

## 7. 实施排期

| 版本 | 内容 | 工作量（估算） | 验收 |
|---|---|---|---|
| **v1（本周可落地）** | R-REL-GATE 条款入库；`verify-release.mjs` 编排器 + exit code 约定；`smoke-harness.mjs` + `smoke-app.mjs`（A/B/C 30 条）；`smoke-games.mjs`（D 18 条，quick 档）；package.json scripts + `predist:win/mac/dir` 钩子；.gitignore 增 `.verify-artifacts/` | **≈2 人日**（编排器 0.5d / smoke-app 0.5d / smoke-games 0.5d / 钩子+试跑校准 0.5d） | 在已知好版本上 `yarn verify:quick` 全绿；人为注入 1 个回归（如注释掉游戏键监听）能被 GM-SW-03 抓住——**复刻 R221.7 场景作为门禁自证** |
| **v1.5（下周）** | `perf-gate.mjs`（perf-selftest JSON 解析 verdicts + r219-perf 帧分布抽档阈值化）；基线治理（BASELINE-LOG + install-hooks + check-baseline-rn）；L2 fresh-out 跳过优化；verify-release-latest.json 工件 + `--only <layerId>` 调试档 | ≈1 人日 | 故障注入：改阈值能红；基线 update 无 R-N 被钩子拦 |
| **v2（按需，不急）** | CI 承载：GitHub Actions windows runner 跑 L0-L2（ci.yml 现仅 typecheck，注释里已预告 test/snapshot 待 runner 预热），自托管 runner 承载 L3/L4；smoke 矩阵扩展（vision 合成手势环 `__rgbboxVision.enableSynthetic`、LAN 双实例、打包内 denoise/TTS——复用 verify-packaged-app.mjs 模式）；高频回归面下移单测金字塔 | 2-3 人日 + runner 运维 | 见 §8「不建议做的」边界 |

---

## 8. 不建议做的（过度工程清单）

- **引入 playwright 全家桶 / jest / testcontainers / husky / lunchpail 类编排框架**——cdp.mjs 自研驱动（cdp.mjs:16,103-119）+ 60 行编排器已覆盖需求；CLAUDE.md 边界外。
- **第二套视觉基线**（给 L4 再截一套全量对比图）——与 L3 pixelmatch 门禁职责重叠；L4 失败时才截取证图，不建基线。
- **无头虚拟显示器 / 多分辨率矩阵 / 多平台并行冒烟**——r219 已证明关键回归在 1440×900 + 4:3 + 800×600 三个形态就覆盖（r219-verify.mjs:20,131,267）；单人维护带宽不支持矩阵。
- **npm version 自动回滚脚本**——钩子前移（§5）已让 bump 不会发生在失败后，回滚是负需求。
- **AI 模型判读截图**——非确定性判定进门禁 = 假阳假阴都不可复现；pixelmatch + 数值阈值才是门禁语言。
- **把 shutdown arm-cancel / overlay 开关放进 CI 定时跑**——真机 OS 副作用（计划关机任务、置顶窗口），只属于本地发版门禁。
- **对 release/ zip 做全量「装完逐功能点一遍」装机回归**——verify-packaged-app.mjs:1-60 的定向验证（打包内 onnxruntime 推理 + UI smoke）已是性价比正确的深度；全量装机回归属 v2 之后再议。
- **门禁结果接 Slack/邮件/badge 通知**——单人项目，终端汇总表 + exit code 即契约。

---

## 9. 未验证项（诚实清单）

1. **yarn 1.22 是否对 `yarn dist:win` 自动执行 `predist:win`**（npm 生命周期语义，大概率支持但未实测）——1 分钟实验可定；不支持则改显式链首（§5 兜底，等效）。
2. **所有时长为估算**：typecheck/test/build/ui:snapshot/smoke 的实测耗时未在本任务中计时（约束：不启动应用、不跑构建）。落地 v1 后需用 `verify-release-latest.json` 的 per-layer ms 校准 quick/full 档是否守住 7-10 / 13-15min 预算，超了先砍 L4 的 sleep 常量（各 650-1100ms 的 settle 是继承自取证脚本的保守值，可实测下调）。
3. **L5 阈值未定标**：r219-perf 的 p50/over32 数字依赖当时机器与场景负载，「p50≤17ms / over32<5%」是从 r219-verify.mjs:283-288 fps 采样与 r219-perf.mjs:26-47 分布结构推出的建议起点，须以首轮 full 档实测定稿（advisory → gate）。
4. **个别 selector 未从源码核实**：NAV-11（ai 视图根节点类名）、GM-TT/GM-SL 的开局 HUD 判定锚点、tetris/slash 卡片文案正则（/方块|Tetris/、/斩|Slash/ 是按 r219-verify.mjs:79,221 的蜂群/塔防先例推测的中文文案）——实施时以实机 DOM 为准，映射表 GAMES.card 字段就是为这一刻的单点修改留的。
5. **tetris/slash 自然结算时长上限**（GM-TT-04/GM-SL-03 的 90s 软断言窗口）未实测；无快速死亡 seam（`__rgbboxGames` 只有 spawnBoss/startRoulette，MiniGamesView.tsx:554-565），若 90s 不够，v1.5 可提 R-N 给 seam 加 `forceSettle()`（测试后门已有先例，属低风险加法）。
6. **overlay 冒烟在多显示器机器上的行为**：APP-06/07/08 用 primary display（perfSelfTest.ts:176-177 同款取法），单/多屏都应成立，但未在多屏环境验证；CI 无显示器时 L4 整层不适用（v1 只面向本地真机，本来也不进 CI）。
7. **assertFreshOut 对 smoke 直接 spawn 路径的覆盖**：probe-runtime 模式（直接 spawn + 手动 assertFreshOut）已被三个现存脚本验证可用，但 `--user-data-dir` 与 CDP 端口 93xx 的组合是新配对，落地首跑确认无端口/锁冲突（单实例锁在非 perf-selftest 启动下仍生效，index.ts:62——所以 smoke 两脚本串行 + 真退出等待是硬要求，骨架已含）。
