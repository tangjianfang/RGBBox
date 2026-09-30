# G6 游戏 UX 专项评审 —— 四作（重点 Nova Swarm）上手→精通路径

- 评审人视角：survivor 品类游戏 UX 设计师（VS/Brotato/Goobies 玩家的上手-精通路径）
- 日期：2026-10-01。仓库：C:\tjf\github\RGBBox（只读，未启动应用、未跑 scripts/）
- 玩家画像（localStorage 线索，只读采纳）：casual 难度、coach=0（教练永久关）、autoPick=best（自动选升级）、四作均已 onboard、best：balloon 21180 / survival 7048 / slash 67 / tetris 无
- 标记：[V]=有 file:line / 截图证据；[I]=推断（未活体验证）
- 截图核对：docs/ui-review/r219/ 8 张 + r218/ 5 张，目录内容与任务描述相符（file 命令确认尺寸 1440×900 / 1440×1040 / 1200×700）。**本会话 Read PNG 仅返回 CDN 转存 URL、analyze_image 网关 400，截图未能视觉读取**——涉及视觉尺度的结论均为代码坐标推断，标 [I]，列入「未验证」。

---

## 一、摘要

R219 后的 ready 信息架构（画布下方面板+抽屉折叠）方向正确，首次配置负担已从「全量摊开」降到「4 组核心+7 组折叠」。但按真实玩家配置（autoPick=best + coach=0）走查发现：**survivor 品类的核心学习回路——升级三选一——被 autoPick 完全静默剥夺**（卡片 UI 一帧都不渲染，只有英文原始 ID 飘字），叠加首局引导第 2 步因计数 bug 恒真、教练条被单向关闭且无重开入口，三条教学通道同时失效，新玩家的「第一次 build 决策」教学为零。信息层另有硬伤：ready 角色血量预览硬编码 5（casual 实际 10）、局中/结算双分数口径不一致、画布 banner 全英文 vs DOM 全中文、图鉴缺 5 种 R218 新敌型、绿系颜色五连撞。循环摩擦已大体收敛（Enter 一键再开），但 fs 态死亡结算整体消失、「重开」按钮回 ready 需两步。P0×3 / P1×7 / P2×8 + 循环摩擦清单见 §九。

---

## 二、首次 30 分钟路径模拟（按真实玩家配置）

**步骤 1：hub → 点击 Swarm 磁贴**
- hub 四磁贴+资料卡+每日 chip（MiniGamesView.tsx:1919-1990）。磁贴带 best 分，无难度/模式摘要，决策成本低。[V] 1929-1936
- 每日挑战仅是 hub 内展示 chip（点击不进任何模式）；daily.ts 的种子仅用于记录校验，Swarm 引擎仍用 Math.random（25 处）——「每日挑战」实为「今日最好分」，非挑战模式。[V] daily.ts:22-31；grep Math.random：survival 25 / td 5 / slash 9；tetris.ts:256 仅 LAN 种子
- 困惑点：低。「这是什么游戏」靠磁贴副标题一句话。

**步骤 2：ready 配置负担盘点**
- 核心行（画布下方面板）：难度 4 chips（带 ×1/×1.5/×2/×3 倍率）+ 角色 3 chips + 人数 select + 场景 select ≈ 13 个选项。[V] 2412-2457
- 抽屉（默认折叠、全局记忆）：画面大小 3 + BGM + 90s 冲刺 + 输入配置 + 自动预选 select + 头像行 + 神器 8 chips ≈ 16 个选项。[V] 2484-2560
- 首次玩家真正需要的只有难度；**不需要看的有：场景（纯装饰却在核心行）、人数（默认 1P）、冲刺、输入配置、自动预选、头像、神器（未解锁）**——11 组里 7 组与首局无关，但抽屉已挡掉大部分，负担可接受。剩余噪音：场景 select 应下沉抽屉。[I]（配置分层判断）
- 画布 contain-fit 预留 430px 给面板（app.css .games-canvas width:min(100%,calc((100vh-430px)*900/520))），900px 高窗口下面板不滚屏、主 CTA 可见。[V] app.css:2602-2617
- **硬伤：角色 chip 血量预览硬编码 `HP {5 + character.hpMod}`**（MiniGamesView.tsx:2436），而血量基数按难度表 10/7/5/3（survival.ts:74-79）——casual 下光灵显示 HP 5 实际 10，标准 7，炼狱 3。这是玩家第一次做数值决策时看到的唯一数字，且是错的。[V]

**步骤 3：开局**
- 点「开始」→ running，banner `SURVIVE`（英文，44px，1.5s）。[V] survival.ts:858
- 首次玩家会看到 3 步引导条（本玩家已 onboard 不再出现）。引导第 2 步「升级时按 1/2/3 选强化」的完成判定 `Object.keys(s.taken).length >= 1` **恒真**——初始 taken 已含全部 12 键（值 0）。[V] MiniGamesView.tsx:125 vs survival.ts:640。即第 1 步（存活 4s）完成时第 2 步自动跳过，升级教学从未真正展示。
- coach=0：血量低/轮盘就绪/boss 将至/传送门出现 四类提示全部静默。[V] 2334-2343 + grep gamesCoach 仅 3 处（无重开 UI）

**步骤 4：第一次升级（核心问题）**
- xp≥xpNext → phase='levelup' + banner `LEVEL n`。[V] survival.ts:1592-1604
- **autoPick=best：同帧内 `applyUpgrade` 直接拍板**（MiniGamesView.tsx:1078-1086），phase 立即回 'running'，`levelup-overlay`（2628 行判定 `survivalSnapshot.phase === 'levelup'`）**一帧都不出现**。玩家能感知的全部反馈 = banner「LEVEL 3」+ 0.9s 英文原始 ID 飘字 `+fireRate`（survival.ts:915）+ 一簇粒子。
- 后果：三选一卡片（名称/描述/稀有度/已拿进度，本地化完备）是本项目做得最完整的决策 UI，却在挂机模式下 100% 不可见；玩家既学不到「有哪些强化」，也看不到「自动选了什么、放弃了什么」。survivor 品类 60% 以上的精通乐趣在 build 决策，这条路径被设置项无声切断。**这是本次评审唯一的 P0 级学习剥夺。**
- 即便手动模式：DOM 卡片最长延迟 180ms 才出现（snapshot 0.18s 节流，phase 变化无即时 publish）。[V] 1275-1281

**步骤 5：死亡 → 结算 → 再开**
- 'lost'：画布压暗 0.68 + swarm-summary 浮层（分数/击杀/时长/连击/金币 + build 回顾 + 「点『开始』再来一局」）。[V] survival.ts:1635、MiniGamesView.tsx:2683-2700
- 同时 run-recap 面板（顶部）显示**乘难度倍率后的分**（settleBest，597 行）而 summary 显示原始分（2687 行）——standard/hard 下同屏两个「得分」。casual=1× 时侥幸一致。[V]
- 再开路径：Enter / 手柄 Start 在 lost 态直接 startSurvivalRun 一键再战 ✓（2065-2068、1682-1694）；但「重开」按钮（restartSurvivalRun）重建到 ready 态，需再点一次「开始」——两步，语义与「再来一局」预期相悖。[V] 1718-1725
- fs 态：swarm-summary 与 run-recap 均 display:none，画布仅剩主按钮条——**全屏玩家死亡后没有任何结算数据**。[V] app.css:9812,9821-9822

**流失风险排序**：autoPick 剥夺学习（精通断层）> 教练/引导双失效（新手无护栏）> 角色预览假数据（首决策被误导）> fs 无结算（循环价值感断裂）。

---

## 三、游戏内信息设计

**HUD 布局（代码坐标，[I] 视觉未核）**
- 血条：左上 34,14 起 132×11/人，P1-P4 纵向堆叠；COMBO 胶囊 118×18 在血条组下方（combo≥3 才出现）；右上信息胶囊 200×20（ISLAND/时间/分数）；XP 条底部通栏 8px 高 + LV 胶囊；banner 居中 y=110。edge-anchored、不进中央 60% 的契约达成。[V] survival.ts:2054-2102
- 字号：P 标签 10px、信息胶囊 11px、LV 12px、飘字 13px。等比缩放下占比恒定（满屏 ≈ 屏高 1.1-2.5%），10px 的 P 标签偏小但非关键信息。[I]
- 状态冗余：窗口态 DOM stat-grid（HP/LV/击杀/分/best）与画布 HUD 双份；fs 态 fsStatusLine 又画一份 HP/LV/岛。信息不冲突但三处维护口径要小心（已出现双分数问题，见上）。[V] 2284-2299、2092-2103

**banner 文案 i18n 缺口（任务点名项，确认存在）**
- 画布硬编码英文：`SURVIVE`/`ISLAND n`/`BOSS INBOUND`/`BOSS DOWN — ROULETTE +1`/`LEVEL n`/`n MIN SURVIVED`/`P1 DOWN`/`P1 REVIVED`。[V] survival.ts:858,893,1125,1160,1601,1609,829,1584
- 飘字原文 ID：`+${id}`、`+${upgradeId} x${levels}`、`${stat} +${pct}%`、`+${xpValue} XP`。[V] 915,936,940,952
- 同类：TD banner `WAVE n·词缀`（td.ts:381，词缀 label 已是中文，混排）、TD 塔名/描述全英文（td.ts:182-186，侧栏卡片直显）。
- 反例证明可行：td 的 ready/won/lost 标题已走 view 传参本地化（MiniGamesView.tsx:1061-1068）——survival 的 banner/飘字照搬该 seam 即可。DOM 层（升级卡/轮盘/summary）已全本地化，缺口只在画布层。

**敌人威胁可读性（8 敌型）**
- 颜色/形状矩阵：chaser 玫红圆 / sprinter 琥珀三角 / brute 粉方块 / tank 灰蓝大方块+暗核 / swarm 草绿小圆(6px) / shooter 紫箭镞 / splitter 橙双球 / healer 翠绿圆+白十字+90px 常显环。[V] survival.ts:1881-1974
- **绿系五连撞（色弱高风险）**：swarm `#a3e635` / healer `#34d399` / XP 珠 `#4ade80` / 敌方血条 `#86efac` / 复活珠 `#4ade80`。[V] 1885-1888,1827,1989,1841。形状补救存在（十字/菱形珠/小圆）但 6px swarm 与 XP 珠在混战密度下靠形状区分不现实；敌血条绿色叠加在绿怪上方更糊。
- 另：敌弹 `#fb7185` 与 chaser 本体完全同色（1064 vs 1889），靠外圈假发光分层，弱光下难辨。[V]
- **图鉴缺 5 种新敌型**：codex 仅 chaser/sprinter/brute/elite/boss（MiniGamesView.tsx:2909），R218 新增 tank/swarm/shooter/splitter/healer 无条目、i18n 无 `games.codex.enemy.tank` 等键——玩家唯一能查「这个绿十字是什么」的入口不覆盖一半敌型，healer「优先击杀」的教学只能靠猜。[V]

**off-screen 威胁指示（R219.9 后核）**
- 出生预警存在：每次 spawn 事件前登记 0.5s 红色箭头（▲▶▼◀，26px，边内 46px）。[V] survival.ts:1706-1719、juice.ts:28-43
- 不足：①箭头固定在**边中心**而非实际入场点（900px 宽的边，入场点可偏 400px）；②sprinter 132px/s 穿 30-80px 外环仅 0.23-0.6s，**最快的敌人几乎无预警**；③swarm 整包 8-12 体只 1 枚箭头（无规模信息）；④同边多枚预警完全重叠绘制。[V] 959-989,984-988
- 1P 固定视口下 spawn 环就在视口外 30-80px、玩家钳在视口内，敌入屏快——预警是目前唯一前置信号，精度问题被放大。[I]
- boss 出场：banner 1.6s + 无预警箭头（spawnBoss 不 push warning），移速 34px/s 缓入，可接受。[V] 1118-1127

---

## 四、中场决策 UX

- **三选一卡片信息量**：名称+描述+`taken/max`+稀有度描边（DOM 与 fs 画布双实现）。**无「当前值→+1 后值」对比**（如 射速 2.0/s→2.44/s）、无新强化高亮、无稀有度图例。VS 玩家做决策的关键输入（边际收益）缺失。[V] 2628-2645、2124-2145
- **轮盘**：pick 双轮（道具/属性）+ 结果（稀有度/领取 vs 分解+XP）。分解按钮显示该稀有度的确定 XP（期望透明✓）；但 pick 阶段不显示两轮的构成与稀有度概率，luck（+12%/级稀有率）不在任何局内 UI 呈现。[V] 2648-2682、swarmMeta.ts:255-264
- **局中 build 总览**：窗口态侧栏「本局构筑」实时可见✓（2806-2825）；**fs/focus 态侧栏隐藏且画布 HUD 无对应物**——全屏玩家局中看不到自己已选强化（只有死亡结算有 build 回顾）。VS 品类「Tab 查背包」是高频动作。[V] app.css:9813、fsDraw 2083-2158 无 inv 绘制
- 轮盘开启：boss 击杀后 pendingSpins>0 → 画布下缘脉冲 FAB「◎ 轮盘 ×n」（fs/focus 均保留，CSS 隐藏清单未含 spin-fab ✓）；coach 关闭后 FAB 是唯一提示（BOSS DOWN banner 为英文）。[V] 2701-2703、app.css:2501-2516、9818-9820 注释

---

## 五、控制 UX

- WASD/方向键双支持 ✓（survival.ts:1285-1286，且 P1 配置映射后两者恒可用）。
- 手柄：每帧轮询、assignGamepads 显式绑定+余柄补位、Start/Options=buttons[9]（PS5 standard mapping）+非 standard 兜底 16、运行态 Start=暂停/恢复、左摇杆死区 0.18 幅度缩放。[V] MiniGamesView.tsx:621-677,2054-2070
- 暂停：Esc 分层（专注退出>fs 暂停>窗口运行态暂停>退出 fs），pause 浮层含 继续/重开/全屏(非 fs 时,R219.2 补)/退出全屏/hub ✓。[V] 1424-1445,2599-2617
- **缺口：窗口态 levelup/roulette 相位 Esc 无路可退**——非 running 直接落到「退出全屏」分支（无实际效果），选择是硬模态；且暂停浮层不含音频开关。[V] 1436-1441
- 4P 键位：默认 P1 WASD+柄0 / P2 IJKL / P3 TGFH / P4 8426，无重叠；≥2P 时 ready 席位行逐人显示 键位+分得手柄 ✓。[V] inputConfig.ts:23-32、MiniGamesView.tsx:2477-2483
- 全屏时机：pref=focus 开局自动满幅、终局自动退出 ✓（1844-1851）；运行中 header 隐藏后 OS 全屏入口在暂停浮层（R219.2 补）✓。

---

## 六、结算与循环

- summary 信息层级合理：★分/击杀/时长/最佳连击/金币 + 稀有度描边 build chips + 再开提示；recap 补 delta%/best/高光/教练句。但两面板同屏且**分数口径不同**（原始 vs ×难度，见 §二 步骤 5）。[V]
- fs 态结算整体消失（§二）。[V]
- 再开点击距离：Enter/Start 一键 ✓；「重开」按钮两步（回 ready）；summary 浮层内无按钮，鼠标用户需移到顶部 header（lost 态恢复显示）——建议 summary 内嵌主 CTA。[V] 2265-2276
- Tetris restartTetrisRun 丢难度参（`initialTetrisState()` 无 difficulty），重开后回默认档。[V] 1825-1829

---

## 七、meta 菜单

- 永久商店：pips ●●○+成本+「每级 +10%」描述；无当前累计值展示（+10%×2 的感知要心算），luck 的实际作用面（三选一权重+轮盘稀有率）未在商店文案外呈现。金币=score/20，casual 7048 分≈352 币，与 50-90 基价的经济闭环成立。[V] 2826-2850、swarmMeta.ts:88-97,169-171
- 成就：12 项带未达成条件文案 ✓（2851-2865）；新成就 toast 4.5s（2704-2706）。
- 角色：3 人开局全解锁（无解锁条件传达需求）；神器 8 个锁条件文案 ✓（2539-2559）。
- 每日：hub chip 显著性低且无模式实体（§二 步骤 1）。

---

## 八、可访问性

- 色弱：绿系五连撞 + 敌弹/chaser 同色（§三）；受击红 `#f87171` vs chaser 玫红 `#fb7185` 邻近色，靠白闪/震动区分。无色盲模式/形状替换层。[V]
- 字号：HUD 10-13 逻辑像素，等比缩放（fs 满屏 dpr≤2，R217/R219.7 backing 随 CSS 盒），相对占比恒定；10px 的 P1-P4 标签是下限。[I]（视觉未核）
- 减少动画：**无任何用户开关**——震屏（受击 6/boss 9）、hit-stop（0.03-0.06s）、受击白闪 0.15s、低血 vignette 0.8Hz 呼吸、combo 脉冲；R219.7 的动态背景停用是编译期常量 `DYNAMIC_BG_ENABLED=false` 而非用户偏好。grep 无 reduce-motion/reduceMotion。前庭敏感玩家无退路。[V] survival.ts:48、app.css grep
- 难度伤害档失效：`Math.max(1, round(mult))` 使 casual 0.65/standard 1/hard 1.35 全部=1，仅 insane=2——「休闲更温柔/困难更痛」的伤害维度不存在，难度体感只剩血量基数+敌速 8%。[V] survival.ts:86-89

---

## 九、游戏 UX 补丁清单

**P0（学习剥夺/信息缺失）**
1. autoPick 剥夺三选一（§二 步骤 4）：保留自动拍板但补展示——1.5-2s「已自动选取：<本地化名>（描述）」胶囊+被弃两项灰显；或前 3 级强制手动。设置项文案加「将隐藏升级选择界面」警示。MiniGamesView.tsx:1078-1086 / survival.ts:1599-1603
2. 首局引导步 2 恒真：`Object.keys(s.taken).length>=1` → `Object.values(s.taken).some(v=>v>0)`。MiniGamesView.tsx:125
3. 角色血量预览硬编码 5：接 `SURVIVAL_DIFFICULTY_PARAMS[difficulty].hp + hpMod`。MiniGamesView.tsx:2436

**P1**
4. 画布 banner/飘字本地化（survival 全部 + TD WAVE/塔名）：照 td 的 view 传参 seam。survival.ts:858 等 10 处、td.ts:381,182-186
5. 双分数口径统一（局中/结算标原始分+倍率角标，或全部 ×mult 后呈现）。MiniGamesView.tsx:597 vs 2687
6. 图鉴补 tank/swarm/shooter/splitter/healer 五条目+i18n 键（healer 的「优先击杀」教学入口）。MiniGamesView.tsx:2909
7. 绿系配色去撞：XP 珠改青/白、敌血条改白、复活珠改金环；敌弹与 chaser 分色。survival.ts:1820-1829,1841,1985-1990,1064
8. fs/focus 局中 build 总览：暂停浮层或 Tab 呼出背包（复用死亡 build chips 组件）。fsDraw 2083-2158
9. coach 重开入口（设置页或暂停浮层开关）+ fs 画布化教练条（FR-G01.4 spec 未落地）。MiniGamesView.tsx:2334-2343、fsDraw 无 coach 绘制
10. 出生预警箭头：位置跟随实际入场点、swarm 按包量加倍、sprinter 延长至 0.8s 或提前登记。survival.ts:959-989,1706-1719

**P2**
11. fs 死亡结算画布化（score/kills/time/combo/build 至少一行化呈现）。app.css:9812,9821
12. 难度伤害档差异化（casual 0 伤重试宽恕或 hard→2）。survival.ts:87-89
13. levelup/roulette 相位 Esc 可退/可暂停。MiniGamesView.tsx:1436-1441
14. 减少动画开关（震屏/hit-stop/白闪/vignette 各自或打包）。survival.ts:48 编译常量→用户偏好
15. 升级卡补「当前→+1 后」数值对比；轮盘 pick 阶段显示构成与稀有度权重。2636-2644,2650-2663
16. 每日挑战实体化（种子注入引擎——需先落 OD-05 的 mulberry32 替换，当前 survival 25 处 Math.random）或降级改名为「每日打卡」。daily.ts 头注 vs grep
17. summary 浮层内嵌「再来一局」主按钮；「重开」与 Enter 语义对齐（直接开局或改名「回到配置」）。1718-1725,2698
18. 受击方向指示（四缘短红条）；Tetris 重开保留难度。1490-1516 缺、1826

**循环摩擦消除清单**
- ✅ 已达标：Enter/手柄 Start 死亡一键再战；Esc 分层暂停；fs 内主按钮条 lost 态恢复；专注模式开局自动进入/终局自动退出。
- ⬜ 待办：重开按钮两步（P2-17）；fs 无结算即无「就地再战」的情绪闭环（P2-11）；每日挑战无「今日再试一次」直通；summary 与 recap 合并为单面板（减一次视觉跳转）。

---

## 十、已修复核对表（R219/R218 承诺项代码核对）

| 项 | 状态 | 证据 |
|---|---|---|
| R219.3 ready 面板移画布下方+单主 CTA+ready 态隐藏 header 双按钮 | ✅ | MiniGamesView.tsx:2406-2411,2263-2276；app.css .ready-panel |
| R219.7② 运行中 fs 按钮条隐藏+Enter/R 同门控 | ✅ | 2149-2155,1363-1369 |
| R219.9 单人固定视口（相机钉死零滚动），2P+ 保留跟镜头 | ✅ | survival.ts:1281-1283,1415-1418,735-744 |
| R219.2 暂停浮层补「全屏」按钮（运行态 header 隐藏后唯一入口） | ✅ | 2605-2609 |
| R219.8 不透明上下文+静态背景离屏缓存 | ✅ | 976,1119-1133 |
| fs 态轮盘 DOM 保留（无画布等价物故不隐藏）+ spin-fab 不在隐藏清单 | ✅ | app.css:9818-9820 注释；grep .spin-fab |
| startSurvivalRun 对 levelup/roulette 静默 guard | ✅ | 1676-1678 |
| restartSurvivalRun 保留 scene/sprintSeconds | ✅ | 1720-1723 |
| Esc 四层分发独立 effect | ✅ | 1424-1445 |
| 手柄 Start 四作统一（含 PS5 Options） | ✅ | 659-667,2054-2070 |
| R218 U7 ≥2P 席位行（键位+手柄） | ✅ | 2477-2483 |
| R218 U3 上次选择全记忆（难度/人数/场景/冲刺/抽屉） | ✅ | 435-462,2026-2043 |
| 已知缺陷「enterGame 残留 running（ready 被旁路）」 | ⚠️ 仍在 | enterGame 1447-1454 无任何 phase 重置；running 态离开再进直接续跑、ready 面板不出现 |
| 已知缺陷「tdHover 失效」 | ⚠️ 仍在 | 悬停预览读闭包 tdHover/selectedTower（1230-1231），effect deps（1317）不含二者 → 恒为初值 null；selectedTower 同因过期 |

---

## 十一、未验证项 / 局限（活体复测清单）

1. **截图视觉读取失败**（Read→CDN URL、analyze_image 400 网关错）：HUD 实际观感/字号在 4K 物理像素下的可读性、r219 八张截图的裁切/溢出复核——全部标 [I]，需活体 CDP 截图复核（参考 memory：temp 驱动 + 先查 out/renderer mtime）。
2. 未启动应用：所有运行时行为（autopick 无闪现、fs 结算空白、Esc 分层实际手感）为代码路径推断 [I]，需真机复测。
3. PS5 手柄 Options/摇杆、4P 分屏键位冲突实机、音效可听性（healer/shooter 有无区分音）未验证。
4. 玩家数据目录未自行读取（只采纳线索块）；gamesBest tetris 无记录与「已 onboard tetris」并存，疑首局未结算即退出，未查证。
5. 色弱模拟（deuteranopia/protanopia 渲染验证）未做，仅色彩距离推断。
