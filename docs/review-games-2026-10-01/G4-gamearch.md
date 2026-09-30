# G4 · 游戏架构专项评审（games/ 代码架构与工程质量）

评审人视角：资深游戏程序员（架构方向）。范围：`src/renderer/src/games/`（13 模块 9343 行）+ 壳 `MiniGamesView.tsx`（2939 行）+ 14 个测试文件（games 223 用例 + 壳 34 用例）。所有条目均亲读代码；file:line 以当前 main（93d365f）为准。只读评审，未运行任何脚本/应用。

---

## 摘要与评级

**总体：B+（良好，可演进）**。引擎纯 TS 无 DOM、可无头单测、共享 HUD/juice 骨架四作全复用、td 确定性波次、tetris commands 队列 + LAN 种子——这些是正确的骨架，值得保留。主要债务集中在四点：

1. **确定性承诺未兑现**：`daily.ts:4-6` 头注宣称「四作 Math.random 全量替换为 mulberry32」，实际只有 tetris 在 LAN 注入 seed；survival/slash 战斗随机仍走 `Math.random`，「每日挑战」没有共同棋盘（daily 种子只做当日记录校验）。
2. **phase gate 顺序缺陷（疑似真 bug）**：`tickSurvival` 中 boss 弹幕与敌方弹命中结算位于 `phase !== 'running'` 早退之前——升级选卡/轮盘冻结期间弹幕继续飞行并伤害玩家，与文件头「level-ups freeze the run」语义相悖。
3. **可变 dt 的帧率语义漂移**：碰撞隧穿（低帧率 DPS 损失）、摄像机平滑随刷新率变快、`Math.random() < dt*40` 在钳制帧恒真。
4. **合并安全结构风险**：survival.ts 2123 行单文件、`drawSurvivalBody` 350+ 行单函数靠注释分区与 restore 配对——R218 四 worktree 并行合并的绘制层错置回归正是这个结构的产物（R219.1 已修个案，根因仍在）。

---

## 1. 循环与确定性

### 1.1 可变 dt 的物理一致性（dt = min(0.05, (now-last)/1000)，`MiniGamesView.tsx:1025`）

速度类积分（`pos += v*dt`）期望上帧率无关，但离散事件随 dt 漂移。量化（亲算）：

| 项目 | 60Hz (dt=16.7ms) | 144Hz (dt=6.9ms) | 20Hz 掉帧 (dt=50ms, 被钳) | 后果 |
|---|---|---|---|---|
| 玩家子弹步长（420px/s，`survival.ts:1344`） | 7px | 2.9px | **21px** | swarm 判定直径 17.6px（`4+6*0.8`，`hitRadiusOf`），20Hz 时子弹可整格穿过 swarm 不命中 → 低帧率玩家命中率/DPS 下降 |
| 子弹步长（bulletSpeed 2 级 = 672px/s，`survival.ts:604`） | 11.2px | 4.7px | **33.6px** | 超过 chaser 判定直径 25.6px，连中体型敌人也会穿 |
| 摄像机收敛（`survival.ts:293` `alpha=min(1, 0.1*max(1, dt*60))`） | 0.1/帧，90% 收敛≈0.37s | **0.1/帧（`max(1,·)` 钳死），90% 收敛≈0.15s，快 2.4×** | 0.3/帧，≈0.35s | 2P+ 跟镜头手感随刷新率漂移；修复：`alpha = 1 - Math.pow(0.9, dt*60)` |
| 尾迹粒子（`survival.ts:1300,1381` `Math.random() < dt*40`） | p=0.67 → 40/s | p=0.28 → 40/s | **p=2.0 恒真 → 20/s** | <25fps 时尾迹密度减半；修复：`1 - Math.exp(-40*dt)` 或发射累加器 |
| slash streaks 衰减（`slash.ts:466-467` `*= 1-2.2*dt`） | 近似 e^-2.2t（-0.3%） | 更近 | **-12%** | 视觉小偏差，同类问题 |

敌方弹（170px/s，20Hz 步长 8.5px）与敌移速（22-132px/s）均小于判定直径，玩家侧不受隧穿影响——**伤害单向偏向低帧率玩家自己的输出**。

**fixed-timestep + accumulator 迁移成本**：现有测试全按可变 dt 书写（对 `tickX(s, 0.016)` 的数值锁），`0.016×n` 与 `n×(0.016)` 在阈值类逻辑（fireTimer/lockTimer/dropTimer）上不等价，数值锁会批量碎。改造点清单：四个 tick 入口内循环化、`MiniGamesView.tsx:1036/1076/1156/1182` 四个调用点、约 223 个用例中的时序类断言。**建议只对 survival（连续物理 + 隧穿受害方）做 60Hz 逻辑帧，td/slash/tetris 离散语义下先做「dt 语义收敛」（1.1 表中的公式修法）即可消除大部分漂移**。

### 1.2 确定性设计现状（逐作核实）

- **td**：无 gameplay 随机——`spawnBalloon`（`td.ts:295-313`）全部由 wave/queue 决定，词缀走确定性序列 `affixForWave`（`td.ts:364-369`，注释自证「确定性序列保证 LAN 双端一致」）。✅ 四作中唯一真确定性的战斗随机。
- **tetris**：`state.rng?: () => number`（`tetris.ts:150-152`），`initialTetrisState(seed)` 注入 `mulberry32`（`tetris.ts:256`），7-bag 洗牌走它（`refillBag` `tetris.ts:165-173`）。**但仅 LAN 开局传 seed**（`MiniGamesView.tsx:1799` `lanSeedRef.current ?? undefined`），daily/自由局 `seed=undefined` → 退回 `Math.random`。
- **survival**：15+ 处战斗 `Math.random`——生成位/边（`survival.ts:962-977`）、种类 roll（988）、elite（986）、swarm 包长/jitter（996-1002）、strafeDir（1030）、暴击（1343,1400）、掉落珠位（1153,1180）、复活落点（1581-1582）。`pickSpawnKindFrom` 本身是纯函数可注入 roll（183-193），但调用点传的是 `Math.random()`。
- **slash**：`spawnBlock` 的方向/敌型/速度/bonus（`slash.ts:224-238`）、spawn 间隔（499）全 `Math.random`。
- **daily 种子到底影响什么**（核 `daily.ts`）：`dailySeed()`（FNV-1a of UTC YYYYMMDD）**只**用于 `loadDaily` 的跨日作废校验（`daily.ts:51`）与记录回写（64-72）。`initialSurvivalState` 无 seed 参数、tetris 的 daily 局不传 seed——**「每日挑战」= 当日榜，不是共同棋盘**。`daily.ts:4-6` 头注的 OD-05「四作全量替换 mulberry32」与实现不符（PRD 中无 OD-05 条目，属规格-实现脱节）。

### 1.3 LAN Tetris desync 专项核查（重点项，结论：无 desync 缺陷，但有三个薄弱点）

同步模型（`MiniGamesView.tsx:1176-1206, 1588-1600`）：**双方各跑本地引擎，仅 `garbage`/`result` 事件耦合**，无共享模拟。因此：
- `applyGarbage` 的洞列 `holeColumn ?? Math.floor(Math.random()*COLS)`（`tetris.ts:949`）用 `Math.random` —— 但 garbage 只在**接收方本地板**生效，发送方不模拟对方板 → **不构成 desync**。本地双板（`duelB`，1183-1189）同理全本地。
- 薄弱点①：双方 piece 序列一致性完全悬于 `lanSeedRef`——host 建房随机生成（`LanPanel.tsx:74`）、guest 从 `welcome.seed` 收取（`lanProtocol.ts:48`；`MiniGamesView.tsx:1900,1909`）。初始时机由 join resolve 保护，当前无竞态；但**重开（R）无握手**：单侧重开后双方各自用同 seed 重初始化，若只有一侧重开则序列错位（「断线不恢复，重开即新局」注释自认此限制）。
- 薄弱点②：`state.rng` 是闭包、刻意不序列化（`tetris.ts:150-151`）——未来任何快照/回放序列化会**静默**退化为 `Math.random`，无类型层护栏。
- 薄弱点③：重力 `dropTimer += dt`（554）在双方各自可变 dt 下天然漂移——事件同步模型下这是合法漂移（各玩各的板），但若未来想做「观战对方板」或断线重连恢复，现有模型不支撑。

LAN TD 为另一模型：host 权威 + 15Hz JSON 深拷贝快照（`MiniGamesView.tsx:1037-1045`）+ guest `extrapolateBalloons` 恒速外推（1050-1052，钳 0.3s）。TD state 无 Set 字段，JSON 克隆不丢结构——该模型自洽（已验证无问题）。

---

## 2. 状态管理

### 2.1 SurvivalState 巨型可变对象（59 字段，`survival.ts:459-562`）

别名不变量清单：`player===players[0]`、`player2===players[1]`、`keys===inputs[0]`、`keys2===inputs[1]`、`axes.length===players.length`。**syncRoster 调用点完备性审计**（亲查全部写路径）：
- 引擎侧：`tickSurvival:1186`、`drawSurvival:1703`、`deployPlayers:732,773`——tick/draw 双入口覆盖每帧。
- 视图侧：`MiniGamesView.tsx` 仅**读** `player2`（1075 判 vision 门控、1263 判 BGM 危险态），不再直写（survival.ts:708-713 注释所述「视图直改 player2」已是历史；coop 人数变化走 `deployPlayers`，`MiniGamesView.tsx:1691`）。
- 测试侧：`survival.test.ts:403,422` 直改 `state.player2 = null`——legacy 路径有测试锁定（306-317 有别名断言）。
- 残余风险：任何对 `state.keys`/`state.inputs[i]` 的**整体赋值**（`new Set()`）会断链——当前代码无此写法（已 grep 验证），但无类型层护栏，纯靠约定。

**双刃剑判词**：突变单对象换来零 GC 的 60fps tick，这个选择本身合理；问题不在「可变」而在「无历史」——死亡回放、每日种子校验（同 seed 复算分数）、断线重连全做不了。

### 2.2 迁移成本收益：不做不可变化，做 command/event-log

tetris 已示范了正确的形状：离散输入走 `commands` 队列（`tetris.ts:126,536-538`），持续输入走键池。survival 的 tick 输入也是键池+轴。**补上 rng 注入（1.2）后，四作天然具备确定性回放的前置条件**，无需把 2123 行突变代码改成不可变——那是高成本低收益（1158 行测试数值锁全碎）。快照式 undo 也不必做：回放 = 同 seed + 同输入日志重跑，比状态快照更省。

### 2.3 顺带发现的真 bug 候选（P1）：levelup/roulette 冻结期间弹幕仍在伤害

`tickSurvival` 顺序：boss 弹幕发射（1196-1203）→ eBullets 移动/过滤（1205-1210）→ **eBullets 对存活玩家命中结算（1211-1234，可致 `phase='lost'`）** → … → `if (state.phase !== 'running') return`（1263）→ 敌人移动/spawn/XP 等在 gate 之后。
- 触发：boss 战中拾 XP 珠进 `levelup` 选卡（或开轮盘 `roulette`）。
- 后果：冻结期间 boss 每 1.2s 继续齐射、弹幕继续飞行并扣血/击倒玩家——与文件头（`survival.ts:2-3`）「level-ups freeze the run for a pick-one-of-three upgrade card」直接矛盾。玩家站着读卡被弹幕打死。
- 测试盲区佐证：`survival.test.ts` 无 levelup+barrage 组合用例（grep 核实）。
- 修复：把 1196-1235 整块移到 1263 之后（或 gate 提前到 1196 前、保留 juice/粒子衰减）。
- 置信度：行为**高**（代码路径直读）；「非预期」**中高**（头注为证，但不排除刻意保留压迫感——判词：即便刻意也应写注释+测试锁定）。

次生小项：`advanceIsland`（881-897）清 enemies/bullets/orbs 但**不清 eBullets**——boss 死后残余弹幕带进新岛。

---

## 3. 引擎-视图契约

### 3.1 draw 直读可变 state（四作一致）

单线程下安全，但两处已产生实际代价：
- **draw 侧含索敌逻辑**：`drawSurvivalBody` 对每个 sprinter/shooter 调 `nearestAlive`（`survival.ts:1917,1940`）——绘制帧 O(敌数×存活玩家) 重复计算，且与 tick 的索敌逻辑（1476）双份维护。修复：tick 时缓存 `enemy.heading` 字段，draw 只读。
- **worker 渲染被阻**：draw 依赖活 state 引用 + `Math.random`（震屏 `applyShake` `hud.ts:214`、tetris `tetris.ts:733`），未来 OffscreenCanvas worker 化需先解决引用共享——当前架构下做不了，属于「现状无 bug 但封死了路」。

已达标的纯函数范式（可作为标杆）：`scene.ts`（头注硬约束「确定性 sin 哈希、无模块级可变状态、可快照/回放」，`hash` 44-47）；`hud.ts`（除 applyShake 外全部纯绘制）；`juice.ts`（hitStopTick/tickWarnings/tickTrail 纯步进）。**未达标的**：tetris 的 toast 差分放在 draw 里（`tickFx` 672-687 + WeakMap 旁路 `TETRIS_FX` 660）——「绘制层局部状态」的取舍有注释论证（646-651），可接受，但它是引擎外挂状态的先例，第五作若复制此模式要警惕。

### 3.2 sfs 引擎内直调（引擎不纯的唯一点）

耦合点计数（亲 grep）：survival 17 处 `playSfx`、tetris 10 处、td 9 处、**slash 0 处**——slash 的音效全在 view 层（`MiniGamesView.tsx:1378-1379`）。`sfx.ts` 持模块级可变（`lastPlayed` 节流表 9、`audioCtx` 11、enabled）→ 引擎 tick 非纯函数：同输入不同副效。后果实例：`MiniGamesView.test.tsx:20-26` 被迫整体 vi.mock sfx 才能跑断言。
**改法（低风险）**：tick 返回/累积 `SfxEvent[]`（或 state.events 出队），view 层统一播报——slash 已是此形状，survival/td/tetris 的 36 处调用改签名即可，测试同步简化。这是「引擎纯化」性价比最高的一步，也是回放/worker 的前置。

### 3.3 publish 快照是浅拷贝（纠正线索块）

`publishSurvival`（`MiniGamesView.tsx:586-588`）：`{...state, keys:new Set(...), enemies:[...]}` —— 数组是**引用拷贝**（enemy 对象共享），`eBullets/particles/texts/players` 连数组都不拷；`publishTetris`（590-592）的 `grid` 完全共享。0.18s 发布给 React 的「快照」与引擎共享嵌套可变对象，非隔离快照。实际撕裂风险低（React 侧读的是 `phase/score/offers` 等标量谓词），但契约上是假快照——若有人日后在 React 侧遍历 `snapshot.enemies` 做重活，会读到引擎半帧状态。修复：发布窄化 DTO（只发 React 需要的标量字段），顺带解决已知的「0.18s 全树重渲」的负载（不重复报）。

---

## 4. 四作复用矩阵（实测 import + 调用计数）

| 共享件 | survival | tetris | td | slash | 备注 |
|---|---|---|---|---|---|
| hud.ts（capsule/healthbar/vignette/toast/按钮） | ✔ 4 capsule/4 血条 | ✔ 6/1 | ✔ 3/2 | ✔ 0 capsule/2 血条 | slash 保 dojo 自有风格，只取血条/vignette/float——合理取舍 |
| juice.ts（hitStop/shake/float/trail/warnings） | ✔ | ✔ | ✔ | ✔（独用 trail） | 四作全复用，质量最好的一件 |
| sfx.ts（playSfx/BGM 预设） | ✔ 引擎内 | ✔ 引擎内 | ✔ 引擎内 | ✔ **view 层** | 调用位置不统一（3.2） |
| scene.ts（六场景） | ✔（唯一接入方） | ✘ | ✘ | ✘ | R213 场景系统只接了 survival |
| daily.ts（mulberry32/种子） | ✘（无 seed 参数） | ✔ 仅 LAN | ✘（无需） | ✘ | 1.2 节 |

**复制而非复用的实证**：900×520 常量三处定义——`td.ts:141-142`（WIDTH/HEIGHT）、`slash.ts:25-26`（自有 WIDTH/HEIGHT）、`hdCanvas.ts:15-16`（LOGICAL_W/H）；且 survival/tetris **反向依赖 peer 游戏 td 的常量**（`survival.ts:6`、`tetris.ts:6`）——层级倒置，td 变更会波及无关游戏。

**新游戏接入的真实改动清单**（对照壳层）：`Screen`/`GameKey` 联合 + `BEST_KEYS` + `ONBOARD_STEPS` + 主循环 if-else 分支 + 键盘路由分支 + coach hints + BGM 预设 + 难度表——screen 判断在壳层 grep 命中 46 行。无注册表（已知问题不重复报），此处补量化：约 8 类接触点/46 处分支/每作一份数千行 state shape。

**注册表接口草案**（利用仓内已有先例的编译期护栏风格——`BGM_PRESETS: Record<string, BgmPreset>` `sfx.ts:130`、`SURVIVAL_DIFFICULTY_PARAMS: Record<GameDifficulty, …>` `survival.ts:74`）：

```ts
interface GameModule<S> {
  id: GameId
  create(seed?: number, difficulty: GameDifficulty): S
  tick(s: S, dt: number): SfxEvent[]        // 3.2 的出参
  draw(ctx: CanvasRenderingContext2D, s: S, view: GameViewCtx): void
  hints(s: S): CoachHint[]
  settle(s: S): { score: number; highlight: string }
  bgm: keyof typeof BGM_PRESETS
}
const GAMES: Record<GameId, GameModule<never>> = { ... }  // 缺一作即编译错
```
壳层 46 处分支收敛为表驱动 + 每作一个 module 文件——这同时是合并安全的解法（每作的改动落在不同文件，天然无冲突面）。

---

## 5. 测试盲区

**先纠正线索块的悲观估计**（亲查 14 文件）：spawn 权重分布有全扫 roll 用例（`survival.test.ts:582-607`，2000 点覆盖 8 种）；boss 弹幕四型轮转有锁定（716-728）；reviveOrbs 有多人路径用例（256-269, 375-392）；LAN seeded bag + garbage roundtrip 有专测（`tetris.test.ts:383-465`）；`extrapolateBalloons` 在 td.test 覆盖。这五项不在盲区。

**真盲区（按风险排）**：
1. **levelup/roulette × 弹幕共存**（2.3 的 P1 候选）零用例——freeze 语义无锁。
2. **帧率语义零覆盖**：0.05 钳、摄像机 alpha、`dt*40` 概率、隧穿——没有任何测试以不同 dt 断言等价性。建议加「dt 不变性」参数化测试族（同模拟时长、不同切分，断言宏观量容差）。
3. **绘制只断言不炸**：`drawTetris` 用例是 `not.toThrow()`（`tetris.test.ts:596`）；survival 的 R219 绘制测试（1071-1152）锁了部分层序——这是好开始，但动画中间态（如摄像机变换下的实体坐标）无断言。
4. **性能回归无锁**：帧成本无 CI 阈值；`bench-engine.cjs` 已在 temp 目录存在（本次未复核内容），建议清洗后入库为 `tests/bench/`，对四作 tick+draw 各设预算上界（如 survival 满场 ≤1.5ms/帧）。
5. slash 敌型混入的嵌套概率分支（`slash.ts:228-231`）只有端到端行为覆盖，无分布断言。

**顺带的小 bug（测试可顺手锁）**：`tetris.ts:352-353` `lockPiece` 消行后**连续两行 playSfx**（重复播放）；`tetris.ts:514-520` dt===0 分支的粒子循环是 no-op（`x += vx*0; life -= 0`）而注释声称「特效仍以真实时间衰减」——注释与代码相反。
**commands 队列契约缺口**：非 running 相位 drain 在 early return 之后（`tetris.ts:535-538`），而键盘（`MiniGamesView.tsx:1381-1385`）与 vision（863-867）push 无相位门 → 'ready'/'won' 期间按键自动重复会积压；重开路径靠整体换 state 兜底（1797-1800），但 **'won' 相位不在重置条件内**，won 后按 R 的路径需人工复核（未验证项）。

---

## 6. 合并安全（R218 根因分析）

已核事实链：R218 四 worktree 并行（PRD R216.5：A1 手柄轴改 survival.ts、A2 LAN Tetris、A3 客端插值等分域）→ 合并后 R219.1 修「粒子/玩家/飘字被画在 restore 之后」（`survival.ts:1993-1995` 注释自认）；`hud.ts:229-233` 记录 R218 skeleton commit 曾**整段丢失 exports** 致 typecheck 破——第二例。

**结构性根因**：`drawSurvivalBody`（1755-2108）是 350+ 行单函数，世界层（save/translate/scale/restore 配对，2041 的 restore 是唯一分界）与 HUD 层靠**注释分区**维持；多人并行改不同关注点（背景缓存/摄像机/HUD/juice）都会动同一函数体的相邻区段，restore 配对一旦被平行插入打乱就是 R219.1 那类回归。`tickSurvival`（1184-1612，430 行单函数）同理——2.3 的 phase gate 问题本质上也是「子系统块插入位置无结构护栏」的产物。

**缓解方案（增量）**：① 把 `drawSurvivalBody` 拆为 `drawWorldLayer(ctx, state)` / `drawHudLayer(ctx, state)` 两个导出函数（save/restore 各自封闭），层序测试改为直接断言两个函数的调用顺序与各自内部 restore 平衡；② `tickSurvival` 按子系统拆 `tickBarrage/tickPlayers/tickEnemies/tickPickups` 私有函数，phase gate 集中在入口处一处的显式矩阵（phase × 子系统），2.3 的 bug 在这个表里会一眼暴露；③ 终态是第 4 节的注册表——每作独立文件，冲突面自然消失。

---

## 7. 架构演进路线（按 ROI 排序，均可独立成 commit）

| # | 项 | 尺寸 | 动机 | 做法（增量步骤） | 风险 |
|---|---|---|---|---|---|
| 1 | **phase gate 前移弹幕块** | S | 修 2.3 疑似 P1 | 移动 `survival.ts:1196-1235` 到 1263 后 + 补 levelup×barrage 测试；顺手 `advanceIsland` 清 eBullets | 低；若行为原是刻意，测试先锁定再议 |
| 2 | **rng 注入三作** | S | 兑现 daily 承诺、开回放之门 | 仿 `tetris.ts` 的 `state.rng`：survival/slash 加 `rng?` 字段，战斗随机全走它；daily 开局传 `dailySeed()`；修正 `daily.ts:4-6` 头注 | 低：默认 undefined → Math.random，行为零变 |
| 3 | **dt 语义收敛** | S | 跨刷新率一致 | 1.1 表三项公式化（exp 概率 / pow 平滑）+ 「dt 不变性」参数化测试 | 低：个别数值锁 ±ε 调整 |
| 4 | **sfx 出引擎** | M | 引擎纯化；去 test mock；worker/回放前置 | tick 出参 `SfxEvent[]`（slash 已是此形状）；36 处调用改签名；`MiniGamesView.test.tsx` 撤 mock | 中：survival/td/tetris 触点广，但机械 |
| 5 | **draw/tick 分层拆分** | M | 合并安全（§6）+ draw 侧 O(n·m) 索敌 | `drawSurvivalBody` → world/hud 两函数；`nearestAlive` 出 draw（tick 缓存 heading）；层序测试 | 中：R219 已有绘制测试需迁移 |
| 6 | **游戏注册表** | M | 第五作接入成本、消除 46 分支 | 第 4 节接口；先迁 td（state shape 最简）验证，再逐作迁 | 中：壳层 2939 行动大刀，需分作 PR |
| 7 | **fixed timestep（仅 survival）+ 确定性回放** | L | 隧穿根除 + 死亡回放/每日校验 | 依赖 #2/#3/#4 完成；60Hz accumulator + 渲染插值；测试数值锁重铸 | 高：223 用例时序断言批量影响 |

**值得保留（明确不动）**：纯 TS 引擎 + 可无头测试（CLAUDE.md 铁律的既得利益）；`scene.ts` 确定性 sin-hash 范式；`juice.ts`/`hud.ts` 纯函数骨架；tetris commands 队列输入模型；td 确定性波次 + LAN host 权威快照模型；survival 突变单对象 + ref 通道（性能正确取舍）。

---

## 8. 已验证无问题

- **syncRoster 别名不变量**：调用点完备（tick/draw/deployPlayers 双入口每帧），view 只读 player2，测试有别名断言（`survival.test.ts:306-317`）。
- **R219.1 绘制层归位**：粒子/涟漪/玩家/飘字确认在摄像机层内（`survival.ts:1996-2039`），与注释一致。
- **LAN Tetris 无 desync**（1.3 核查结论）：事件同步模型自洽，`applyGarbage` 的 Math.random 仅本地生效。
- **LAN TD 快照模型**：JSON 深拷贝不丢结构（GameState 无 Set/闭包），guest 不 tick 本地引擎（1036），外推只影响视觉。
- **hitStopTick 冻结语义**（`juice.ts:20-26`）：冻结期间 dt=0、恢复不注入溢出——正确实现且四作统一。
- **tetris 规则实现**：SRS 双踢墙表（JLSTZ+I 全 16 向）、T-spin 三角判定（写入网格前判）、7-bag、lock delay 15 次上限、B2B/连击矩阵——与 guideline 一致（逐表核对）。
- **摄像机数学**：zoom-to-fit 钳制、死区、世界边界退化（世界小于视口退中心，`survival.ts:302-306`）、1P 固定视口与 2P+ 部署基准（733-754）自洽。
- **难度四档伤害取整**：`enemyContactDamage` 的 max(1, round) 与注释口径一致（casual/hard=1、insane=2）。

## 9. 未验证项 / 局限

- 未运行应用/测试（约束）；§1.1 全部为算术推演，无 144Hz/20Hz 实机采样。
- `MiniGamesView.tsx` 精读约 1200 行（主循环/输入/LAN/发布/开局路径）；R211 fs 画布 HUD 按钮体系与 hub JSX 未逐行。
- `swarmMeta.ts` 轮盘权重细节、`coach.ts`、`main/lanService.ts` 传输层（seq/resume 语义、UDP/TCP）未深查——LAN 断线恢复的完整性结论仅基于 renderer 侧注释。
- tetris 'won' 相位后的 R 重开路径（5 节末）未复现验证。
- `bench-engine.cjs`（temp）内容未复核，仅据任务线索引用。
