# G4 · 迷你游戏 UX/产品评审（游戏 PM + UX 工程师视角）· 2026-10-10

> 对象：`review/vision-gesture-commercial@6ebdce8`（工作区 clean）。方法：代码全量走查（MiniGamesView.tsx 3126 行 + games/*.ts + i18n games.* 976 键）+ 截图核验（docs/ui-baseline/games.png 当前基线、docs/screenshots/r101/r133/r142 系列）。置信度：Confirmed=代码逐行可证；Likely=代码推演+截图佐证；Speculative=判断题。
> 上轮（2026-10-01 REVIEW-GAMES-2026-10-01.md）已修项本次**核实不再报**：autoPick 学习回路（卡片强制渲染+高亮+1s 延迟拍板+手动点卡取消，MiniGamesView.tsx:1211-1228、1965-1971，CSS app.css:2131 脉冲动画✅）、难度四档×倍率（hud.ts:19-31✅）、引导步 2 恒真（:129 改判 taken 值>0✅）、进化接线/死亡墙（R220✅）、hub 视觉走查（R210，基线截图干净✅）。

---

## 焦点 1 · 首次体验完整路径走查

**路径还原**（代码逐步）：
1. 进 hub（MiniGamesView.tsx:1990-2143）：4 游戏瓦片+1 ghost 瓦片+「👁 第一次用手势？」入口+每日任务行+街机档案（局数/时长/连胜）。截图 docs/ui-baseline/games.png：全中文、零进度态干净。
2. 点瓦片 → enterGame（:1569）→ 画布下 ready 面板（:2585-2746）：大号开始+难度 4+角色 4（含 HP 预览）+人数+场景+折叠抽屉；偏好全记忆恢复（:460-488）。
3. 开局 → 画布 banner「SURVIVE」（英文）+ 引导条 1/3（:2504-2512）。
4. 升级 → DOM 三选一中文卡（:2810-2827），默认 autoPick=off 手动选。
5. 死亡 → finishSurvivalRun（:664-693）：分数/金币/成就结算，swarm-summary（:2865-2882）+ run-recap（:2481-2501）双面板。
6. 元进度消费：金币商店在 survival 屏右侧栏（:3012-3036）。

**流失点（按严重度）**：

- **[FE-1] P1 · 全屏/专注模式下首局引导与教练全不可见，但照常推进并消耗**。`.coach-bar`（含 onboard 变体）在 fs 与 focus 均被隐藏（app.css:10130-10143、10467-10477），fs 画布 HUD（fsDrawRef :2238-2337）无引导等价物；而引导步进在 loop 内照常判定、完成即 markOnboarded（MiniGamesView.tsx:1410-1413）——「进游戏先点全屏」的新玩家一次性教学被静默吞掉，永不再现。**Confirmed**。
- **[FE-2] P1 · 「每日任务」语义稀释**：settleBest 对任意局无条件 recordDaily（:656），普通非种子局也点亮 hub 每日芯片（:2118-2124）；slash/tetris 的每日开关未接（R220.6 自认）。玩家理解的「每日挑战（共同种子棋盘）」实际等于「今天玩过」。**Confirmed**。
- **[FE-3] P2 · 经济/元进度是 Swarm 独占且 hub 不可见**：金币只有 finishSurvivalRun 产出（:664-693），TD/Tetris/Slash 零金币；商店/角色/神器只在 survival 屏出现，hub 无任何金币或元进度入口。跨游戏游玩的新玩家感知不到元系统存在，Swarm 死亡结算也没有「去商店」的引导 CTA。**Confirmed**。
- **[FE-4] P2 · 死亡后「再来一局」是纯文本**：swarm-summary 的 games.summaryAgain 渲染为 `<p>`（:2880），非按钮；重开依赖 header 按钮（lost 态才重现，:2444-2455）或 Enter/R。多一层视线转移。**Confirmed**。
- **[FE-5] P2 · 文案与实现漂移**：XP 珠已改天蓝 #38bdf8（survival.ts:1983、2016，R220.5 五连撞色修复），规则文案仍写「拾取绿色经验碎片/Collect green XP shards」（i18n/index.tsx:2792、926）。**Confirmed**。
- **[FE-6] P3 · hub ghost 瓦片**（:2093-2099「即将推出」）无信息量，挤占视线。**Speculative**（取舍题）。

## 焦点 2 · 视觉引导（coach.ts）

- **开启率不可度量**：默认开（:318-320，`rgbbox:gamesCoach!=='0'`）；但上轮唯一真实用户画像已手动关闭（REVIEW-GAMES-2026-10-01.md:4「coach 已关闭」），且遥测（domain/gamesTelemetry.ts:14-25）只记 run，无教练展示/点击/关闭事件——「开启率如何」当前**无法回答**，这本身就是发现。**Confirmed**。
- **时机：帮助窗口只有 ≤3 秒**：每 3s 评估一次（:1402-1427），pickHint 30s 去重（coach.ts:20、26-34）；单条提示显示到下次评估即被 setCoachHint(null) 清掉——warn 级「血量低」（survival.ts:2275 priority 85）恰在玩家最忙时刻闪 3 秒即消失且 30s 不再现，读不完也帮不上；反之若条件持续，条会以 3s 节奏闪现/消失形成呼吸感。**Likely**（时序由代码推演）。
- **正确的部分**：引导期间教练静默（:1406）✅；只在 running 相位展示（:2513）✅； praises/warns/tips 分级配色（app.css:10064-10066）✅。
- **fs/focus 完全缺席**：见 FE-1，教练条无画布等价物——全屏玩家（核心游戏场景）得到零策略帮助。**Confirmed**。
- **无学习衰减**：提示集每作固定 5-6 条（survival.ts:2272-2280 等），无「已掌握」降频机制，老玩家周期性重看同样提示直到永久关闭——与真实用户关闭行为吻合。**Likely**。

## 焦点 3 · 双语断裂（上轮 G6）修复进度

**已修**：fs 画布 HUD 全面 i18n 化（fsDrawRef :2238-2337——状态行/塔商店/三选一卡/死亡结算全走 t()）✅；DOM 层全中文✅；coach/onboard 键化✅。（R235 是 vision 引擎 session.js 的 i18n，与游戏画布无关。）

**未修——引擎内画布文本仍全英文（~25 处，比上轮 10 处口径更全；上轮推荐第 8 条「画布 banner/飘字中文化」未进 R220 实施清单）**：
- survival.ts：:917 `SURVIVE`、:955 `ISLAND n`、:979 `EVOLVED ·`、:1211 `BOSS INBOUND`、:1246 `BOSS DOWN — ROULETTE +1`、:1752 `LEVEL n`、:1764 `n MIN SURVIVED`、:888 `Pn DOWN`、:1735 `Pn REVIVED`、:997 `+${id}`（英文升级 ID 飘字，上轮点名项仍在）、:1019/:1023 轮盘结果英文、:2209 `BOSS`、:2244 `COMBO ×n`、:2253 `ISLAND n mm:ss score`、LV 标签。
- td.ts：:385 `BOSS WAVE n — elites inbound`、:580 `BLOCK`、:582 `ARC`。
- tetris.ts：:676-680 `TETRIS!`/`n LINES`/`T-SPIN!`/`COMBO ×n`/`B2B ×1.5`。
- MiniGamesView.tsx：:1186 `NEW BEST!`、:1638 `Early +n`、:1697 `Need coins`、:1701 `Blocked`。
- 截图佐证：docs/screenshots/r101-levelup.png（画布 `COMBO ×24`/`LEVEL 2` 英文 vs 升级卡全中文，同款字符串现行仍在）。**Confirmed**。结论：G6 约修一半（新增面全中文），存量引擎面原样。

## 焦点 4 · 游戏间切换（hub→游戏→hub）

- **加载感：无**（canvas+引擎 refs 常驻、screen 即时切换）；但 **BGM 每次进出游戏从头重启**（:1095 startBgm / :1434 stopBgm，effect 随 screen 重建）——切换接缝可闻。**Confirmed**。
- **[SW-1] P2 · 弃局语义三作不一致**：backToHub 仅对 survival 中途局强制按 lost 结算（:1578-1592，R220.1⑧）；TD/Tetris/Slash 中途局静默冻结在 ref，重进原相位继续——survival 弃局=判负入账，TD 弃局=隐形暂停，hub 瓦片也无「进行中」标识。玩家心智模型分裂。**Confirmed**（代码）；体验影响 **Likely**。
- **[SW-2] P3 · 回 hub 即清空 recap**（:461），战绩无处回看（遥测只在 profile 聚合）。**Confirmed**。
- 做得好：Esc 四层分级（:1546-1567）、手柄 Start 全局一致（:2209-2225）、ready 偏好全记忆（:460-488）。✅

## 焦点 5 · 产品定位：独立模块 vs 闭环一环

- **体感：深度闭环 ✅**——vision 是键盘/手柄外第三输入源（pollVision :811-1005），手势开局/轮盘选择/方向环/Tetris 双捏硬降确认（R249）、四步向导+hub 入口（:2104-2114，R246）、最小化摄像头收敛（R250）。游戏是 RGBBox 体感能力的最佳展示场与留存钩子。
- **[PD-1] P1（战略）· 灯效：零联动**——游戏事件（受击/升级/boss/连击/结算）不产生任何 LED 输出；进 games 视图后 LED 预览引擎直接停 tick（useEngineLoop.ts:204-207，`previewVisible = activeView==='workspace'`，仅 overlay 投屏时继续跑与游戏无关的旧效果）。「RGB 灯效客户端」的核心资产（灯）在自家游戏里完全沉默；上轮 G7 的差异化候选 G-A~E（游戏画面投屋/成就灯仪式/战绩卡/每日主题色/节拍弹幕）全部未立项。游戏目前是**独立模块**，不是产品闭环的一环——这是最大战略缺口，也是最自然的差异化护城河。**Confirmed**。
- **音频：独立孤岛**——游戏自带 BGM/SFX 合成器（games/sfx.ts），与 useAudioAnalyzer/音频工作室零互通（MiniGamesView 无引用）。节拍弹幕类联动同样未做。**Confirmed**。

---

## 建议修复优先级（供 PRD R-N 立项参考）

| # | 项 | 严重度 | 置信度 |
|---|---|------|--------|
| 1 | PD-1 游戏事件→灯效最小闭环（受击红闪/升级浪涌/boss 告警色，走 previewEngine 已有帧管线） | P1 战略 | Confirmed（缺口）|
| 2 | FE-1 fs/focus 下引导+教练画布化（fsDrawRef 已有面板基建，加 onboard/coach 两块） | P1 | Confirmed |
| 3 | FE-2 每日芯片只认种子局（settleBest 判 swarmDailyOn/today seed）+ slash/tetris 补开关 | P1 | Confirmed |
| 4 | G6 存量：引擎 banner/飘字 i18n 键化（引擎吐 key、view 注 t()，R159.3 先例） | P2 | Confirmed |
| 5 | SW-1 弃局语义统一（四作都结算或都暂停+hub 进行中角标） | P2 | Likely |
| 6 | FE-3 元进度 hub 化（瓦片/档案区露出金币与下一步目标） | P2 | Confirmed |
| 7 | FE-5 文案漂移清理（绿色→天蓝）+ coach 展示时长 3s→8s 且加遥测事件 | P3 | Confirmed |

## 附 · 证据文件清单

- 主视图：src/renderer/src/components/MiniGamesView.tsx
- 引擎：src/renderer/src/games/{survival,td,tetris,slash,hud,coach,daily,sfx}.ts
- 样式：src/renderer/src/styles/app.css（fs/focus 隐藏清单 10130-10147、10462-10477）
- 引擎门控：src/renderer/src/hooks/useEngineLoop.ts:180-215
- i18n：src/renderer/src/i18n/index.tsx（games.* zh:2747+ en:855+）
- 截图：docs/ui-baseline/games.png（当前 hub 基线）、docs/screenshots/r101-levelup.png（双语断裂实证）、r133-swarm-playing.png、r142-slash-*.png
