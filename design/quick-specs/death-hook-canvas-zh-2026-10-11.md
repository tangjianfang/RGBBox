# 死亡钩子 + 画布中文化 — 2026-10-11

**分类**: #6 Addition（death hook）/ #9 Tweak（labels 注入）
**游戏**: Survival（结算与画布文本层）
**动机**: 回头维 1/5（死亡后无重开钩子）+ 上手维 2/5（画布英文直出 ~25 处）——首轮 #1-#4 修了张力/手感/进展，这两个维度没动

## 改动

### #6 死亡钩子（回头 1→3）
- `survival.ts`: 新纯函数 `deathHook(state)` —— lost 时计算：
  - `xpToNext`: 距下一次 levelup（state.xpNext - state.xp）
  - `evolveHint`: readyEvolutions 空时，找「缺 ≤2 级」的最近配方 → `{ recipeEffect, missing: [{id, need}] }`
  - 结算屏（R200 run recap 区）追加钩子行：「差 X 经验升级 / 进化『月刃』只差 1 级 fireRate」+ 一键重开按钮已有（recap 重开）则强化文案
- 引擎纯函数（可单测），view 层渲染

### #9 画布中文化（上手 2→3）
- 按 R235 session.js messages 模式：`survival.ts` 增 `SurvivalLabels` 冻结目录 + `state.labels` 注入（缺省=现英文值，兼容锁）
- 文案清单（~18 处）：`SURVIVE`/`ISLAND {n}`/`{m}:{s} {score}` 胶囊/`LV {n}`/`LEVEL {n}`/`BOSS`/`BOSS DOWN — ROULETTE +1`/`P{n} DOWN`/`P{n} REVIVED`/`+HP`/`+1 HP`/`{m} MIN SURVIVED`/`EVOLVED · {x}`/`COMBO ×{n}`/升级飘字 `+{id}`/受击 `-{dmg}`
- view 层 startSurvival 前/构造时注入 `t()` 结果（zh 态全中文，en 态零变化）

## 预期效果
死亡→看到「差一点」→立刻重开（回头）；打开即读懂全部画面文本（上手）

## 验证方式
- 单测：deathHook 构造「差 1 级配方」状态断言 hint；labels 注入断言画布文本 key 化（缺省英文兼容锁——既有测试零改动通过）
- 视觉：zh 态死亡结算截图 + 运行画面截图，AI 复核无英文直出

## 回归锁
缺省 labels = 现英文值（引擎单测不注入 labels 全绿）；非 lost 结算不受 deathHook 影响


---

## 实施记录（R262, 2026-10-11）

- 引擎：`SURVIVAL_LABELS` 16 键冻结表 + `labelsOf(state)` + `state.labels` 注入；`deathHook(state)`（xpToLevel + 缺 ≤2 级最近配方）。18 处文案点接线（横幅×7/HUD×5/飘字×6）。
- view：`survivalLabelsFor(t)` 双语注入（startRun/restart 两点）；recap 结算屏增钩子行（`games.recap.hookXp/hookEvolve`）。
- 测试：`survivalZh.test.ts` 9 用例（deathHook×4/兼容锁/注入×4，含 combo 中文裁决用例）。
- 视觉：`08-zh-canvas.png`（等级 1/第 1 座岛中文确认）+ `09-death-recap.png`（「差 6 点经验就升级」钩子行确认）；AI 报「COMBO 英文残留」经单测裁决为读图误报（注入后 fillText 零 COMBO 输出）。0 console error。
