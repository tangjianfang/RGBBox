# G2 · Juice/渲染 专项复审（2026-10-10）

> 对象：`review/vision-gesture-commercial@6ebdce8`。评审人视角：游戏 Juice/渲染工程师。
> 上轮（2026-10-01）已修项不重复报：shadowBlur 清零（残留 1 处见 §5-H1）、假发光、HUD 血条渐变缓存（hud.ts:73-85）、survival 静态背景离屏缓存（MiniGamesView.tsx:1232-1246）、R217 DPR 窗口态、alpha:false（MiniGamesView.tsx:1093）。
> 方法：全量精读 games/ 引擎 + MiniGamesView 循环 + app.css 画布规则；**真实引擎 headless 模拟**（esbuild 打包 tick+draw + 计数 stub ctx，Node 23 桌面 CPU；脚本与原始输出同目录 `sim-entry.ts` / `sim.cjs`）。置信度：Confirmed=代码+数据双证 / Likely=代码证+运行时推定 / Speculative=推定。

---

## §1 R217 DPR 落地后的性能边界（Q1）

**边界结论：窗口态实现干净、无泄漏；但 fs 态有一个 Confirmed 级 stale-closure 缺陷、缺绝对像素上限、且不存在任何弱 GPU 退化路径（R219.8 只把它列为"后续杠杆"）。**

- **[Confirmed] F1 · applyHdSize 读到过期 `fullscreen` 闭包 → survival 进 fs 走错分支、画面非等比拉伸。**
  `MiniGamesView.tsx:1106` `if (screen === 'survival' && (fullscreen || focusModeRef.current))` 读的是**闭包变量**；而游戏循环 effect 的 deps（:1435 `[finishSurvivalRun, pollGamepad, pollVision, publishTd, publishSurvival, publishTetris, screen, settleBest]`）全部稳定（pollGamepad `[]` :771、pollVision `[screen, vision.enabled, …]` :1005、publish* `[]`），**全屏切换不会重跑 effect** → 用户在窗口态运行中经 Esc 暂停浮层「全屏」按钮（:2790，R219.2③ 称其为"唯一 OS 全屏入口"）进入 fs 时，RO 回调执行的仍是创建时 `fullscreen=false` 的旧闭包 → 走 `computeHdSize`（900:520 比例锁 backing），而 CSS 是 100vw×100vh 全铺满（app.css:10192-10198）→ backing 比例 ≠ CSS 比例，浏览器非等比拉伸（16:9 屏纵向 ~2.7%，4:3 屏 ~25%），且 `vp.w` 被锁回 ~900（:1149）。同文件里 `fullscreenRef`（:304-305，渲染期同步赋值）就是为这类读取准备的，:1367 已正确用它，:1106 漏用——一字修复（`fullscreen`→`fullscreenRef.current`）。TD/Tetris/Slash 不受影响（两分支对它们等价）。
  ※ 矛盾点如实记录：R219.7 CDP 证据称 4:3 fs "backing==CSS"（PRD R219.7）；若上述路径命中应为 1440×832。推测验证流程中 effect 曾在 fs 态重建（如 hub 往返/重开后进 fs）掩盖了该路径。建议修复后用「窗口态 running → Esc → 全屏按钮」精确复现取证。

- **[Confirmed] F2 · backing 无绝对像素上限，R217.3「最坏 1800×1040」承诺在 fs 态不成立。**
  `hdCanvas.ts:41-46` 只钳 dpr≤2，`targetW = max(900, cssW×dpr)` 无上限；survival fs 路径（MiniGamesView.tsx:1107-1109）同样只乘 dpr。2560×1440@dpr1 fs → survival 3.7MP、其余三作 contain 盒 2492×1440≈3.6MP；4K → **8.3MP/帧**（约为承诺上限的 4.6 倍）。每帧整幅光栅化 + 合成在弱 iGPU + 大屏低 dpr 组合上有掉帧风险。[Likely] 实际影响（取决于 GPU）；建议加绝对 MP 上限（如 2.2MP，超出降 scale）。

- **[Confirmed] F3 · 无退化路径。** loopBody（:1139-1428）没有任何 fps 采样/降档逻辑；R219.8 明示「若仍有卡顿，后续杠杆=fs 态 dpr 钳 1.5 或渲染减半上采样（需用户反馈后立项）」——即当前版本弱 GPU 无保护，且该杠杆只调 dpr、解决不了 F2 的低 dpr 大屏场景。

- **[Confirmed-无泄漏] backing store 分配核查：** RO 在 cleanup `disconnect()`（:1432）；窗口态 CSS 为定值公式（app.css:2645-2652，R219.8② 修掉本征尺寸反馈环），无 resize 循环泄漏。bgCache 复用单个离屏 canvas（:1235 `bgCache?.canvas ?? document.createElement`），键 `场景|岛|W×H`（:1232），无累积分配。两处小注：①拖拽连续 resize 时每帧 miss→整幅重栅格背景（有界、瞬时，可接受）；②RO 观察的是布局盒，**跨显示器拖动若盒不变仅 dpr 变，RO 不触发**，backing 停留旧 dpr（[Speculative] 边缘场景，双混缩放屏可遇；可补 `matchMedia('(resolution)')` 监听）。

- 微小项：`:1149` 每帧 new `{w,h}` 对象（GC 微压）；`:1270-1272` slash 分支每帧重复 `getContext('2d')`（返回同一 ctx，属性忽略，无害冗余）。

## §2 Juice 全档强度核查（Q2，R220.3 修后）

逐项对照可感知阈值（60fps 下 1 帧=16.7ms；位移阈值≈实体半径 30%+；顿帧阈值≥2 帧）：

| 档位 | 实现 | 判定 |
|---|---|---|
| 击退 | 固定 12px/tank 3px（survival.ts:1601-1608）；接触反冲 46px/tank 8px（:1644-1647） | **达标**（12px≈小敌 1 个半径，清晰可感） |
| 击杀 | pop 音（60ms 节流）+锥形爆散 8-16 +涟漪+combo（:1263-1273）；tank/splitter 母体 0.03s 顿帧（:1228-1230） | **达标** |
| Boss 击杀 | 0.06s 顿帧+54 粒子双爆+banner+门+levelup 音（:1235-1249） | **达标（全作最强一档，层次正确）** |
| 受击顿帧 | survival 玩家受击 0.03s（:1640/:1350）；**TD 漏球 0.02s（td.ts:531）；Slash 受击无顿帧**（slash.ts:322-334 仅 flash+shake） | **半达标**：0.02s≈1.2 帧**低于感知阈值**，Slash 缺位 → 三档不齐（建议统一 0.03s 下限） |
| 受击 squash | 白闪期半径 ×1.22（survival.ts:2134-2135），6 帧时长 | **达标**（均匀缩放版，够用） |
| 升级演出 | banner `LEVEL n` 1.4s+音效+即时 publish+DOM 卡片+autoPick 高亮 1s 拍板（MiniGamesView.tsx:1211-1228, :2810-2818）；进化=0.06 重档+`EVOLVED` 横幅+金爆 30+shake 7（survival.ts:973-982） | **达标**；普通升级无 freeze/zoom-punch（仅进化有）——可接受的克制，非缺陷 |
| TD 波清 | 0.04s 顿帧（td.ts:476） | 达标 |
| Tetris | 四消 0.06/T-spin 0.05+行闪 0.25s+shake（tetris.ts:335,350-352） | 达标（分级正确） |

**结论：R220.3 后 Survival 全档过阈值；遗留缺口是跨作档位不齐（TD 0.02 / Slash 0），属一致性而非强度问题。**

## §3 视觉一致性（Q3）

- **[Confirmed-良好]** 共享 hud.ts 设计语言贯彻到位：胶囊 rgba(8,12,20,.1-.14)+1px 边、#67e8f9/#e2f8ff/#9fb7c1 三色文本、血条绿黄红渐变+分段+低血脉冲、vignette 呼吸——四作+fs HUD（MiniGamesView.tsx:2238-2317）同源。
- **[Confirmed] H1 · 字体双轨**：画布主体 Inter（500-800 各档），但 juice 飘字/toast 用 `system-ui`（hud.ts:229、:174）→ 同帧混排两族字体（Windows 上 Inter→sans-serif 回退时更明显）。统一到 Inter 一行改两处。
- **[Confirmed-遗留] H2 · 画布内英文硬编码**（上轮 Top10 #8 未随 R220 落地，R220.5 只做了配色/图鉴/预警箭头）：`BOSS DOWN — ROULETTE +1`（survival.ts:1246）、`LEVEL n`（:1752）、`EVOLVED · X`（:979）、`ISLAND/COMBO/LV/BOSS/P1-P4`（:2243/:2232/:2251/:2209/:2222）、`NEW BEST!`（MiniGamesView.tsx:1186）、`BLOCK/ARC`（td.ts:580-582）、`NEXT/HOLD/LINES/LEVEL/BEST/B2B/T-SPIN!/TETRIS!`（tetris.ts:792-852/:676-680）、`COMBO ×`（slash.ts:350）。DOM 层全中文 → 画布/DOM 双语混排是当前最大一致性破口（fs 卡片已 t() 化，证明缝就在引擎字符串）。
- **[Likely] H3 · 描边语言分叉**：survival 敌用暗描边 `rgba(8,12,20,.45)`（:2137）、TD 气球白描边 .76（td.ts:771）、tetris 格内发光、slash 无描边——各作内部自洽、跨作不统一；属风格判断题，非硬伤。
- **[Confirmed] H4 · 震屏双通路残留**：survival 已单通路化（R219.1），TD（td.ts:688-690）与 Slash（slash.ts:611-615）仍 legacy `state.shake` + `juice.shake` **双 translate 叠加**，同事件振幅可达 2×；建议同样收敛到 applyShake 单通路。

## §4 最坏帧预算（Q4，模拟实测）

脚本：`sim-entry.ts`（同目录），真实引擎 esbuild 打包，4P 合作+boss+持续满压补给（每帧补齐敌/弹/珠/粒子上限），900-1200 帧取分布。**JS 侧口径（无光栅）**，Node 23 桌面 CPU（弱 CPU 约 ×2-3）：

| 场景 | 峰值实体 | tick p50/p95/max (ms) | draw 派发 p50/p95 | draw ops/帧 | 状态写入/帧 |
|---|---|---|---|---|---|
| survival 150 敌 | 179敌+94弹+73敌弹+235粒 | 4.0 / **9.2** / 16.7 | 1.0 / 1.8 | 2218 | 1744 |
| survival 300 敌 | 336敌+98弹+94敌弹+338粒 | 0.03 / **9.6** / 19.8 | 1.1 / 1.6 | 2888 | 2474 |
| survival 600 敌 | 631敌+89敌弹+543粒 | 0.01 / **26.1** / 45.4 | 1.3 / 2.1 | 4325 | 3612 |
| survival 1000 敌 | 1029敌+141敌弹+689粒 | 0.01 / **66.6** / 70.7 | 2.1 / 3.1 | 6451 | 5348 |
| TD 18 波洪峰 | 45 气球 | 0.003 / 0.03 | 0.09 / 0.23 | 383 | 192 |
| Tetris 双板 75% 堆高 | — | 0.001 / 0.02 | 0.72 / 1.03 | 1821 | 1150 |
| Slash 满压 | 7 块 | 0.001 / 0.004 | 0.03 / 0.06 | 88 | 71 |

**判读：**
1. **TD/Tetris/Slash 全面安全**（全部 <1.2ms JS），Slash 近乎零负载。
2. **survival 是唯一预算风险，且瓶颈在 tick 不在 draw**：300 敌持续（长局雪球现实可达，[Likely]）p95≈9.6ms+1.6ms≈11ms——本机余量尚可，弱 CPU（×2）即破 16.6ms；600 敌 [Likely，15min+ 被动局+healer 奶墙] 本机 p95 26ms **已破预算**；1000 敌 ≈15fps（[Speculative] 极端）。
3. **根因（全 Confirmed，按贡献排序）**：①敌-敌分离 O(n²) 双层循环（survival.ts:1669-1685）；②tick 内逐敌 `nearestAlive` O(n)（:1621）；③draw 内 sprinter/shooter **再各做一次逐敌 nearestAlive**（:2074、:2097）→ 绘制层也是 O(n²)；④5 个大数组每帧 `filter` 重建（bullets/orbs/particles/eBullets/enemies）GC 压力；⑤**敌数无上限**（:1412-1417 每 0.45s 必刷+swarm 整包 8-12，:1080-1088）；⑥多人大世界无视口裁剪（摄像机层外敌人照画）。
4. **修复杠杆（按性价比）**：敌数上限（VS 惯例 300-500，一行）＋分离/索敌换空间哈希网格（cell=64px，O(n)）＋朝向缓存（sprinter/shooter 的 nearestAlive 每 0.1-0.2s 刷新即可，draw 读缓存）＋draw 视口外剔除（2P+）。预期 600 敌 p95 26ms→<5ms。

## §5 Canvas2D 进阶机会裁决（Q5）

- **TD bgCache 推广（上轮 Step2）：数据否决。** TD draw JS p50=0.093ms、全档 383 ops；可缓存静态部分（面板渐变 td.ts:628-634 + 网格 :692-699 + 双底描边路径 :705-706）约 45 ops≈12%，JS 侧省 <0.02ms；光栅侧仅在 4K fs 弱 GPU 有 0.3-1ms 量级收益。**不值得做**——同预算投给 survival tick 热点回报高两个数量级。
- **sprite 图集：暂缓（[Speculative] 收益）。** survival draw 派发仅 1-2ms；敌形是 2-3 条图元，图集化可省派发与状态切换（~40%），但被 tick 26ms 淹没。**前置条件**：先做 §4-4 杠杆，之后若真机 profiling 显示光栅 bound（弱 GPU+4K backing+600 敌），再对圆系敌做 7 色×3 尺度图集。
- **值得顺手做的渲染卫生（Confirmed，均微小）**：H1 tetris 残留 `ctx.shadowColor` 每当前块逐格设置且**从不复位**（tetris.ts:779，blur 恒 0 故视觉惰性，但属上轮清零行动漏网+上下文状态泄漏）；H2 TD 冗余全幅 `clearRect`（td.ts:686，紧随其后的面板渐变全幅覆盖，R220.4 只撤了 survival 的）；H3 `drawAlertVignette` 每帧 `createRadialGradient`（hud.ts:128，低血常驻期持续，可按 (w,h,档) 缓存同血条模式）；H4 tetris/slash 静态网格线整幅重画（tetris.ts:736-749、slash 远层格栅 ：576-582 慢漂移可量化冻结）——均 <1ms 级，攒一批顺手清。

## 附 · 复现

```bash
cd %TEMP%/rgbbox-review-20261010
C:/tjf/github/RGBBox/node_modules/.bin/esbuild sim-entry.ts --bundle --platform=node --format=cjs --outfile=sim.cjs
node sim.cjs
```
局限声明：①无光栅/GPU 合成成本（本机为 RDP 软件渲染环境，真机数据需 CDP 分帧复测，口径同 scripts/r219-perf.mjs）；②bot 为静态补给模型，非真实走位；③F1 的运行时表现需真机按「窗口 running→Esc→全屏」路径复现。
