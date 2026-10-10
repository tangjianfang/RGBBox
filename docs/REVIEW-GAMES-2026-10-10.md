# REVIEW-GAMES · 迷你游戏第二轮深度评审（2026-10-10）

> 对象：`review/vision-gesture-commercial@6ebdce8`。4 路游戏域角色并行（G1 玩法数值·含真实引擎 bot 模拟 / G2 手感渲染·含 headless 性能基准 / G3 架构可测性 / G4 产品内容 UX）。上轮（2026-10-01）已修项核实不重复报。附录 `docs/review-2026-10-10-games/`。

---

## 0. 一页结论

**上轮修复（R215-R223）验证**：死亡墙拆除对 survival 本体成立（casual+best bot 0/16 死亡、boss 首杀 31%、岛屿最深 6）；autoPick 学习回路/进化接线/难度四档均落地。**但本轮发现 2 个 P0**（Slash 斜向不可斩=事实性不可玩 + 全屏 stale-closure 画面拉伸）、7 个 P1（含合作模式三重缺陷），加上架构趋势恶化（3126 行 God Component、「再加一个 ref」模式固化）。

**因果链**：R220 死亡墙修复打开了内容大门，但**短局/合作/跨游戏三个新维度各自带着新缺陷**——Sprint 与解锁内容全错开、合作局 P2 二等化+难度反直觉、LED 零联动使游戏仍是产品孤岛。

### 四维评分

| 维度 | 上轮 | 本轮 | 变化 |
|------|------|------|------|
| 玩法数值 | 2.5 | **3.5** | ↑死亡墙修好+内容可达，但 Slash 坏档/Sprint 空心/合作失衡拉回 |
| 渲染/手感 | 3.0 | **3.5** | ↑R217/R220 达标；fs stale-closure+性能天花板新发现 |
| 架构 | 4.0 | **3.0** | ↓趋势向下——3126 行 God Component、零覆盖率、ref 集群恶化 |
| UX/产品 | 2.5 | **3.0** | ↑autoPick/难度修复；fs 教学吞没/每日稀释/LED 孤岛新发现 |

### Top 发现汇总（13 新确认项 + 上轮残留）

| # | 级 | 来源 | 发现 | 位置 | 置信度 |
|---|---|---|---|---|---|
| **F-1** | **P0** | G1 | Slash 斜向块（50% 生成占比）无输入路径可斩 | slash.ts:234 + MiniGamesView:939/1495 | Confirmed（码+模拟） |
| **F2-1** | **P0** | G2 | 全屏 stale-closure → survival fs 走错 backing 分支画面拉伸 | MiniGamesView:1106 | Confirmed |
| G3-1 | P1 | G3 | slash 重开按钮 fallthrough 到 restartTetrisRun | MiniGamesView:2176 | Confirmed |
| G3-2 | P1 | G3 | restartTetrisRun 丢难度设置 | MiniGamesView:1959 | Confirmed |
| F-2 | P1 | G1 | TD/Swarm 难度倍率引擎内+结算双乘（insane ×9） | survival.ts:1377, td.ts:600 | Confirmed |
| F-3 | P1 | G1 | Sprint 90s 与 boss/轮盘/岛屿/splitter/healer 全错开 | survival.ts:52/1380/1420 | Confirmed |
| F-4 | P1 | G1 | 合作局 lightspear/barrage/moonblade 只对 P1 生效 | survival.ts:1449-1574 | Confirmed |
| F-5 | P1 | G1 | 2P 显著难于 1P（同刷怪率+双人无敌帧扣同池） | survival.ts:876/1345/1635 | Confirmed+模拟 |
| FE-1 | P1 | G4 | fs/专注隐藏引导但步骤照常推进消耗（教学被吞） | app.css:10130, MiniGamesView:1410 | Confirmed |
| FE-2 | P1 | G4 | 每日任务语义稀释：普通局也点亮芯片 | MiniGamesView:656 | Confirmed |
| PD-1 | P1 | G4 | LED 零联动：游戏事件不产生灯效输出 | useEngineLoop.ts:204-207 | Confirmed |
| G2-2 | P1 | G2 | survival tick O(n²) 敌分离：600 敌 26ms 破帧 | survival.ts:1669/1621/2074 | Confirmed（模拟） |
| G2-3 | P1 | G2 | backing 无绝对像素上限：4K fs 8.3MP（承诺 4.6 倍） | hdCanvas.ts:41-46 | Confirmed |
| G3-3 | P1 | G3 | MiniGamesView 3126 行已过拆分阈值（77 ref/350 行 draw/490 行 tick） | 全文件 | Confirmed |
| G3-4 | P1 | G3 | games/** 6616 行不在 coverage include（零度量零门禁） | vitest.config.ts | Confirmed |
| G3-5 | P1 | G3 | lanService 394 行零单测 + LAN 72 条件分支织入 view 层 | 全仓 | Confirmed |

P2 级（一并修但不单独排任务）：进化配方零披露(F-7)、HP 小数上屏(F-8)、bossSoon 判据反(F-9)、burst feint 判据错(F-10)、击退永久钉死(F-11)、tetris 默认过快(F-12)、blitz 无词缀(F-13)、每日半种子(F-6)、画布英文 ~25 处(G4)、XP 珠文案漂移(FE-5)、死亡重开纯文本(FE-4)、金币 Swarm 独占(FE-3)、coach 3s 闪现(G4)。

---

## 1. G1 数值模拟验证（上轮修复效果 + 新发现）

**方法**：esbuild 打包真实引擎 + 16 向 kiting bot，1/60s 步进；survival 5 配置×16 局、sprint 24 局、slash 200 局×4。

| 配置 | 存活 P25/P50/P75 | 死亡率 | boss 首杀率 | 岛屿 P50/max | 分数 P50 |
|------|------------------|--------|-------------|--------------|----------|
| casual+best | 170/190/591s | 0/16 | **31%** | 1/6 | 10,739 |
| casual+random | 145/157/173s | 10/16（P50 148s） | 6% | 1/5 | 4,406 |
| standard+best | 167/206/591s | 5/16 | 44% | 1/6 | 35,809 |
| hard+best | 100/116/591s | 9/16 | 44% | 1/7 | 13,116 |

**结论**：R220 死亡墙对强 bot 成立（casual+best 零死亡）；新手画像（random 选卡）P50 148s=2.5 分钟，可接受但 boss 首杀仅 6%——内容可达的梯度仍陡。**合作局修正后模拟**：2P casual 死亡 P50 显著低于 1P（F-5 根因=参数不随人数缩放）。

## 2. G2 渲染性能基准

| 场景 | tick p95 | draw p95 | 总帧 | 瓶颈 |
|------|----------|----------|------|------|
| TD（满波+词缀） | 0.093ms | 0.383ms | <0.5ms | 安全 |
| Tetris | <0.1ms | <0.5ms | <0.6ms | 安全 |
| Slash（200 实体） | <0.5ms | <0.7ms | <1.2ms | 安全 |
| **Survival 300 敌** | **9.6ms** | 1.2ms | ~11ms | **tick O(n²)** |
| **Survival 600 敌** | **26ms** | 1.8ms | ~28ms | **破 60fps** |

根因：敌-敌分离 O(n²)（:1669）+ tick/draw 双 nearestAlive 逐敌线性扫（:1621/:2074/:2097）。杠杆：敌数上限+空间哈希+朝向缓存+视口裁剪 → 预期 26→<5ms。

## 3. G3 架构评级：B+（趋势↓）

**已过阈值的拆分信号**：3126 行 / 77 useRef / 55 useState / 20 useEffect / 350 行 draw / 490 行 tickSurvival。R219.1/R220.1⑦/R221.7 三次事故均出自该文件。

**覆盖率盲区**：`games/**` 6616 行不在 vitest coverage include；lanService 394 行零单测。

**接入摩擦**：无 GameEngine 接口——第 5 作需在 3126 行里改 ≥10 处 switch。scene.ts 仅 survival 消费（1/4 游戏）。

---

## 4. 修复批次建议（新分支）

### Wave 1（P0 立即修，~0.5 天）
1. **Slash 斜向修复**：生成收敛 4 向（1 行改动+快照）
2. **fs stale-closure**：`fullscreen` → `fullscreenRef.current`（一字修）
3. **slash 重开 fallthrough + tetris 难度丢失**（两个小修）

### Wave 2（P1 正确性+平衡，~2 天）
4. 难度倍率去双乘
5. Sprint 120s + boss 提前 + 完赛 'won' 语义
6. 合作进化收益统一（抽公共 fire 函数）
7. 合作难度按人数缩放
8. fs 教学可见（fs HUD 引导等价物）
9. 每日种子全链路（卡池/轮盘）+ 芯片仅种子局点亮

### Wave 3（P1 战略+性能，~3 天）
10. **LED 联动 v1**：游戏事件→灯效输出（受击红闪/升级彩环/boss 氛围色）——闭合产品价值环
11. Survival tick 优化：敌数上限+空间哈希+视口裁剪
12. 渲染像素上限：2.2MP cap + 弱 GPU 退化路径

### Wave 4（P2 质量+架构，~3 天）
13. P2 批修（F-7~F-13 + G4 杂项 ~12 项）
14. MiniGamesView 拆分（hook+fsHud+视图装配三件套）
15. games/** 纳入覆盖率 + lanService 单测
16. GameEngine 接口 + adapter 注册表

---

## 附录

| 分报告 | 路径 |
|---|---|
| G1 玩法数值 | `docs/review-2026-10-10-games/G1-gameplay.md` |
| G2 手感渲染 | `docs/review-2026-10-10-games/G2-juice-render.md` |
| G3 架构 | `docs/review-2026-10-10-games/G3-architecture.md` |
| G4 UX 产品 | `docs/review-2026-10-10-games/G4-ux-product.md` |
