# 进化可视化 + 击退钉死 + 空间哈希 — 2026-10-11

**分类**: #5 Tweak / #7 fix / #8 perf
**游戏**: Survival
**动机**: 进展维（进化配方存在但玩家不可见——R220.3 已接线却是暗墙）；击退逐帧 12px 在高射速下把敌人钉死墙角（威胁感消失）；600 敌 O(n²) 26ms 帧崩（质变卡 17× 击杀后更易触发）

## 改动

### #5 进化可视化（进展 2→3）
- 升级卡：新纯函数 `evolutionProgress(taken, evolved)` → 对每张卡返回 `{ inSight: boolean, missing: number }`（该卡 id 出现在某未完成配方 requires 且差距 ≤2 级）→ 卡面小标「进化在望」
- codex 图鉴第五区：EVOLUTIONS 配方表（id → requires 名单 + effect 名）
- 进化演出已有（R220.3 banner+金爆），不动

### #7 击退钉死修复（张力）
- `survival.ts` 敌人增 `knockCd?: number`；击退位移仅 `knockCd<=0` 时生效并置 0.15s——高频弹不再逐帧连推，敌人保有逼近速度

### #8 生存性能：空间哈希 + 视口裁剪（张力）
- 新 `spatialGrid.ts` 纯工具：`buildGrid(items, cell)` / `forEachPair(grid, fn)` / `queryNear(grid, x, y, r)`
- tickSurvival 三处 O(n²) 改哈希：enemy-enemy 分离、bullet-enemy 命中、homing/链电 nearest 查询
- 视口外敌人（spawn 环外 60px）跳过绘制粒子层细节（保留实体绘制）

## 预期效果
选卡界面看得到进化路径（期待感）；敌人不被钉死（威胁回归）；600 敌帧耗时 26ms→<5ms（大场面不卡）

## 验证方式
- 单测：evolutionProgress 三态（远/在望/已进化）；knockCd 击退节流断言（高频弹 1s 内位移有界）；spatialGrid 与朴素 O(n²) 对拍（同输入同结果）
- 性能基准：esbuild 打包后 600 敌 tick 100 帧计时，前后对照入 PRD

## 回归锁
spatialGrid 对拍全量一致；既有 1644 测试零回归


---

## 实施记录（R263, 2026-10-11）

- `evolutionInSight(taken, evolved, id)` 纯函数（swarmMeta；配方总缺口 ≤3 且该卡可推进）→ 升级卡「进化在望 → {effect}」金标 + codex 第五区（4 配方表）。
- 击退节流：敌 `knockCd` 0.15s（高频弹不再逐帧 12px 钉死）。
- 空间哈希：`spatialGrid.ts`（buildGrid/gridNear，cell 64）；tick 三处 O(n²) 改造（homing 索敌限 240px/弹命中候选/分离配对去重 b.id>a.id）。
- 性能基准（`scripts/r263-perf-bench.mjs`）：600 敌+八向弹幕 **2.14ms/帧**（历史 ~26ms，**12×**）；1200 敌压力档 3.32ms。红线 PASS。
- 行为回归：`r260-balance-sim.mjs` 复跑——transform 组存活 P50 296s（改造前 296s）、等级 P50 36 vs 34、击杀 P50 1907 vs 2069（种子方差内），零行为漂移。
- 测试：`survivalPerf.test.ts` 7 用例（evolutionInSight×4/knockCd 节流/网格对拍 200 点×10 查询同朴素结果/空网格安全）+ codex 计数 37→41。
