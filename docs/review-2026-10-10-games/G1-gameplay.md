# G1 玩法系统评审 · 2026-10-10（第二轮）

> 对象：`review/vision-gesture-commercial@6ebdce8`。上轮评审 `docs/REVIEW-GAMES-2026-10-01.md` 已修项（R215-R223）不重复报；本报告只报**当前状态的新问题**。
> 方法：全量读码（survival/swarmMeta/swarmAutoPick/td/tetris/slash/daily/coach/MiniGamesView）+ **真实引擎 bot 模拟**（esbuild 打包仓库源码，16 向走位 kiting bot，1/60s 步进；survival 全档矩阵 5 配置×16 局、sprint 24 局、slash 200 局×4 配置、敌种权重实测）。模拟脚本与本报告同目录（sim.ts / sim2.ts）。

---

## 0. 一页结论

R220 死亡墙拆除**对 survival 本体基本成立**：强 bot 下 casual 不再必死、9 敌种全部可见、boss/岛屿链可达（详见 §1）。但本轮发现 **1 个 P0（Slash 斜向块不可斩，游戏事实性不可玩）**、3 个 P1（TD/Swarm 难度倍率平方级双乘、Sprint 与全部解锁内容脱节、合作局 P2 未继承进化收益），以及一批 P2。四作上手梯度被两个问题钉死在错误的一端：Tetris 默认档重力过快、Slash 直接坏档。

| # | 级别 | 问题 | 位置 | 置信度 |
|---|------|------|------|--------|
| F-1 | **P0** | Slash 斜向块（50% 生成占比）无任何输入路径可斩——保底漏伤，游戏不可玩 | slash.ts:234 + MiniGamesView.tsx:939/1495 | Confirmed（码+模拟） |
| F-2 | **P1** | TD/Swarm 难度倍率引擎内+结算点双乘（standard ×2.25 / insane ×9），跨作不可比、结算面板同屏双分数 | survival.ts:1377、td.ts:600、MiniGamesView.tsx:646 | Confirmed |
| F-3 | **P1** | Sprint 90s 与 boss(90s)/轮盘/传送门/岛屿/splitter(90s)/healer(105s) 全部错开——短局是"切掉全部内容的缩水局"，活满 90s 也判 'lost' | survival.ts:52/1380/1420 | Confirmed（码+模拟 0/24 见 boss） |
| F-4 | **P1** | 合作局 lightspear/barrage/moonblade 只对 P1 生效——P2+ 火力与光环二等化 | survival.ts:1449-1466 vs 1517-1523、1562-1574 | Confirmed |
| F-5 | P1 | 共享血量池后 2P 显著难于 1P（同刷怪率+双人双无敌帧扣同池），需按人数分离调参 | survival.ts:876-881/1345/1635 | Confirmed（机制）+模拟 |
| F-6 | P2 | 每日挑战只种子了敌潮：卡池/轮盘仍 Math.random——"共同棋盘"半兑现 | swarmMeta.ts:272/291/293、survival.ts:967 | Confirmed |
| F-7 | P2 | 进化配方（4 条）零 UI 披露：图鉴四区无进化条目，"朝配方 build"元策略不可发现 | swarmMeta.ts:39-44、MiniGamesView.tsx:3084-3120 | Confirmed |
| F-8 | P2 | casual/standard 连续伤害产生小数 HP（9.375）直接上屏 | survival.ts:101-103、MiniGamesView.tsx:2345/2473 | Confirmed |
| F-9 | P2 | survivalHints bossSoon 判据写反（重置后 15s 提示"将至"，应为剩余 <15s） | survival.ts:2277 | Confirmed |
| F-10 | P2 | slash burst 假动作判据用常量 RUN_SECONDS 而非本局上限——30s 爆发局 0s 起就混 feint | slash.ts:239 | Confirmed |
| F-11 | P2 | 击退定值 12px 叠加高射速 → 中后期近战敌/boss 可被永久钉在射程外，威胁多样性坍缩（上轮"墙或雪球"的残留维度） | survival.ts:1601-1608 | Likely（算术+模拟佐证） |
| F-12 | P2 | Tetris 默认 standard=起始等级 5（重力 0.42s/行），对零记录新手是马拉松中期速度 | tetris.ts:35-40/211-213 | Likely（设计判断） |
| F-13 | P2 | TD blitz 6 波全程无词缀（词缀 13 波起）；闪电赛=纯半局，无竞速结算维度 | td.ts:145/364-369 | Confirmed |

---

## 1. 焦点一：R220 死亡墙修复后的数值曲线（模拟验证）

**模拟配置**：真实引擎+mulberry32 种子；bot 为 16 向 kiting 最优走位（威胁/珠/传送门加权），升级用 autoPick=best（用户画像）或随机三选一（新手画像）；600s 上限 + 380 敌饱和护栏（bot 不死时由敌群积压截断，如实标注）。

| 配置 | 存活 P25/P50/P75 | 死亡率 | boss 首杀率 | boss 均杀/局 | 岛屿 P50/最大 | 等级 P50 | 分数 P50 |
|------|------------------|--------|-------------|--------------|--------------|----------|----------|
| casual+best（用户画像） | 170/190/591s* | 0/16（600s 内 bot 无死亡） | **31%** | 1.9 | 1 / 6 | 18 | 10,739 |
| casual+random（新手） | 145/157/173s | 10/16 死亡，死亡 P50 **148s** | **6%** | 0.4 | 1 / 5 | 11 | 4,406 |
| standard+best | 167/206/591s | 5/16，死亡 P50 155s | 44% | 2.4 | 1 / 6 | 27 | 35,809 |
| hard+best | 100/116/591s | 9/16，死亡 P50 116s | 44% | 2.6 | 1 / 7 | 13 | 13,116 |

\* P50=190s 是 380 敌饱和护栏触发点（bot 存活但敌群积压）——本身是个信号：**casual 强运营下击杀速率追不上投放速率的拐点在 ~170-190s**，之后进入"被钉在射程外的敌海"状态（见 F-11）。

**结论：修复对"强/中等玩家"成立，对"新手玩家"只兑现一半。**

- ✅ **敌种内容解锁兑现**：全部配置（含新手）都见到 9/9 敌种（healer 105s 也可达）——上轮"半数敌种未见"已消除。
- ✅ **boss 从幽灵变实体**：强 bot 31-44% 首杀率、1.9-2.6 杀/局；90s boss HP≈72 配 DPS 曲线可在数秒内击破。
- ⚠️ **新手画像仍被锁在墙后**：随机选卡的 casual 局死亡 P50 148s、boss 首杀率 6%、岛屿 P50=1——**选卡质量仍是内容门禁**。autoPick=best 修复解决了"自动选卡反优化"，但没有解决"玩家自己不会选"的教学缺口（教练 hints 无一条讲 build 思路，见 §3）。
- ⚠️ **hard 档仍是墙**（P50 死亡 116s < 3min 目标），死亡局分数 P50 13k 与存活局差 36 倍——二值曲线在 hard 档未收敛。
- 岛屿深度：bot P50 停留 1 岛（传送门在 boss 死亡点，需主动跑图拾取；bot 传送门引力半径有限，真人应该更高），最大 6-7 岛可达。换岛链**可达但被动**——没有任何 UI 提示"去踩传送门"（coach 有 sw.portal 但 priority 60 常被 hpLow/bossSoon 压制）。

## 2. 焦点二：四游戏难度平衡（学习曲线/上手时间/挫败梯度）

| 作 | 上手门槛 | 首局挫败源 | 评级 |
|----|----------|-----------|------|
| TD | 低（鼠标+侧栏教学+教练） | 无明显 | 良好——四作中曲线最健康 |
| Swarm | 中（WASD+三选一） | 新手选卡质量决定 148s vs 不死（§1） | 中——建议教练补 1-2 条 build 引导 |
| Tetris | **高**：默认 standard=L5 重力 0.42s/行（F-12），零记录用户（真实画像 tetris 无 best）首局即中期速度 | 顶出+高压 vignette | 偏陡——建议默认 casual 或 standard 降 L3 |
| Slash | **坏档**：F-1 使 50% 方块保底漏伤 | casual 完美节奏 bot 100% 死亡、P50 17.4s（§4 模拟） | 不可玩 |

**Slash F-1 详情（本轮最重要发现）**：
- `spawnBlock` 生成 8 向方块（slash.ts:234），画面绘 ↗↖↙↘ 箭头；但输入面只有 4 个正交方向：键盘映射（MiniGamesView.tsx:1495）、视觉 SLASH_DIR（:939）、手柄无 slash 通路；视觉斜向手势=双键同按（gesture_engine.js:48）→ 派生两条正交斩击，第一条对斜向块判 'wrong' 断连击。
- `slash()` 取首个入圈块比对方向（slash.ts:311-335），斜向块必然越圈（t>1.12）→ damageSlash 25-35 伤。
- **模拟**（完美节奏 3 斩/s、只斩可斩块的理想玩家）：斜向不可斩时 casual 死亡率 **100%**、死亡 P50 **17.4s**、终局分 P50 **60**（与真实用户 best=67 精确吻合——用户数据反向证实）；假设输入面支持 8 向（反事实同 bot）：casual 死亡率 53%、分数 P50 1795（30 倍）。斜向块占比实测 50%。
- 唯一豁口是 pinch 炸弹（6s CD 清全场，+5/块）——现行 meta = "每 6s 轰一次否则死"，不成立。
- 修法二选一：生成收敛 4 向（`rand*4`，改动最小、砍掉视觉斜向 glyph）；或输入面扩 8 向（键盘双键组合判定 + vision 双命令合成 + 手柄轴 8 向）。

## 3. 焦点三：元进度可持续性

- **买满成本**：6 条永久 ×3 级 = 2,460 金币；casual 死亡局 P50 分 4.4k→220 金/局、存活局 10.7k→537 金/局 → **5-20 局买满**（与"17 局"画像一致）。此后无金币 sink、无 prestige、PERM_MAX 封顶——上轮 S-6 的悬崖仍在，本轮不重复展开，但新增两格缺口：
  - **F-6 每日挑战半种子**：survival 引擎 33 处随机已走 state.rng，但**卡池三选一与轮盘仍走 swarmMeta 的 Math.random**（pickOffers/rollRouletteItem/rollRouletteStat）——同日同种子的两个玩家打同一敌潮、拿不同卡序，"共同棋盘"的比分可比性打折；且 slash/tetris 的每日开关未接（PRD 已如实保留），hub 的四作 daily chips 实际只有 swarm 有种子语义、TD 是普通"今日最佳"。
  - **F-7 进化配方零披露**：EVOLUTIONS（moonblade=blade3+damage4 等 4 条）未导入 MiniGamesView、图鉴四区（角色/敌/升级/神器）无进化条目——R220.3 把进化接进了玩法（模拟中 best 档靠估值序自然凑齐 multishot3+pierce3 触发 barrage），但玩家无法**主动朝配方 build**，进化卡是"突然出现的东西"。建议图鉴加第五区或升级卡上标"满级后可进化→X"。
- **成就引导性**：12 枚成就全部只挂 survival（finishSurvivalRun 独占）；kills5000/score20000 在修复后可达（存活局击杀 P50 342、hard 存活分 469k），boss1/boss10 现在真实可达（上轮修复的红利）。缺的是**过程反馈**：局内无成就进度提示（如 combo 24/25），只有结算后 4.5s toast。P2 级。

## 4. 焦点四：短局矩阵（R215）的独立身份

| 模式 | 内容覆盖 | 身份判定 |
|------|----------|----------|
| TD blitz 6 波 | 词缀系统全程缺席（13 波起，F-13）、elite 波 5 保留、无竞速计时/结算 | 缩水半局——建议 blitz 波内启用词缀 + 按用时给结算加成 |
| Swarm sprint 90s | **boss 0/24、轮盘 0、传送门/岛屿 0、splitter/brute(90s)/healer(105s) 0**——5/9 敌种；活满 90s 完赛也走 'lost' 面板 | 内容空心（F-3）——boss 90s=sprint 90s 且 sprint 判负在 bossTimer 之前结算；建议 sprint 120s 或 boss 提前至 60s + 完赛 'won' 语义 |
| Tetris race 40 行 | 目标明确、'won' 语义正确（:356-360 先结算防顶板覆写）、hint 星标辅助 | **四短局中唯一有独立身份的**——40 行竞速自洽 |
| Slash burst 30s | 节奏坡度正确按 runSeconds 归一；但 feint 判据错用 RUN_SECONDS（F-10，0s 起混入）；叠加 F-1 | 被 F-1/F-10 双重污染 |

## 5. 焦点五：合作模式（R223 共享池）后的平衡

**机制面**：任一玩家受击扣同池（applyPlayerDamage），但**个人无敌帧独立**（0.9s×2 个时钟）→ 同一秒内池可掉 2×敌伤；刷怪率/敌伤均不随人数缩放；DPS 双倍（P2 独立开火）。

**模拟**（修正 bot 世界边界+双人结伴策略后）：2P casual 死亡 P50 {{2P_TIME}}s（{{2P_DEAD}}/16 死亡）vs 1P 同 bot 0/16 死亡——**同技术水平下 2P 显著更难**。根因不是共享池设计本身，而是**难度参数未按人数分离**（F-5）：建议 pool 上限 +(P-1)×2 或敌伤 ×(1-0.15×(P-1))，至少给 2P+ 一档独立折扣。

**附带发现 F-4**：共享 build 语义下进化收益只落在 P1——lightspear（×1.3 伤/穿透+2/弹速）与 barrage（两翼斜射）只在 P1 开火循环读取（survival.ts:1449-1466），P2 循环（:1517-1523）用裸 stats；moonblade 环刃只绕 P1（:1562-1574 锚 `player`）。thornAura 是唯一正确的全员实现（:1581）。修法：把进化修饰提为 stats 派生或抽公共 fire 函数。

## 6. 其它新发现（P2 杂项）

- **F-8**：R220.2 连续敌伤（casual 0.625/standard 0.7）→ HP 变 9.375 这类小数，fs 状态面板（MiniGamesView.tsx:2345）与 DOM 统计格（:2473）原样上屏（飘字层已 Math.ceil，HUD 层没ceil）。
- **F-9**：`survivalHints` 的 bossSoon 判据 `bossTimer > BOSS_INTERVAL - 15`（survival.ts:2277）= 计时器重置后 15s（含开局 0-15s 与 boss 刚出场后）触发"boss 将至"，应在 `bossTimer < 15`。开局 15s 内教练就在喊狼来了。
- **F-11**：击退改 12px 定值后，中期 build（fireRate×5+multishot×3 ≈ 12.6 命中/s）对非 tank 敌产生 >150px/s 持续推力，超过敌速上限（chaser 112×难度 1.15≈129）——近战敌被钉死在弹幕外（模拟中 380 敌饱和即此形态的具象）；boss（速 34）同样被钉。建议击退对同一敌设 0.2s 内部 CD 或改为受击减速而非位移。
- **敌种投放集中度**（权重公式 1/威胁值归一化的副作用，上轮 S-4 的相邻维度）：实测 sprinter 35% / swarm 20% / chaser 15% 事件占比（swarm 按包均 10 体计算占实体数 ~60%）——"快脆"敌主导中后期观感，brute/tank 合计 3%；8 行为矩阵在体感上仍读作 4 种（追/蜂群/风筝/治）。建议权重加每类地板（如 ≥6%）。

## 7. 修复优先级建议（新分支批次）

1. **C1（P0）**：Slash 斜向修复（建议生成收敛 4 向——1 行改动+快照重立；8 向输入为进阶项）。
2. **C2（P1 正确性）**：难度倍率双乘（survival/td 引擎内乘法撤除、统一 settle 点单乘，对齐 tetris/slash 模式）+ sprint bossTimer/时长/完赛语义 + P2 进化收益统一。
3. **C3（P1 平衡）**：合作局难度按人数分离调参（F-5，模拟复测 2P P50 ≥ 1P 的 80%）。
4. **C4（P2 批）**：每日卡池种子化 + 进化配方披露（图鉴第五区）+ HP 显示取整 + bossSoon 判据 + burst feint 判据 + tetris 默认档评估 + blitz 词缀启用 + 击退节流。

## 8. 方法与局限

- bot 为理想 kiting 策略，无人类误操作/反应延迟；"0 死亡"结论是**上限**而非典型值——典型值以新手画像（随机选卡）P50 148s 为参照系，真实玩家介于两者之间。
- 岛屿深度受 bot 传送门策略限制（P50 偏低是 bot 保守，非引擎不可达）。
- slash 反事实（8 向可斩）为同一 bot 的对照实验，非真机验证。
- 模拟产物：%TEMP%/rgbbox-review-20261010/{sim.ts,sim2.ts,w.ts}（esbuild 打包仓库引擎，仓库零改动）。
