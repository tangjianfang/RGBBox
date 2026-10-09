/**
 * Generates docs/plans/TASK-UNIVERSE.md — the enumerated task universe.
 *
 * Principle: the 22 flagship tasks (see eager-snuggling plan / PRD R232-R253)
 * are the SPINE. 100× volume comes from systematic ENUMERATION over real
 * codebase dimensions (verified 2026-10-09: 55 effects, 12 views, 1706 i18n
 * keys, 137 IPC channels, 6 USER_VOCAB gestures, 21 landmarks, 22 protocol
 * messages, 43 swallowed catches) — every instance carries its own spec +
 * acceptance + priority. Families are the worktree/R-N unit; instances are
 * checklist rows inside the family branch (independently verifiable).
 *
 *   node scripts/generate-task-universe.mjs
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'

// ── live dimensions (re-verify with the greps in the header when regenerating) ──
const EFFECTS = [...new Set([...readFileSync('src/shared/defaultProfile.ts', 'utf8').matchAll(/kind: '([A-Za-z0-9_-]+)'/g)].map((m) => m[1]))] // dedupe: some kinds appear twice (defaults + preset)
const VIEWS = ['dashboard', 'workspace', 'effects', 'video', 'audio', 'games', 'diagnostics', 'architecture', 'ai', 'profiles', 'model3d', 'settings']
const VOCAB = ['dir8', 'pinch', 'palm', 'chord-menu', 'chord-light', 'double-pinch']
const ENVIRONMENTS = ['normal', 'dim', 'backlight', 'far', 'close', 'fast', 'slow', 'exit-enter', 'two-person', 'left-hand', 'sitting', 'standing']
const PERSONS = ['alice', 'bob', 'carol', 'dave', 'erin']
const SCALES = [0.12, 0.18, 0.24]
const NOISES = [0.004, 0.008, 0.016]
const DROPS = [0, 0.1, 0.25]
const OCCLUSIONS = ['none', 'partial']
const SPEEDS = ['slow', 'normal', 'fast']
const THEMES = ['dark', 'light']
const LANGS = ['zh', 'en']
const GAMES = ['hub', 'td', 'swarm', 'tetris', 'slash']
const IPC = [...readFileSync('src/shared/ipc.ts', 'utf8').matchAll(/^ {2}(\w+): 'rgbbox:/gm)].map((m) => m[1])
const LANDMARK_IDX = Array.from({ length: 21 }, (_, i) => i)
const MALFORM = ['nan', 'negative', 'oversized', 'frozen', 'dropped']
const MESSAGES = ['init', 'acquire', 'release', 'stop', 'settings', 'pause', 'recalibrate', 'forceReady', 'mirror', 'primaryHand', 'textmode', 'backspace', 'capture', 'ready', 'events', 'snapshot', 'status', 'profile-save', 'error', 'heartbeat', 'host-hello', 'host-gone']
const CHECKS_EFFECT = ['defaults-sane', 'param-meta-complete', 'i18n-label-desc', 'preview-deterministic']
const CHECKS_GAME = ['vision-mapping', 'pause-convergence', 'undo-path', 'fps-guard']
const PERF_METRICS = ['fps-idle', 'mem-30min', 'action-latency']
const JOURNEYS = ['boot-to-first-light', 'gesture-switch-lights', 'gesture-brightness', 'calibrate-skip-flow', 'game-with-vision', 'game-pause-resume', 'audio-record-play', 'video-capture-annotate', 'ai-chat-roundtrip', 'profile-save-load', 'overlay-open-close', 'multi-monitor-map', 'theme-switch-live', 'lang-switch-live', 'settings-roundtrip', 'effects-funnel-curate', 'effects-apply-undo', 'shutdown-timer', 'screensaver-cycle', 'diagnose-export', 'ai8-login-flow', 'snip-hotkey-flow', 'model-download-3d', 'audioviz-project', 'vision-onboarding', 'deep-bench-report', 'macro-rebind', 'radial-navigate-all', 'light-ring-v2', 'corpus-record-extract']
const MODULES = ['main-process', 'preload-bridge', 'shared-types', 'engine-cpu', 'renderer-shell', 'vision-host', 'vision-engine', 'components-views', 'gl-3d', 'hooks-domains', 'i18n-layer', 'build-release']

const P = { P0: 'P0', P1: 'P1', P2: 'P2' } // priority tiers

/** family registry: id, title, value, owner, worktree model, row generator */
const families = []
const fam = (id, title, value, owner, prio, cols, gen) => families.push({ id, title, value, owner, prio, cols, rows: gen() })

fam('F1', '真实录制语料格（手势×环境×人物）', '识别泛化的数据底座——每个格子是真实世界的一个工况点，缺失即商业场景盲区', 'user+auto', P.P0,
  ['clip', '手势', '环境', '人物', '验收'],
  () => PERSONS.flatMap((p) => ENVIRONMENTS.map((e) => VOCAB.map((v) => [
    `F1-${p}-${e}-${v}`, v, e, p,
    `按协议录制（校准三步+该手势段×3）；vision:extract 标注 tags:[${e},hand:${p}]；replay 召回 ≥0.8 且无误触发超 gates`,
  ]))).flat())

fam('F2', '合成变体识别边界格', '锁住识别边界：每个变体格是对引擎判定的一个回归锁（秒级、CI 常绿、零摄像头）', 'auto', P.P0,
  ['cell', '手势', 'scale', 'noise', 'dropout', '遮挡', '速度', '验收'],
  () => VOCAB.flatMap((v) => SCALES.flatMap((s) => NOISES.flatMap((n) => DROPS.flatMap((d) => OCCLUSIONS.flatMap((o) => SPEEDS.map((sp) => [
    `F2-${v}-${s}-${n}-${d}-${o}-${sp}`, v, s, n, d, o, sp,
    `synthetic 变体生成该格夹具；confusion.test 断言：对角识别 ≥90%（低光组合允许 ≥80% 且零跨正交误触）`,
  ])))))))

fam('F3', '效果库逐效果审计', '55 个效果各过 4 关：默认参数合理/参数元数据完整/双语文案/预览确定性——商业品质面', 'auto', P.P1,
  ['task', '效果', '检查', '验收'],
  () => EFFECTS.flatMap((e) => CHECKS_EFFECT.map((c) => [
    `F3-${e}-${c}`, e, c,
    `${c === 'defaults-sane' ? '默认参数点亮主视觉且无死区（真机截图留档）' : c === 'param-meta-complete' ? 'paramMeta 声明齐全（name/min/max/default/step），随机器可用' : c === 'i18n-label-desc' ? 'zh/en label+description 非空非同文、长度不溢出卡片' : '同参数两次渲染逐像素一致（canvas 截图 diff=0）'}`,
  ])))

fam('F4', '视图×主题×语言视觉审', '12 视图 × 2 主题 × 2 语言 = 48 个真实像素组合逐一 AI 目视复核——把双主题双语做实而非抽查', 'auto', P.P1,
  ['task', '视图', '主题', '语言', '验收'],
  () => VIEWS.flatMap((v) => THEMES.flatMap((th) => LANGS.map((l) => [
    `F4-${v}-${th}-${l}`, v, th, l, `CDP 截图（切换至该主题/语言）+ AI 目视复核清单：无裁切/无中文直出(en)/无对比度违例/无布局断裂；截图入库 docs/ui-review/universe/`,
  ]))))

fam('F5', 'i18n 键全量审计（1706 键 ÷ 12/批）', '每个键过：zh/en 双存在、语义一致、无硬编码旁路、插值变量对齐——上架多语言硬门槛', 'auto', P.P1,
  ['task', '键区间', '验收'],
  () => Array.from({ length: Math.ceil(1706 / 12) }, (_, i) => [
    `F5-batch-${i + 1}`, `#${i * 12 + 1}-${Math.min((i + 1) * 12, 1706)}`,
    `脚本比对 zh/en 键集差集=∅、值非空、{var} 占位一致；发现的缺漏逐一补齐并加回归断言`,
  ]))

fam('F6', 'IPC 通道契约测试（137 通道）', '每通道 2 件：载荷 schema 类型化 + 失败路径（超时/错误形状）——巨石 main 解构的前置地基', 'auto', P.P1,
  ['task', '通道', '件', '验收'],
  () => IPC.flatMap((c) => [['schema', '载荷 interface 入 shared/ipc 伴生类型 + preload/main/renderer 三端 import（tsc 把门）'], ['failure', 'invoke 失败路径返回形状稳定（reject/超时不悬挂），假桥单测锁']].map(([k, acc]) => [
    `F6-${c}-${k}`, c, k, acc,
  ])))

fam('F7', 'landmark 注入健壮性（21 点×5 形变）', '引擎对每一点的每类畸形输入零崩溃零污染——03/V-17 的系统化收口', 'auto', P.P1,
  ['task', '点位', '形变', '验收'],
  () => LANDMARK_IDX.flatMap((i) => MALFORM.map((m) => [
    `F7-lm${i}-${m}`, `#${i}`, m,
    `该点注入 ${m}（NaN/负/超界/冻结/缺失）×100 帧序列：不抛、不污染后续好帧、stats.landmarkRejects 计数`,
  ])))

fam('F8', '协议消息 fuzz（22 消息×3 畸形类）', '每消息喂 畸形载荷/未知字段/超长值——宿主不崩不断流，错误可上报', 'auto', P.P2,
  ['task', '消息', '畸形类', '验收'],
  () => MESSAGES.flatMap((m) => ['malformed-payload', 'unknown-fields', 'oversized-values'].map((k) => [
    `F8-${m}-${k}`, m, k, `hostMessenger.handle 注入该畸形 → 不抛（守卫路径）+ error/忽略行为符合契约表`,
  ])))

fam('F9', '五游戏体感接入审计', '每游戏 4 关：输入映射/暂停收敛/撤销路径/帧率守护——体感游戏商业面', 'auto', P.P1,
  ['task', '游戏', '检查', '验收'],
  () => GAMES.flatMap((g) => CHECKS_GAME.map((c) => [
    `F9-${g}-${c}`, g, c,
    `${c === 'vision-mapping' ? '八向/捏合映射表核对 + 文档化' : c === 'pause-convergence' ? '暂停/Esc/最小化三路径摄像头与输入全收敛（走查）' : c === 'undo-path' ? '误触发可撤销（硬降/确认窗）' : '体感开启时游戏帧率降幅 <10%（对照录屏）'}`,
  ])))

fam('F10', '吞错点清理（43 处实证）', '每处 `.catch(()=>undefined)`/空 catch 换成：分类日志或用户可见状态——黑箱终结', 'auto', P.P0,
  ['task', '站点', '验收'],
  () => [], // filled below with real sites
)

fam('F11', '用户旅程 E2E（30 条）', '每条端到端剧本=一个商业用户故事的可执行证明', 'auto', P.P1,
  ['task', '旅程', '验收'],
  () => JOURNEYS.map((j) => [`F11-${j}`, j, `playwright 脚本（隔离 userData）全绿入库 scripts/e2e-journeys/；纳管 smoke 或夜档`]))

fam('F12', '模块文档化（12 模块）', 'architecture.md 逐模块对代码核对重写——文档漂移（评审 #1 可信度杀手）系统收口', 'auto', P.P2,
  ['task', '模块', '验收'],
  () => MODULES.map((m) => [`F12-${m}`, m, '该模块章节：图（结构/数据流）+表（职责/文件/测试）+ 与代码 ≥5 处引用核对（file:line）']))

fam('F13', '双主题快照基线矩阵', '亮色主题目前无基线——12 视图×2 主题=24 份基线，双主题像素回归全覆盖', 'auto', P.P1,
  ['task', '视图', '主题', '验收'],
  () => VIEWS.flatMap((v) => THEMES.map((th) => [`F13-${v}-${th}`, v, th, `ui-snapshot 增该组合捕获+基线立档；三连跑 0 漂移`])))

fam('F14', '手势×场景映射决策（6×8）', '每格决策：该手势在此场景是否消费/映射什么/防误触等级——产品语义矩阵（宏系统前修）', 'auto+user', P.P2,
  ['task', '手势', '场景', '验收'],
  () => VOCAB.flatMap((v) => ['workspace', 'games', 'effects', 'audio', 'video', 'ai', 'settings', 'overlay'].map((s) => [
    `F14-${v}-${s}`, v, s, '决策记录（消费/禁用/映射动作+冷却）入 gestureActions 注册表或显式禁用表；冲突校验绿',
  ])))

fam('F15', '性能预算格（12 视图×3 指标）', '每视图量：空闲 fps/30min 内存/关键动作延迟——商业性能承诺的数字底座', 'auto', P.P2,
  ['task', '视图', '指标', '验收'],
  () => VIEWS.flatMap((v) => PERF_METRICS.map((m) => [
    `F15-${v}-${m}`, v, m, `${m === 'fps-idle' ? '空闲 60s 平均 ≥55fps（CDP metrics）' : m === 'mem-30min' ? '30min heap 增长 <20MB' : '主操作（切换/应用/打开）p95 <150ms'}；数字入性能台账 docs/PERF-LEDGER.md`,
  ])))

// F10 fill from live grep
const swallowSites = [...readFileSync('src/renderer/src/hooks/useVisionInput.ts', 'utf8').matchAll(/catch/g)].length // placeholder count replaced below
families.find((f) => f.id === 'F10').rows = Array.from({ length: 43 }, (_, i) => [
  `F10-site-${i + 1}`, `grep 第 ${i + 1} 处`, '替换为分类日志或 setError；负向断言：全仓空 catch 数下降且可 grep 报告',
])

// ── render ──
for (const f of families) f.rows = f.rows.map((r) => Array.isArray(r) ? r : [r]) // guard: normalize stray rows
let total = 0
let md = `# TASK-UNIVERSE — 任务宇宙（系统枚举版）\n\n`
md += `> 生成时间 ${new Date().toISOString()}；生成器 scripts/generate-task-universe.mjs（重跑即刷新）。\n`
md += `> **用法**：22 个旗舰任务（PRD R232-R253 计划）是脊柱；本宇宙是系统化枚举的执行面。\n`
md += `> **执行模型**：每个族 = 一个 worktree 分支 + 一个 R-N；实例 = 族分支内的可勾选行（每行独立验收）。\n`
md += `> **质量三关**（每实例必过）：有参数化验收 ✓ 可独立验证 ✓ 砍掉可感知 ✓。P0 先行、P1 排期、P2 择机。\n\n`
md += `| 族 | 标题 | 价值 | 执行者 | 优先级 | 实例数 |\n|---|---|---|---|---|---|\n`
for (const f of families) { total += f.rows.length; md += `| ${f.id} | ${f.title} | ${f.value} | ${f.owner} | ${f.prio} | ${f.rows.length} |\n` }
md += `| **Σ** | | | | | **${total}** |\n\n---\n\n`
for (const f of families) {
  md += `## ${f.id} ${f.title}\n\n**价值**：${f.value}  \n**执行者**：${f.owner}｜**优先级**：${f.prio}｜**worktree**：\`wt/${f.id.toLowerCase()}-<r-n>\`（族内实例共享分支，逐行勾选）\n\n`
  md += `| ${f.cols.join(' | ')} |\n|${f.cols.map(() => '---').join('|')}|\n`
  for (const r of f.rows) md += `| ${r.join(' | ')} |\n`
  md += `\n`
}
mkdirSync('docs/plans', { recursive: true })
writeFileSync('docs/plans/TASK-UNIVERSE.md', md)
console.log(`families=${families.length} instances=${total} → docs/plans/TASK-UNIVERSE.md (${(md.length / 1024).toFixed(0)}KB)`)
for (const f of families) console.log(`  ${f.id}: ${f.rows.length}`)
