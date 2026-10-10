# G3 游戏代码架构评审（当前状态）· 2026-10-10

> 对象：`main@6ebdce8`（分支 review/vision-gesture-commercial）。承接 docs/REVIEW-GAMES-2026-10-01.md G4（当时评 B+），不重复已修项（纯 TS 无头引擎、R220.5 种子化 RNG、四件套复用均已核实仍在位）。
> 代码量核实：`src/renderer/src/games/*.ts` 6616 行（12 文件）+ `MiniGamesView.tsx` 3126 行 + `components/games/` 子组件 398 行。
> 置信度：Confirmed=代码路径逐行核实；Likely=推断待真机验证。

---

## 1. MiniGamesView.tsx 3126 行——已过必须拆的阈值

### 1.1 现状结构（行分布，均 Confirmed）

| 区块 | 行号 | 行数 | 内容 |
|---|---|---|---|
| 模块级常量/pref 读写 | 119-275 | ~157 | ONBOARD_STEPS、8 个 localStorage 读写函数 |
| 组件头：ref/state 声明 | 277-565 | ~290 | **77 个 useRef、55 个 useState** 集中声明 |
| pollGamepad | 715-771 | 57 | 手柄轮询 |
| pollVision | 811-1005 | **195** | 视觉输入分发（四作 if/else 链） |
| 游戏循环 effect | 1087-1435 | **349** | loopBody 本体 290 行（1139-1428）+ rAF 护栏 + HD sizing |
| 键盘 down/up effect | 1437-1541 | 105 | 四作键位分发 |
| start/restart/roulette 等 | 1807-1971 | ~165 | 各作开局/重开/结算回调 |
| hub 早退分支 JSX | 1990-2144 | 155 | hub 全部 UI |
| fs HUD 绘制 | 2238-2360 | **123** | fsDrawRef 100 行 + fsStatusLine×2 |
| 游戏 JSX 主 return | 2362-3125 | **764** | header/统计条/ready 面板/浮层/侧栏 |

Hooks 总量：**useRef×77 / useState×55 / useEffect×20 / useCallback×35**（grep 声明计数核实）。对照项目自身先例：App.tsx 是 R147 从 2976 行拆到 ~700 行「编排层」的，MiniGamesView 3126 行已回到 App 拆分前的量级——**按项目自己的标准，阈值已过**（Confirmed）。

### 1.2 上次标的 350 行 draw 函数现状

- `survival.ts drawSurvivalBody` 1910-2266 ≈ **356 行**，未拆（上次 G4 标 350 行，原地未动）。
- 新债务：`survival.ts tickSurvival` 1280-1769 ≈ **490 行**单函数，已超过当年那个 draw，是全 games 域最大函数。R220.1①（弹幕冻结修复）就是在这 490 行里挪代码块挪出来的事故温床实证。
- 次大：`slash.ts drawSlash` 513-791 ≈ 278 行；`td.ts drawGame` 685-859 ≈ 174 行；`tetris.ts drawTetris` 720-887 ≈ 167 行。

### 1.3 该拆什么（按收益排序）

该文件同时承担四种角色，拆分即按角色切：

1. **游戏壳（运行时循环）→ `hooks/useGameRuntime.ts`**：loopBody + rAF 护栏（R221.4）+ ResizeObserver/HD sizing（R217/R219.8）+ bgCache + BGM 张力。这是唯一碰 canvas/rAF 的层。
2. **输入枢纽 → `hooks/useGameInput.ts`**：pollGamepad + pollVision + keydown/keyup + releaseAllEngineInputs（R220.1⑨）。195+105+57=357 行，与循环解耦后各自可单测。
3. **共享 fs HUD → `games/fsHud.ts` 纯函数**：fsDrawRef 那 123 行（含 Swarm 三选一/TD 商店/死亡结算画布化），输入全为 ref 快照，天然可无头测（对齐 hud.ts 模式）。
4. **视图路由 → 保留在 MiniGamesView**：screen switch + JSX 装配，收敛到 ~400 行以内。hub 分支（155 行）与 ready 面板（~160 行 JSX + ReadyPrefs）各拆子组件（对齐 R147 lazy view 先例，**不引入路由库**——CLAUDE.md 约束）。
5. **各作结算 → `domain/`**：finishSurvivalRun/settleBest/recap 组装。

历史事故三连均为该文件「单文件多角色 + 手工闭包接线」的直接产物：R219.1 绘制层错位（多 worktree 合并）、R220.1⑦ BGM deps 重启、R221.7 每帧清键（Confirmed，见 §4）。**拆分本身是行为无变更重构，但按 CLAUDE.md 仍需 R-N 条款承载。**

## 2. 测试覆盖：数字、盲区与门禁缺口

测试实际位于 `tests/renderer/games/`（任务书写的 `tests/games/` 不存在）。

| 引擎 | 行数 | 测试用例 | 测试行数 | 密度（例/百行） |
|---|---|---|---|---|
| survival.ts | 2281 | 79（+swarmMeta 15 +swarmEvolve 7 +autoPick 8 ≈ 109） | 1254（+182+105+58） | 3.5-4.8 |
| tetris.ts | 968 | 32 | 644 | 3.3 |
| slash.ts | 813 | 25 | 383 | 3.1 |
| td.ts | 892 | 22 | 320 | **2.5（最低）** |
| scene.ts | 434 | 9 | 163 | 2.1 |
| MiniGamesView.tsx | 3126 | 35（组件级，happy-dom） | 963 | 1.1 |
| main/lanService.ts | 394 | **0** | — | **0（零单测）** |
| shared/lanProtocol.ts | 165 | 12 | 142 | 7.3 |

关键发现：

- **F-2.1（Confirmed）`src/renderer/src/games/**` 不在 vitest coverage include 内**（vitest.config.ts coverage.include 仅列 engine/shared/main/preload/components/hooks/workers/vision）。6616 行纯 TS 引擎的行覆盖率**从未被度量、无阈值门禁**——「可无头测」的能力存在，但覆盖率红线缺失。R234 给 vision 层定阈值的先例（91/83）可直接复制到 games 层。
- **F-2.2（Confirmed）LAN 全链零渲染层/服务层测试**：MiniGamesView.test.tsx 35 例无一涉 LAN（host 15Hz 快照推送 MiniGamesView.tsx:1167-1176、guest 插值 1180-1182、onLanEvent 分发 1719-1761 均无覆盖）；tests/main/ 无 lanService.test.ts。上次评审「LAN 无 desync」结论采信的是事件同步模型 + lanProtocol 12 例，服务端（beacon/resync/SnapTracker/epoch 世代）无回归锁。
- F-2.3（Confirmed）survival 域覆盖质量高：确定性回归锁（同种子 600 tick 逐位一致，R220.5）、绘制层顺序回归（R219.1）、冻结语义（R220.1①）、团队血池（R223）均有专测。td 相对最薄：endless/blitz/词缀 regen·armored 交互无组件级用例。

## 3. 引擎 API 契约：tick 已统一，start/draw/dispose 未契约化

四作签名核对（Confirmed）：

| | initial | start | tick | draw |
|---|---|---|---|---|
| td | `initialState(difficulty)` | **无**（view 层 1616-1643 手工 phase='running'+launchWave+难度覆写） | `tickGame(s, dt)` ✅ | `drawGame(ctx, s, selectedTowerId, best, labels)` |
| survival | `initialSurvivalState(char, perm, artifacts, difficulty)` | `startSurvival(s)` | `tickSurvival(s, dt)` ✅ | `drawSurvival(ctx, s, bgSource?)` |
| tetris | `initialTetrisState(seed?, difficulty)` | `startTetris(s)` | `tickTetris(s, dt)` ✅ | `drawTetris(ctx, s, best, labels, opts)` |
| slash | `initialSlashState()`（难度不在此） | `startSlash(s, seconds, difficulty)` | `tickSlash(s, dt)` ✅ | `drawSlash(ctx, s, time)` |

- **tick 四作完全统一 `(state, dt)`**——这是最成功的一条（Confirmed）。
- **dispose：四作均不存在**。引擎是纯状态机无资源句柄，dispose 语义（cancelAnimationFrame/stopBgm/键池释放）由 view 层承担且已收敛到 releaseAllEngineInputs（697-705）。缺的不是 dispose 实现，是**契约类型**。
- phase 类型四套独立联合（td 有 'won'、slash 无 'won'、survival 多 'levelup'/'roulette'），view 层用手工大联合 currentPhaseRef（524、2201-2208）对齐。
- **无 `GameEngine` 接口/注册表**。接入第五游戏需改 MiniGamesView ≥10 处 switch（Screen 类型 144、BEST_KEYS 147、ONBOARD_STEPS 119、loopBody 分支 1163-1343、keydown/up 1446-1529、pollVision 854-1003、fsDrawRef/fsStatusLine 2238-2360、startAny/restart 2175-2176、ready JSX 2585-2746、ReadyPrefs 236-251）——**新游戏接入成本 = 在 3126 行里穿针 10 次**（Confirmed）。上次 G4 演进路线的「注册表」一步未落地。
- 建议最小契约（不动引擎、只加适配层）：`interface GameAdapter<S> { initial(cfg): S; start(s, cfg): void; tick(s, dt): void; draw(ctx, s, env): void; phase(s): CommonPhase; hints(s): CoachHint[] }` + 注册表对象。loopBody/pollVision/键盘三处的四分支即可收敛为查表，~150 行净减，且 view 层拆分（§1.3）的前置条件就是它。
- **scene.ts 复用度 = 1/4**：唯一 import 方是 survival.ts:8（Confirmed）。td/slash 各自内嵌道场背景。它名为通用场景抽象、实为 survival 专属皮肤模块；不构成接入成本，但「共享层」名义与事实不符，文档/后续评审应按 survival 私有资产看待（或反向把 td/slash 背景迁入——收益低，不建议）。
- 四件套复用核实：hud.ts 四作全导、juice.ts 四作全导、sfx 三作导（**slash.ts 零 playSfx**——音效由 view 层代发 MiniGamesView.tsx:946-948/1496-1497，与其他三作「引擎内发声」不对称，Confirmed）。
- 风格债：`survival.ts:2270`、`td.ts:857`、`slash.ts:125` 的 import 语句出现在**文件尾部**（ESM hoisting 合法但反常规）——四件套接线时尾部追加的痕迹，可读性坑（Confirmed）。

## 4. 状态管理：77 ref 的三种形态与清理完整性

### 4.1 ref 分类（Confirmed）

1. **引擎状态 ref**（5+1）：tdStateRef/survivalRef/tetrisRef/tetrisBRef/slashRef/lanSnapRef——ref 持引擎、0.18s 快照 publish 成 state 供 DOM，这是正确模式（帧数据不走 state，符合项目「帧走 ref」约定）。
2. **state↔ref 手工镜像 ≈18 对**：fsPaused、tdSpeed、selectedTowerId、fullscreen、slashDuelOn、swarmPlayers、swarmScene、tetrisDuelOn、tdBlitzOn、swarmSprintOn、swarmDailyOn、tetrisRaceOn、slashBurstOn、lanRole、lanGame、screenScale、focusMode、duel、bgmOn、keyMap、p1KeyMap、avatars、meta、screen、autoPickMode（`xxRef.current = xx` 渲染期赋值）。每对都是「声明+镜像赋值」两处手工，漏写即闭包读到过期值——R220.1⑦ 的 BGM 重启正是这类。
3. **late-binding 回调 ref ≈12 个**：startRunRef/startTetrisRef/slashStartRef/backToHubRef/padStartRef/startAnyRef/buildTowerAtRef/fsActionRef/fsDrawRef/selectedTowerActionRef/chooseUpgradeRef/currentPhaseRef/rouletteActionsRef——解决「声明顺序」问题的手工 pattern，默认值全是 `() => undefined`，**任何新路径忘接线 = 静默 no-op 零报错**（Confirmed，结构性风险）。

更优模式（不引库，符合项目约束）：a) 一个 `useLatest(v)` 工具 hook 消掉 18 对镜像（~40 行减半）；b) §3 的 adapter 注册表让 currentPhaseRef/startAnyRef 查表化；c) late-binding 收敛为单一 `actionsRef` 容器对象（一次赋值、字段缺省告警）。

### 4.2 phase/zone 切换清理完整性

已修闭环（Confirmed，均有测试锁）：backToHub 中途弃局结算（R220.1⑧ 1578-1592）、keydown effect cleanup 释放全部键池（R220.1⑨ 1536-1539）、vision 下降沿释放（R221.7 817-823）、startSurvivalRun 对 levelup/roulette 静默 guard（R219.3 1810）、restartSurvivalRun 补 scene/sprint（1852-1859）。清理面基本完整，残留两个洞：

- **F-4.1（Confirmed，建议修）slash 的「重开」按钮落错分支**：`restartHandler = isTd ? restartTd : isSurvival ? restartSurvivalRun : restartTetrisRun`（2176）——isSlash 时 fallthrough 到 restartTetrisRun。工具栏「重开」（2450）、fs 暂停浮层「重开」（2786）在 slash 界面点击会**重置 tetris 引擎而 slash 引擎不动**：用户感知「重开无效」，且下次进 tetris 被静默回 ready 初始态。slash 缺自己的 restart（fixed 60s 局语义可辩，但按钮就不该出现/该走 startSlashRunCb）。
- **F-4.2（Confirmed，小）restartTetrisRun 丢难度**：1959-1963 `initialTetrisState()` 无参调用，difficulty 回落 'standard'；对照 startTetrisRun（1927）与 restartTd（1646）都带 readDifficulty。insane 档玩家重开后难度静默降档。
- F-4.3（Likely）hub 早退分支（1990）之前的 290 行声明全量挂载：hub 不需要 survival 元进度/轮盘状态但全部活跃。纯内存成本可接受，但意味着「hub 也依赖游戏域状态」，是 §1.3 拆分时需要显式切断的耦合。

## 5. LAN/合作与单机路径的耦合度

- 量化：MiniGamesView 内 LAN 标识符命中 **81 行/72 处**（lanRole/lanSnap*/lanPeers/lanGame/lanSeed/lanCmd/onLanEvent/lanNotice/lanTetrisScore/LanPanel，Confirmed）。
- 形态：**条件分支织入式**而非隔离层——同一 loopBody 内 host 推快照（1167-1176）与单机 tick（1166）用 `lanRoleRef.current !== 'guest'` 一行分隔；keydown Q 键 guest 上行（1447-1450）与本地施放（1450）并排；click 的 guest build 上行（1793-1798）；onLanEvent effect（1719-1761）是唯一集中点；外加按钮禁用 3 处（2446/2450/2587）+ padStartRef 客端拦截（2213）。
- 引擎侧：td.ts 为 LAN 专设导出 extrapolateBalloons（884）；tetris.ts 的 applyGarbage/garbageFor 双用（本地双板+LAN）。引擎保持纯函数、无 lanService 依赖——**引擎层解耦是干净的（Confirmed）**，耦合全部堆积在 view 层。
- 判定：单机默认路径（lanRole='idle'）行为等价、可测；但 LAN 分支本身是 view 层 8+ 处散布的不可测逻辑（§2 F-2.2）。建议抽 `useLanSession()`（role/game/seed/notice + onLanEvent 分发器 + cmd 上行封装）与 `games/lanBridge.ts` 纯函数（cmd→引擎调用、snap→ref 写入），两块都可无头测，view 内 LAN 命中预计 72→<15 处。
- main 侧 lanService.ts 394 行零单测（§2），UDP/beacon/resync 是其独占职责——补测优先级高于 view 层 LAN 分支。

## 6. 结论与建议批次（供立项 R-N 参考）

| # | 项 | 规模 | 置信度 |
|---|---|---|---|
| 1 | GameAdapter 契约 + 注册表（§3）——view 四分支查表化，是后续一切拆分的前置 | M | Confirmed（收益路径明确） |
| 2 | MiniGamesView 四角色拆分（运行时 hook/输入 hook/fsHud 纯函数/视图装配，§1.3） | L（分 3-4 个 R-N） | Confirmed（阈值已过，App.tsx R147 先例） |
| 3 | coverage include 补 `src/renderer/src/games/**` + 定阈值（现状 0 度量，§2 F-2.1） | S | Confirmed |
| 4 | lanService.ts 单测 + useLanSession/lanBridge 抽取（§2 F-2.2/§5） | M | Confirmed |
| 5 | survival tickSurvival 490 行分块（update/move/spawn 三个子 pass）、drawSurvivalBody 356 行分层 | M | Confirmed（合并事故温床实证） |
| 6 | 即修三小件：slash 重开落错分支（F-4.1）、restartTetrisRun 丢难度（F-4.2）、文件尾 import 归位（§3） | S | Confirmed×3 |

上次 G4 评 B+。本轮架构基本面（纯引擎/确定性/复用件）保持，但 9 天内 R219-R223/R246-R250 约 10 轮修补全部倾注在 MiniGamesView 单文件上（3126 行内 77 ref），**集中度风险在上升而非收敛**：每次修复都以「再加一个 ref/一个分支」落地。当前是「B+ 且趋势向下」——上表 1+3+6 是低成本止血件，2+5 是结构性偿还。
