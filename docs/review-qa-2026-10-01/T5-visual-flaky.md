# T5 — 视觉/快照测试体系与 flaky 治理 专项评审报告

> 评审对象：RGBBox（C:\tjf\github\RGBBox，分支 feat/app-review-fixes）
> 评审人角色：视觉测试与稳定性工程师 | 日期：2026-10-01
> 仓库只读，未启动应用、未运行 scripts/、未运行测试。所有结论标注 file:line + 置信度。
> 本轮改动建议均需按 CLAUDE.md 流程先追加 R-N。

---

## 0. 摘要

1. **ui-snapshot.mjs 骨架健康**（新鲜度守卫、双侧掩膜、SIZE 门、0.1% 硬门限都在），但**确定性有四个真实缺口**：非 canvas 的 CSS 动画完全不设防（产品已有全局 `prefers-reduced-motion` kill-switch 而脚本没用——这是 workspace 2.72% 假阳性的根修点）；等待策略是裸 sleep 无就绪谓词；launchElectron 不隔离 user-data-dir（主进程持久态参与渲染）；HEAD 戳只打 console 未落盘。
2. **游戏运行态从未入基线**（games.boxes.json 实测 `[]`），且游戏循环是墙钟 dt + 非种子 RNG → 运行态**全图 pixelmatch 在现有代码下不可行**；应采用「ready 全图 + running 几何/采样探针（r219-verify 模式固化）+ 结算 DOM 断言」的混合方案。r219-verify.mjs 目前是纯取证脚本（无断言、恒 exit 0），不能当门禁。
3. **基线治理靠人肉纪律**：重立直写 trusted 目录、无 MANIFEST、diff 证据 gitignored、基线 PNG 混在特性 commit 里。已有「提交信息记录 per-view 漂移率」的好实践，应升级为规约。
4. **flaky 治理已有正确范式但未资产化**：「rAF 量子屏障」frames() 在 MiniGamesView.test.tsx 内**复制了 5 份**；crashLog 一次性 flake 找到了**代码级机制**（文件名毫秒精度同 ms 碰撞覆盖）；vitest 无 retry/isolate 配置。
5. 路线图：P0 三件（reduced-motion 根修、crashLog 碰撞修复、frames() 收编），合计约 2 人日，预期把假阳性与已知 flake 源基本清零。

---

## 1. ui-snapshot.mjs 全文审计

### 1.1 确定性保障现状逐项

| 维度 | 现状 | file:line | 评价/置信度 |
|---|---|---|---|
| 构建新鲜度 | `assertFreshOut()`：out/main + renderer CSS 不老于 src/ 新 mtime 与最后源码 commit，双基准 | `scripts/lib/cdp.mjs:74-100` | 已验证，扎实（T1 事故护栏）|
| Renderer 态复位 | 清空全部 `rgbbox:*`/`rgbbox-*` localStorage 后 reload | `scripts/ui-snapshot.mjs:80-88` | 已验证（1.14% 事故根因的修复）|
| 视图等待 | `.module-rail` selector(15s) + 裸 `sleep(700)`；每视图裸 `sleep(650)` | ui-snapshot.mjs:89-90, :101 | **缺口**：无 per-view 就绪谓词（canvas 出现/入场动画结束/异步数据 settle）。慢盘下 lazy chunk 未落定即截图 → 假阳性。高置信（代码可见），实际触发未复现 |
| 动画确定性 | canvas 整体掩膜（`CANVAS_MASK_ALL=true`）+ ±2px 边缘 slack；**非 canvas 的 CSS 动画零处理** | ui-snapshot.mjs:48, :51-62 | **核心缺口**，见 1.2 |
| DPR | 实测基线 PNG 全部 1440×900（读 IHDR 证实）＝CSS 尺寸；boxes.json 用 getBoundingClientRect CSS px 记录 | ui-snapshot.mjs:103-110 | 当前机器 DPR=1 成立；DPR≠1 机器上截图会放大 → `SIZE` 检查大声失败（fail-safe 不静默，ui-snapshot.mjs:155-158）。高置信 |
| 主进程持久态 | `launchElectron` **不带** `--user-data-dir` 隔离 | cdp.mjs:103-107 | **缺口**：profile/systemSettings 等主进程持久化参与 workspace/diagnostics 渲染 → 跨开发者/跨机器基线不可比（memory 中 Agent 脚本专门加 temp udd，反证默认无隔离）。中高置信 |
| 基线戳 | update 模式打印 `BASELINE UPDATED at HEAD xxx`，**只进 console** | ui-snapshot.mjs:136-138 | 缺机器可读的 MANIFEST，见 §3 |

### 1.2 workspace 2.72% 假阳性的机制与根修

**机制（时序解释）**：CSS 动画的相位 = 截图时刻 − 元素挂载时刻。脚本对相位的唯一约束是固定 sleep（700ms boot + 650ms/视图），跨次运行存在 ±100ms 级墙钟抖动 → 无限循环动画落在不同相位 → 大面积像素差；canvas 有掩膜不受影响，**DOM 动画（含其合成层阴影/描边）直接进 diff**。「clean rebuild 后归零」与该机制自洽（重构建改变了 chunk 加载与挂载时序，相位偶然对齐/或动画根本未进入视口）。对元素的指认未验证（无法启动应用），候选源（均为无限动画且在 9 视图内）：

- 入场动画 `fade-in`/`slide-up`：`src/renderer/src/styles/app.css:8910-8911`（若截图落在入场中途，整卡 opacity 差异面积大）
- `status-pill-spin 0.9s linear infinite`：app.css:8896（异步数据未 settle 时出现的转圈）
- `levelup-autopick-pulse 0.5s infinite alternate`：app.css:2114
- `swarm-spin-pulse 1.2s infinite`：app.css:2515；`video-rec-pulse 1.2s`：app.css:5489；`agent-caret 0.9s steps(1)`：app.css:9380

**根修方案（分层，按成本排序）**：

- **L1（推荐，零产品改动）**：`await page.emulateMedia({ reducedMotion: 'reduce' })`。产品 CSS 已有**全局 kill-switch**——app.css:8913-8919 对 `*,::before,::after` 强制 `animation-duration:0.01ms; animation-iteration-count:1; transition-duration:0.01ms`，即所有 CSS 动画确定性地停在终值。脚本目前完全没用它。代价：一次性基线重立（冻结态与动画中间态像素不同），走 §3 规约。Likely 收益：CSS 相位类假阳性归零。
- **L2（补充）**：compare 失败视图自动复拍 best-of-2（取 min diff）。相位错位类噪声是单次事件，二拍命中通过的概率按平方级下降；仅对超限视图复拍，成本 ≈ 单视图 ×2。
- **L3（已有能力）**：像素容差分层 `DIFF_LIMITS` per-view（ui-snapshot.mjs:32-34）——不建议先放宽，R163.3 刚把 0.2% 例外退役，先上 L1/L2 再谈。
- **L4（不推荐）**：CDP 虚拟时间（`Emulation.setVirtualTimePolicy`）或产品加 `data-snapshot-frozen` 钩子。前者与真实 Electron 主进程驱动页面兼容性差、维护重；后者违背脚本侧选择器「零产品钩子」的既有设计立场（ui-snapshot.mjs:45-46 注释）。

### 1.3 workspace.boxes.json 的用途（确认）

- **内容**：canvas rect（>8×8）+ volatile 文本 rect（`.video-source-name`，唯一成员 ui-snapshot.mjs:47），捕获时逐视图写入 `<view>.boxes.json`（:107-122）。实测 workspace 7 个 rect（6 个 59×33 缩略 canvas + 1 个 605×340 主预览），effects 19 个，architecture/audio 各 1 个大 canvas，**games/dashboard/diagnostics/video/ai 为 `[]`**。
- **消费**：compare 时**各自掩各的**——`maskBoxes(a, loadBoxes(BASELINE)); maskBoxes(b, loadBoxes(CURRENT))`（ui-snapshot.mjs:163-164）。这是设计亮点：canvas 若挪位，两图掩膜区错开，一侧留下未掩矩形 → diff 触发，即掩膜系统兼任「舞台搬移探测器」（:40-43 注释明说）。
- **风险点**：boxes.json 在 update 与 capture 两种模式都会写（:95 shotDir 切换），但**只有 update 模式写入的是 trusted 目录**；若只跑 capture（无 compare）则 current/boxes.json 会被下次 compare 读到陈旧值——实际无碍（compare 必然先 capture 覆写），提一句即可。低置信风险，可不处理。

### 1.4 基线漂移检测（现状与缺口）

- 有：assertFreshOut（防 out/ 陈旧）、SIZE 门（防 DPR/尺寸漂移）、boxes.json 双侧掩膜（防 canvas 挪位漏检）。
- 缺：① HEAD 戳未落盘（:136-137 console only）；② 无「基线对应的产品版本/机器环境」元数据 → 换机器重立后旧基线无法机器判定失效；③ diff 图在 gitignored 目录（`.gitignore`: `docs/ui-baseline/diff/`），评审证据不留档。→ 方案见 §3。

---

## 2. 覆盖缺口与「游戏态快照」方案

### 2.1 缺口确认（已验证）

- 基线 games.png 是 hub 卡片网格，`games.boxes.json = []`（hub 无 >8px canvas）→ **ready/running/fs/结算四态从未被任何持久基线覆盖**。
- R219 的视觉验证靠一次性 `scripts/r219-verify.mjs`：probe 几何断言素材（camera 钉死/shipVp 居中）+ `regionSig` 位图哈希（双帧背景静止）+ `brightPixelsIn` 亮像素带采样。**该脚本无任何断言与 exit code 逻辑，恒 `process.exit(0)`**（r219-verify.mjs:291）——是取证脚本不是门禁。

### 2.2 为什么运行态全图 pixelmatch 现在不可行（代码级证据）

1. **墙钟 dt**：游戏循环 `let last = performance.now()`（MiniGamesView.tsx:1089），`dt = Math.min(0.05, (now-last)/1000)`（:1124）——画面是时间函数，两次截图不可能落在同一仿真时刻。
2. **非种子 RNG**：仅每日挑战/LAN 走 `mulberry32(dailySeed())`（MiniGamesView.tsx:1791），常规局敌人/掉落随机 → 状态空间发散。
3. **DPR 相关 backing store**：canvas 尺寸由 `window.devicePixelRatio` 决定（MiniGamesView.tsx:1065-1082，games/hdCanvas）→ 跨 DPI 机器像素内容不同比。
4. 有利条件：`fsPausedRef` 时 `dt=0`（:1126，R206 全引擎冻结）——暂停态画面静止，是潜在「可截帧」，但暂停点状态仍由随机路径决定，没有种子化钩子就不可复现。

### 2.3 三态方案与成本/flake 评估

| 态 | 方案 | 成本 | flake 风险 | 断言力 |
|---|---|---|---|---|
| ready | **入 ui-snapshot 扩展视图**：进指定游戏 → 等 `[data-field="ready-panel"]` 出现（就绪谓词，比裸 sleep 强）→ 截图。canvas HUD 静止可全图或半掩 | 低（脚本 ~0.5d + 基线扩容）| 低（无 RNG、无墙钟推进；Emulate reducedMotion 后 DOM 动画也冻结）| 布局/信息架构回归（R218 U3 类）进硬门禁 |
| 运行 5s | **几何断言 + 像素采样点（r219-verify 模式固化）**：`probe()` 断言（camera 钉死中心、shipVp 在画内、counts 负载上限）+ `regionSig` 双帧静止（背景）+ `brightPixelsIn`（HUD 可见/隐藏）。**不做全图 pixelmatch** | 中（1-1.5d，把 r219-verify 改造成带阈值断言 + exit code 的 `ui-games-verify.mjs`）| 低-中（墙钟只用于「推进 N ms」不用于断言值；断言全部是不变式而非瞬时值）| 内容正确性（居中/铺满/无按钮条）比全图 diff 更锐利 |
| 结算 | DOM 断言为主（结算浮层结构/按钮存在），分数数字区掩膜或跳过像素 | 低 | 低（触发结算需脚本化死亡/胜利——survival 可用 `__rgbboxGames.spawnBoss`（MiniGamesView.tsx:554-569）加速，但确定性死亡钩子目前没有，需小 R-N）| 中 |

**取舍结论**：全图 pixelmatch 对「布局回归」敏感、对「内容正确性」钝（掩膜把 canvas 全挖掉了等于自盲）；几何+采样点恰好相反且零产品侵入。**混合**：ready 全图 pixelmatch（吃 ui-snapshot 现成管线）+ running 几何/采样探针（吃 `__rgbboxVision` seam，MiniGamesView.tsx:574-611——注意 probe() 只读 survivalRef，Tetris/TD/Slash 三作需扩 seam，属小 R-N）+ 结算 DOM 断言。若未来一定要「运行态外观基线」，前置条件是产品加 `__rgbboxGames.renderDeterministic(seed, ticks)` 类钩子（种子 + 定拍渲染），成本 2d+ 且每加视觉特性都要维护，**不建议现在做**。

---

## 3. 快照基线治理规约（PR 化设计）

**现状**（git log 取证）：基线 PNG 与 src 改动**混在同一 commit**（2270ac4/bb705ea/45c6a5e 等）；漂移率数字靠人写进提交信息（45c6a5e 记录了 9 视图完整数字——好实践但纯人肉）；`--update-baseline` 直写 trusted 目录无前置确认（ui-snapshot.mjs:95）；diff 证据 gitignored；无 MANIFEST。git diff 可见性：PNG 是二进制，PR 里只有「文件变了」没有「变了什么」。

**规约（建议落 R-N）**：

1. **触发白名单**（谁/何时可重立）：① 该 R-N 本身是有意 UI/视觉变更；② token/主题层变更引发的全视图漂移；③ 陈旧基线事故（T1 类）处置；④ 快照环境迁移（DPR/OS/渲染后端）。**禁止「跑不过就重立」**——compare 失败必须先归因。
2. **流程四步**：`--compare` 取漂移表 → 打开 `diff/<view>.png` 逐视图归因（有意/无意）→ 无意项先修或记 R-N → `--update-baseline` → 复跑 compare 必须 9/9 GATE PASS 才可提交。
3. **提交形态**：基线变更**独立 commit**（`[PRD-0002] chore: R-N baseline re-baseline`），消息含 per-view old→new 漂移率表 + 基线 HEAD 戳；不与 src 功能改动混提（提高归因可检索性）。
4. **MANIFEST**：update 模式落 `docs/ui-baseline/MANIFEST.json`（head、日期、appVersion、per-view limit、emulateMedia 标志）；compare 启动时读出并打印基线元数据，换机器/换戳自动提示。
5. **diff 证据留存**：diff/ 保持 gitignore；重立时把关键 diff 图拷入 `docs/ui-review/<round>/`（现行惯例已如此）。
6. **PR review 检查单**：二进制 PNG 在 PR diff 不可视 → 规约要求附 per-view 漂移率表（MANIFEST 自动产出）+ 必要时 side-by-side 拼图。

---

## 4. flaky 治理体系

### 4a. 现存时基用例清单（grep setTimeout/sleep/rAF/performance/Date.now 全量）

**高危组（墙钟 + rAF 混合；其中两类曾全量并发翻车，R219 已修但留残余）**

| 用例 | file:line | 机制与残余风险 |
|---|---|---|
| open-palm hold 启动 | `tests/renderer/components/MiniGamesView.test.tsx:301-342` | 已修：负向断言加墙钟护栏（:329-334，前提失效则 skip）+ 正向 `waitFor` 轮询（:340）。**残余**：:248/:266 仍是裸 `setTimeout 60ms` 等「rAF 跑过 pollVision 至少一次」——并发饥饿下 60ms 内可能零 rAF tick，probe 读到旧 axis → 断言挂。中风险，未修 |
| gamepad Start/difficulty/ready/focus/多人 组 ×5 | 同文件 :514, :650, :742, :856, :937 | **frames() 量子屏障复制了 5 份**（「≥minTicks 个 rAF 量子且 ≥ms 墙钟」双屏障 + 3s 兜底，原理注释 :510-513）。已修好，问题是资产化 |
| 跨帧键驻留 | 同文件 :290-291 | `quantum` helper（setTimeout 100ms + 2×tick）第六种变体 |
| crashLog 轮转/排序 | `tests/main/crashLog.test.ts:59-69, :71-80` | **找到代码级机制**：`src/main/crashLog.ts:37-38` 文件名 `crash-YYYYMMDD-HHMMSS-mmm.json` 毫秒精度、无碰撞防护 → 同一毫秒两次 `recordCrashEvent` 文件名相同、后者覆盖前者 → 「22 次写期望 20 个文件」与「files[0]==='crash #2'」翻车；:71-80 两连写同 ms 同理（长度 2→1）。与 R218 记录「一次 flake 重跑未复现」吻合（需温缓存快机才撞进同 ms）。**这同时是产品缺陷**：真实崩溃风暴同 ms 会丢档。修复（计数后缀或存在性重试）一举两得。高置信（纯代码推理） |

**中危组（固定 sleep，断言较宽）**：`AnnotateOverlay.test.tsx:88`(40ms)、`SnipView.test.tsx:112`(20ms)、`ttsDownloadPool.test.ts:42`(20ms)、`profileStore.test.ts:132`(10ms)、`useAudioAnalyzer.test.ts:54`(settle helper)。

**低危组（确定性或上界极宽）**：`logger.test.ts:31-45`（R163 已改按内容条件轮询）、`AiLabVisionTab.test.tsx:223-236`（fake timers）、`ai8ProviderSessions.test.ts:168-174`（5000ms 宽上界 + 本地 server）、`previewEngineWorker.test.ts:133`（合成时间戳）、`useVisionInput.test.tsx:121-135`（纯帧计数循环，无墙钟）、`AiLabVoiceTab.test.tsx:154,255`（setTimeout 0 宏任务排序）。

**配置面**：`vitest.config.ts` 全文无 `retry`、无 `pool/poolOptions`、无 `isolate`、无 `testTimeout` 覆盖——全部默认值。

### 4b. 「rAF 量子屏障」提升共享 helper

`tests/renderer/_helpers.tsx` 已是 renderer 测试公共入口（setupRendererMocks 所在）。方案：

```ts
// tests/renderer/_helpers.tsx 追加
/** rAF 量子屏障：resolve 即证明 ≥minTicks 个 rAF 回调执行过且 ≥ms 墙钟，
 *  同时返回实际 ticks——为 0 时调用方应 skip 时序前提失效的断言。 */
export const rafFrames = (ms = 90, minTicks = 2): Promise<{ ticks: number }> => ...
```

迁移路径：五份 frames() + quantum 变体 → 单一实现；**顺带把 :248/:266 的裸 60ms 换成 `await rafFrames(60, 1)`**（消灭最后一个已知高危残余）。约 0.5d。注释里保留饥饿原理（全量并发下 rAF 队列饥饿、屏障以「本 helper 的 rAF 得以执行」证明组件同帧循环跑过）。

### 4c. vitest retry 策略（利弊与建议）

- **全局 `retry: 1`**：利——CI 偶发红不再阻断；vitest 4 会把「重试后通过」标为 **flaky** 上报（dist chunks 含 flaky 统计，已确认存在）。弊——掩盖：若某真回归本身偶现，重试通过即漏检，且 flaky 计数无人盯就等于白配。
- **建议折中**：**全局不开**；对高危清单内 describe/it 用 per-test 选项 `{ retry: 1 }` + 注释链接机制（如「同 ms 碰撞，见 crashLog.ts:38」），retry 只救已知未根修项；每根修一个就从清单摘一个 retry。
- 配套：flaky 计数 > 0 视为黄灯，必须在当轮 R-N 里处置（修 or 记录），不允许长期挂着。

### 4d. flake 检测模式（本地冒烟档）

- `vitest run --repeat 5`（vitest 4 CLI 支持，已在 node_modules 确认）全量或定向：`yarn vitest run --repeat 10 tests/renderer/components/MiniGamesView.test.tsx`。建议加 `test:flake` script（需 R-N 改 package.json scripts，CLAUDE.md 允许专项 R-N 改）。
- 顺序耦合检测：`sequence.shuffle` + `sequence.seed` 固定种子复现法（排查模块级状态泄漏——setup.ts 的 static mock 实例数组 :125-131 每 beforeEach 清空，风险已控）。

### 4e. 并行负载时钟漂移与 transform 25s

- 根因结构：`setupFiles` 每**测试文件**跑一遍（vitest.config.ts:17）——151 文件 × setup（i18n/lucide/GL mock 注册）聚合 76s；transform 25s 冷缓存为主。
- **最大杠杆：`test.isolate: false`**（vitest 4 支持）——同 worker 复用模块图与 setup，预计显著压缩 setup 聚合开销；风险是跨文件状态泄漏，但 setup.ts:127-131 的 beforeEach 清理已覆盖主要 static 态。**未实测，需实验轮验证**（建议 R-N 内做 A/B 计时）。
- 次选：environmentMatchGlobs 分池（happy-dom 子集限并发）、`poolOptions.forks.maxForks` 降并发（直接降时钟漂移但拉长墙钟）。预编译（复用 electron-vite esbuild 产物）与 vite transform 管线不兼容，不建议深挖。
- 时钟漂移本身的测试面影响已被量子屏障范式吸收（4b 推广后），性能优化是第二收益。

---

## 5. 视觉/稳定性路线图（P0/P1/P2）

| 级 | 事项 | 工作量 | 预期收益（Likely） |
|---|---|---|---|
| **P0-1** | ui-snapshot 加 `page.emulateMedia({ reducedMotion: 'reduce' })` + 按规约一次性重立基线（§1.2 L1；同时补 per-view 就绪谓词替代裸 650ms：canvas/关键 selector 出现） | 0.5-1d | CSS 相位类假阳性（workspace 2.72% 一类）归零；慢机首帧未落定型假阳性大幅下降 |
| **P0-2** | crashLog 文件名同 ms 碰撞修复（`crashLog.ts:37-38` 加唯一后缀/存在性重试）+ 用例补同 ms 回归断言 | 0.5d | R218 记录的环境 flake 根除；真实崩溃风暴丢档的产品缺陷同时修掉 |
| **P0-3** | frames() 收编为 `tests/renderer/_helpers.tsx` 的 `rafFrames`，五处复制 + :248/:266 裸 60ms 全部迁移 | 0.5d | 已知最高危残余（rAF 饥饿）消除；范式有单一权威实现可文档化 |
| **P1-1** | 游戏态验证固化：r219-verify → `ui-games-verify.mjs`（阈值断言 + exit code + report JSON），running 态走几何/采样探针；ready 态作为 ui-snapshot 扩展视图入基线 | 1.5-2d | games 视图从「零运行态覆盖」到有可重复门禁；R219 类一次性脚本不再重复造 |
| **P1-2** | 基线治理规约落 R-N：MANIFEST.json 落盘 + update 模式前置 compare 提示 + 基线独立 commit 约定 + diff 证据拷贝惯例 | 0.5d | 基线变更可审计、可机器校验；「跑不过就重立」被流程堵死 |
| **P1-3** | flake 冒烟档：`test:flake`（--repeat）script + 高危用例 per-test `{retry:1}` + flaky 黄灯纪律 | 0.5d | 偶发翻车从「重跑碰运气」变为可检出、可归因 |
| **P2-1** | `isolate: false` 实验轮（A/B 计时 + 全量回归），视结果固化 | 1d | 全量 ~70s 有望明显压缩；并行时钟漂移源减弱 |
| **P2-2** | CI 扩档：ubuntu 跑无原生依赖测试分层；snapshot 上 runner 需先钉 DPR=1（CDP setDeviceMetricsOverride）+ temp user-data-dir | 2-3d | 门禁从「开发者本机」进 CI（ci.yml:3-5 注释明列此为 P2 意图） |
| **P2-3** | compare 失败自动复拍 best-of-2（min diff）| 0.5d | 残余偶发噪声（非 CSS 类）二次确认，假阴性风险极小 |
| **P2-4** | video/audio 重视图运行态探针化（对齐 games 模式）；Tetris/TD/Slash 扩 probe seam | 1-2d | 重视图内容正确性覆盖补齐 |

---

## 6. 已验证稳定（本轮取证）

- 基线 PNG 尺寸实测 1440×900（PNG IHDR 直读）＝CSS 尺寸，当前机器 DPR=1；SIZE 门在 DPR 不符时会大声失败（ui-snapshot.mjs:155-158）。
- `games.boxes.json`、dashboard、diagnostics、video、ai 均为 `[]`；games 运行态不在任何基线。
- app.css:8913-8919 存在全局 `prefers-reduced-motion: reduce` 动画 kill-switch（L1 方案的产品侧前提）。
- frames() 量子屏障在 MiniGamesView.test.tsx 的 5 处复制位置（:514/:650/:742/:856/:937）与 quantum 变体（:291）。
- crashLog 文件名毫秒精度、无同 ms 碰撞防护（crashLog.ts:37-38）；测试断言依赖文件数量与排序（crashLog.test.ts:59-80）。
- `.gitignore` 含 `docs/ui-baseline/current/` 与 `docs/ui-baseline/diff/`。
- CI 仅 typecheck（.github/workflows/ci.yml:13-23），test/snapshot 不在 CI（注释明说待平台矩阵）。
- vitest 4.1.7；dist 内确认存在 `--repeat` CLI 与 flaky 上报能力。
- r219-verify.mjs 无断言/exit 逻辑（:291 恒 `process.exit(0)`）——现状是取证脚本非门禁。
- git log：基线 PNG 历来随特性 commit 混提；45c6a5e/63e3a86b 提交信息含完整 per-view 漂移率（人肉实践已在）。
- 游戏循环墙钟 dt（MiniGamesView.tsx:1089,:1124）、暂停 dt=0（:1126）、仅每日挑战种子化（:1791）、backing 随 DPR（:1065-1082）。

## 7. 未验证项（诚实声明）

- workspace 2.72% 假阳性的**具体动画元素**：未启动应用，只有机制推理 + 候选清单（§1.2）；落地 P0-1 时用 diff 图归因即可闭环。
- `emulateMedia(reducedMotion)` 后各视图与现基线的等价性：需一次性重立 + 目检（预期漂移集中在带动画小件）。
- `isolate: false` 的实际提速与泄漏风险：纯方案，未实验。
- CDP `setDeviceMetricsOverride` 钉 DPR=1 在 connectOverCDP(Electron) 场景的实际行为：未跑。
- per-test `{retry:1}` 在 vitest 4.1.7 的确切行为（CLI 能力已确认存在，语法细节未实测）。
- 「裸 sleep 无就绪谓词」是否已实际造成过假阳性：无事故记录，属前瞻性加固。
