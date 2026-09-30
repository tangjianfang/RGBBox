# G1 · 游戏系统设计评审 —— Nova Swarm（主）+ 另三作品类评估

> 评审人视角：roguelite/survivor 品类系统设计师（对标 Vampire Survivors / Brotato / Goobies 设计法）
> 日期：2026-10-01。仓库只读；全部结论基于源码精读 + 真实引擎 Node 模拟（esbuild 打包 `survival.ts`/`swarmMeta.ts`/`swarmAutoPick.ts`，sfx stub，Math.random 以 mulberry32 逐种子替换，引擎 `tickSurvival` 原样驱动）。
> 玩家画像锚点（真实 localStorage 只读数据）：casual 难度、wisp、swarmAutoPick="best"、survival best=7048、教练条关闭。

---

## 一、摘要（总评）

Nova Swarm 的**系统骨架是完整的**（角色/稀有度/轮盘/局外六维/神器/成就/连击/岛屿/弹幕 boss 全都在代码里），但**数值平衡把这套骨架的绝大部分锁在了玩家到不了的地方**：

1. **中位局在 68~98 秒全灭**（四配置 × 24-48 种子模拟，0 生还），而 boss/轮盘/传送门/岛屿/三种敌人全部排在 90-105s 解锁——对真实用户（best 7048 ≈ 模拟 casual+autoPick best 的 24 局最优 6510）**整套元游戏大概率是从未见过的暗内容**。15 分钟的 survivor 设计在数值上不存在。
2. 根因是**三重节流叠加**：基础 DPS 2.0 vs 刷怪吞吐 4-7 units/s；XP 曲线慢（5+3L，50 XP 才 L5）；关键成长卡被稀有度权重压制（前 8 级见到 multishot 的概率仅 44%）。
3. 用户开启的 `autoPick="best"` 是**反优化 AI**：「最少已取」启发式把选择最多的给了陷阱项（thorns/bulletSpeed 各 12.2%），给 build 核心的最少（multishot/blade 4.3%），并且开启后三选一决策面被完全移除（1 帧自动拍板）。它把 casual 死亡 P50 从 95s（贪心策略）提前到 82s，分数腰斩。
4. 曲线形状是**「墙或雪球」的二值系统**：要么 90s 死，要么某条幸运种子滚雪球到 40 万分 / L30 / 8 岛。没有「紧张但可控」的中间态，也就没有 VS 品类赖以为继的心流带。
5. 单点常量补丁只能把墙从 ~85s 推到 ~115s（+35%，已模拟验证）；要得到 4-10 分钟的中位局需要**结构性改动**（每级 DPS 地板、AoE 可及性、导演改为威胁预算制）。

另三作：Tetris 现代规则**品类完整**（SRS/hold/lock delay/T-spin/B2B/连击/幽灵/7-bag 全在）；TD 塔经济+词缀波成立；Slash 为 60s 短局节奏斩击，判定窗合理。品类层面无硬伤。

置信度：发现 S-1/S-2/S-3/S-4/S-5/S-6/S-8 为 **Confirmed**（代码+模拟双重佐证）；S-7/S-9/S-10 为 **Confirmed/Likely**（代码确凿，未跑真机）；对标差距矩阵为设计判断（Speculative 性质）。

---

## 二、模拟方法与曲线（文本表）

### 2.1 方法

- 引擎：真实 `tickSurvival(state, 1/60)`，无任何逻辑改动；sfx 以空 stub 替换（Node 无 WebAudio）。
- 玩家 bot v2：16 方向前瞻采样（威胁斥力/墙体斥力/珠与传送门引力/敌弹预判），近似中上水平人类风筝走位；对照 v1 势场 bot 与「懒拾取」变体，死亡 P50 差 <5%（走位保真度对结论不敏感）。
- 升级策略：`best`（完全复刻 swarmAutoPick.autoPick + MiniGamesView 自动拍板）与 `greedy`（multishot>damage>fireRate>pierce>blade>crit>magnet>speed>…）。
- 轮盘：boss 击杀后立即开盘领道具轮（乐观上界）。
- 种子：每配置 12-48 个；`maxTime` 150-420s（后期 200+ 敌的 O(n²) 分离循环使 15min 全长局模拟代价过高）。

### 2.2 主曲线：死亡时间与分数（P50/P90，秒 / 分）

| 配置 | 死亡率 | deathP10 | deathP50 | deathP90 | scoreP50 | scoreP90 | boss击杀/24局 |
|---|---|---|---|---|---|---|---|
| casual + best（真实用户档） | 100% | 65 | **82** | 98 | 1,407 | 2,894 | 0 |
| casual + greedy | 100% | 69 | **95** | 104 | 2,865 | 6,448 | 0 |
| standard + best | 100% | 54 | **68** | 83 | 1,257 | 2,778 | 0 |
| standard + greedy | 100% | 57 | **75** | 89 | 1,701 | 4,188 | 0 |

真实用户 best=7048 与 casual+best 的 24 局最大值 6510 同量级 → **该用户极可能从未击杀 boss、从未进过轮盘/岛屿**。

### 2.3 中位局时间线（casual+greedy，幸存代表局）

```
t=60s:   16 敌存活   HP 8/11   L3   48 kills   25 珠未拾   最近敌 156px
t=120s: 170 敌存活   HP 10/11  L17  434 kills  10 珠      最近敌 5px   ← 雪球分支
t=180s: 223 敌存活   HP 3/11   L29  1089 kills 17 珠      29px → 189s 死亡（1 boss 杀）
```

刷怪间隔实测（directorSpawnInterval，满血因子 0.85）：10s→2.39s，30s→1.03s，60s→0.82s，90s→0.62s，120s→0.42s，≥180s→**0.27s 地板**（+60s 后 35% 双投 → 有效 ~5 事件/s，swarm 占 20% 事件 × 8-12 体 → **单位投放 ~7/s**）。玩家 L7 P50 build 的 bullet DPS ≈ 11（2.88 fireRate × 2 dmg × 2 shots），清不动。

### 2.4 难度梯度（greedy，死亡 P50）

| casual | standard | hard | insane |
|---|---|---|---|
| 97s | 76s | 60s | 41s |

档间差异主要来自 HP 10/7/5/3 与 insane 的 2 点伤害；**casual/standard/hard 的每次接触伤害经取整全部 = 1**（见 S-3）。

### 2.5 局外成长影响（casual+greedy，20 种子）

| perm | deathP50 | scoreP50 | levelP50 |
|---|---|---|---|
| 全 0 | 95s | 2,865 | 7 |
| 六维全满（2,460 币） | 115s | **79,358** | 47 |

### 2.6 敌种投放权重（解锁池内事件占比 → 场上单位占比）

| 窗口 | chaser | sprinter | swarm | tank | shooter | splitter | brute | healer |
|---|---|---|---|---|---|---|---|---|
| 0-40s | 100% | | | | | | | |
| 45-60s | 22% | 50% | 29% | | | | | |
| 75-90s | 18% | 42% | 24% | 0.4% | 16% | | | |
| ≥105s | 15% | 35% | 20% | **0.4%** | 13% | 8.5% | **2.7%** | **4.7%** |
| 单位占比(≥105s) | 15% | 35% | **202%** | ~0 | 13% | 8.5% | 2.7% | 4.7% |

（swarm 一次事件 8-12 体，折算后**场上 2/3 的敌人是 swarm**；tank 全场期望 0.3 只/局。）

### 2.7 boss TTK 矩阵（玩家站桩、仅 boss、真实弹道）

| build\bossHp | 90s(114) | 180s(168) | 270s(222) | 450s(330) | 600s(420) |
|---|---|---|---|---|---|
| P50@90s（L7） | **19.7s** | 29.1s | 38.6s | 57.4s | 73.2s |
| L12 中期 | 5.6s | 8.4s | 10.6s | 16.2s | 20.3s |
| L17 强 | 2.8s | 3.9s | 5.3s | 7.7s | 9.6s |
| MAX | 0.8s | 2.3s | 4.0s | 7.3s | 9.3s |
| MAX+轮盘加成 | 0.5s | 1.7s | 2.1s | 4.1s | 5.4s |

boss 每 1.2s 一轮弹幕（放射 12 / 扇形 5 / 环形 16 / 双螺旋 12）→ 19.7s = 16 轮弹幕。P50 build 的 90s boss 在杂兵干扰下**实际不可击杀**；L12 后 boss 沦为皮纳塔。无「决斗带」。

### 2.8 升级池选择分布（20 级 × 4000 种子）

| 策略 | 前六名（占比） | 后三名 |
|---|---|---|
| autoPick best | thorns 12.2%、bulletSpeed 12.2%、fireRate 10.5%、magnet 10.5%、speed 10.4%、maxHp 10.4% | pierce 4.4%、multishot 4.3%、blade 4.3% |
| greedy | fireRate 22.5%、speed 13.2%、damage 13.1%、magnet 13.1%、maxHp 9.3%、crit 9.1% | regen 2.8%（bulletSpeed/thorns 0） |

前 8 级见到 multishot 的概率 = 44%，damage = 69%，fireRate = 95%。

### 2.9 补丁敏感性（casual，16 种子，bundle 副本改常量）

| 变体 | best deathP50 | greedy deathP50 | greedy 存活至 420s |
|---|---|---|---|
| baseline | 82s | 86s | 0/16 |
| A 刷怪曲线放缓（0.28→0.16、0.05→0.03、地板 0.32→0.45、双投 60s/35%→120s/20%） | 99s | 105s | 0/16 |
| C XP 加速（5+3L→4+2L） | 87s | 81s | **6/16** |
| D=A+C | 115s | 121s | 6/16 |
| G=A+C+敌 HP 爬坡减半 | 113s | 111s | 6/16 |

（B「baseStats.damage 1→2」完全无效——`baseStats().damage` 是死值，真实基数是 recomputeStats 里的 `(1+taken.damage)` 字面量。）

### 2.10 经济表

- 单局收入：casual+best P50 ≈ 64 币；casual+greedy P50 ≈ 143；perm 满级后 P50 ≈ 3,968（score 79,358/20）。
- perm 全满成本 = 2,460 币（damage 60/120/180、fireRate 60/120/180、moveSpeed 50/100/150、maxHp 80/160/240、xpGain 70/140/210、luck 90/180/270）。
- 回本局数：greedy P50 收入 ≈ **17 局**满配；best P50 ≈ 38 局；P90 收入（322 币）≈ 8 局。
- 满配后无消费点（经济死端；成就/神器不消耗币）。

---

## 三、发现清单

### S-1【P0｜Confirmed】90 秒死亡墙：中位局见不到全部后期内容
- **位置**：`src/renderer/src/games/survival.ts:868-879`（directorSpawnInterval）、`:1303-1308`（双投）、`:568-570`（xpToNext）、`:1007-1015`（hpFor 敌 HP 爬坡）。
- **触发**：grace 15s 结束后间隔 1.5→0.27s（地板，满血 0.85 再乘）；60s 起 35% 双投；swarm 事件 ×10 体；玩家基础 bullet DPS 2.0（fireRate 2 × damage 1 × 1 弹），L5 前无 AoE。
- **后果**：模拟四配置 100% 死亡（P50 68-98s）；boss(90s)/splitter(90s)/brute(90s)/healer(105s)/轮盘/传送门/岛屿对中位玩家为暗内容；真实用户 best 7048 与模拟尾部吻合，推断从未见过上述系统。**成就 12 项中 boss1/boss10/combo25/score20000 对该用户不可达；神器 pain（boss≥3）不可解锁。**
- **修复草案**：见补丁清单 P0-1（需组合拳，单常量无效——已实证）。
- **置信度**：Confirmed（代码 + 4 配置 × 24-48 种子 + 补丁敏感性实验）。

### S-2【P0｜Confirmed】autoPick="best" 是反优化 AI，且移除核心决策面
- **位置**：`src/renderer/src/games/swarmAutoPick.ts:38-51`（最少已取启发式）；`src/renderer/src/components/MiniGamesView.tsx:1079-1086`（levelup 相位转换帧自动 applyUpgrade）。
- **触发**：所有 taken 计数并列 0 时等价于「均匀随机铺开」；陷阱项（thorns/bulletSpeed，灰 60 权重高）获得最多offer 也获得最多选择。
- **后果**：20 级分布 thorns/bulletSpeed 各 12.2% vs multishot 4.3%；casual deathP50 82s vs greedy 95s，scoreP50 1,407 vs 2,865；三选一作为每 15-30s 一次的核心多巴胺决策被 1 帧跳过。**真实用户正处于此模式。**
- **修复草案**：best 改为「边际 DPS/生存收益估值」排序（可复用补丁实验的 greedy 序作 v1：multishot>damage>fireRate>pierce>blade>crit>magnet>speed>maxHp>regen>bulletSpeed>thorns）；或保底规则：陷阱项仅在无其他可选时入选。另建议 best 模式保留 0.5s 展示帧让玩家看到「帮你选了什么」。
- **置信度**：Confirmed（分布模拟 + 双策略对照）。

### S-3【P1｜Confirmed】敌伤系数取整坍缩：四档难度实际只有三档手感、两档数值
- **位置**：`survival.ts:87-89`（`enemyContactDamage = max(1, round(mult))`）；`:74-79`（参数表 0.65/1/1.35/1.6）。
- **触发**：round(0.65)=round(1)=round(1.35)=1；仅 insane=2。
- **后果**：R218 spec 明写「容错 16/10/6/3 次」（PRD :3881），实际 **10/7/5/2 次**；casual 与 standard 的差异只剩 3 点 HP（死亡 P50 +20%）。`enemyDmgMult` 这个调参旋钮在 3/4 档位上是空转的。
- **修复草案**：伤害走「1 + 浮点累伤」制（接触伤害按 mult 缩放 HP 池，显示取整），或改 HP 差异为正式设计并删掉误导性参数；若保留整数伤害，casual 应给 12-14 HP 才兑现「容错 16 次」。
- **置信度**：Confirmed（直接调用四档 `enemyContactDamage` 实测 1/1/1/2）。

### S-4【P1｜Confirmed】敌矩阵「统计幽灵」：8 种设计只有 5 种在场
- **位置**：`survival.ts:136-193`（威胁值逆权重）；`:118-127`（解锁表）。
- **触发**：tank 事件权重 0.4%（解锁后期望 0.3 只/局）、brute 2.7%、healer 4.7%——三者全部排在 60-105s 解锁，而中位局 68-98s 终止。
- **后果**：「tank 逼绕行 / brute 火力考验 / healer 逼优先击杀」的迫使决策从未发生；场上 2/3 单位是 swarm（事件 20% × 10 体），实际敌人体验 = sprinter+swarm+chaser 三件套。正交矩阵注释（`:104-112`）的设计意图未兑现。
- **修复草案**：权重下限（每解锁种 ≥6%）或按「单位预算」而非「事件」归一；swarm 包与单体系分开配额。
- **置信度**：Confirmed（权重解析精确值 + 解锁表交叉）。

### S-5【P1｜Confirmed】boss 曲线双态失配：墙或皮纳塔，无决斗带
- **位置**：`survival.ts:1119`（hp=60+⌊t/10⌋×6 线性）；`:1196-1203`（1.2s 弹幕节拍）。
- **后果**：见 2.7 矩阵。P50 build 需 19.7s（16 轮弹幕 + 杂兵，10HP 不可完成）；L12 后 ≤5.6s，MAX 0.8s。90s boss 恰好砸在中位玩家最弱时刻。
- **修复草案**：boss HP 改为与「局内威胁预算」挂钩的分段曲线（如 90s boss 降到 ~70HP 使 P50 build TTK ~10s），并给 boss 加受击韧性与狂暴时限（25s 未杀自爆退场），消灭站桩磨血。
- **置信度**：Confirmed（TTK 矩阵实测）。

### S-6【P1｜Confirmed】元进度悬崖：+1 级不可感知，满配 28 倍分
- **位置**：`swarmMeta.ts:88-99,155-170`；效果放大机制 = S-1 的刀锋系统。
- **后果**：60 币（1 局收入）买 damage L1 = +10% 乘区，在 82s 死亡局里无感；2,460 币满配后 scoreP50 2,865→79,358（28×）、存活样本从 0/20 → 大半活过 420s。meta 不是「每局强一点」而是「攒够 17 局后突然换游戏」。满配后 3,968 币/局无处消费（经济死端）。
- **修复草案**：把成长感前移（首件 perm 打 5 折 + 首局后赠 30 币）；满配后开放币→神器强化/皮肤/重掷券等消费端。
- **置信度**：Confirmed（20 种子 perm=0 vs 满配对照）。

### S-7【P2｜Confirmed】每日挑战种子未接入 survival——「每日玩法差异」不存在
- **位置**：`daily.ts:4` 注释宣称「四作 Math.random 全量替换为 mulberry32」；实际只有 `tetris.ts:256` 接种子；`survival.ts` 含 21 处裸 `Math.random`（生成环/精英/种类/暴击/裂变/掉落全在列）。
- **后果**：Nova Swarm 的「每日挑战」只是当日 best 记分板（`recordDaily`），种子对 gameplay 零影响；注释与实现不符误导后续维护。
- **修复草案**：survival 引擎持 `rand()` 闭包（state 字段 + 默认 Math.random），daily 局注种子——原 OD-05 设计即如此，照做即可。
- **置信度**：Confirmed（grep 全量）。

### S-8【P2｜Confirmed】R202 进化合成是死代码：数据与单测在，引擎/视图零消费
- **位置**：`swarmMeta.ts:33-52`（EVOLUTIONS 四配方）；`survival.ts`/`MiniGamesView.tsx` 无任何 moonblade/barrage/lightspear/thornAura/readyEvolutions 引用（grep 0 命中）；`tests/renderer/games/swarmEvolve.test.ts` 仅测纯函数。
- **后果**：FR-SW01「强化进化合成」玩家不可达——这是 survivor 品类 build 深度的核心一环（VS 的武器进化），缺失使 12 张卡的组合天花板更低。
- **修复草案**：接线（levelup 时检测 readyEvolutions → 进化卡替换普通卡；引擎为四个 effect 各接一组弹道/光环参数）。注意与 S-1 一起排期：玩家活不到 blade3+damage4。
- **置信度**：Confirmed。

### S-9【P3｜Confirmed】`baseStats()` 的 fireRate/damage/moveSpeed/magnet 等字段是死值
- **位置**：`survival.ts:572-586`（baseStats 初值）→ `:695`（initialSurvivalState 立即 recomputeStats 全量覆盖）。
- **后果**：误导调参（本评审补丁实验 B 即踩中：改 baseStats.damage 无任何效果）；真实初值在 `recomputeStats` 的字面量里。
- **修复草案**：删 baseStats 冗余字段或让 recomputeStats 以 baseStats 为基数。
- **置信度**：Confirmed（补丁实验 B 天然 A/B 佐证）。

### S-10【P2｜Likely】磁吸 56px 半径下的 XP 收集节奏偏「捡珠冒险」
- **位置**：`survival.ts:602`（56+45/级）；模拟 P50 局 60s 时 25/48 珠滞留场上（48% 未收）。
- **后果**：珠落在击杀点（敌群中），56px 吸力 + 260px/s 飞行意味着回收 XP 需要回穿敌群——VS 系用大真空半径把拾取做成无脑爽点，这里更像风险决策。属设计取向问题，但叠加 S-1 的紧绷曲线后表现为「升级更慢」。
- **修复草案**：磁吸基础 56→80，或珠生成 1.2s 后向玩家缓慢漂移（Goobies 式）。
- **置信度**：Likely（量级推算：模拟数据 + 参数对比，未做玩家实测）。

### S-11【P3｜Likely】sprint 模式（90s 上限）与死亡墙互相踩踏
- **位置**：`MiniGamesView.tsx:1688`（sprintSeconds=90）；tick 顺序 `:1271`（sprint 判定在 bossTimer `:1311` 之前）→ sprint 局 boss 永不出现、轮盘/进化永不可达；而死亡 P50 82-95s 意味着 sprint 与「正式局」高度重叠。
- **修复草案**：sprint 局把 boss 提前到 60s 并把时长与死亡墙校准（见 P0-1 后重测）。
- **置信度**：Confirmed（顺序推演）。

---

## 四、平衡补丁清单（数值级）

> 原则：以下 P0 组合已在模拟中验证方向与量级（2.9 表）；单用任何一项都只能 +15-35% 存活。目标：casual 中位局 4-6 分钟、standard 3-4 分钟、boss 首杀在中位局内发生。

**P0（体验破绽——本周可做）**
1. **刷怪曲线**（`directorSpawnInterval` survival.ts:870）：`1.5 - minutes*0.28 - level*0.05, clamp 0.32` → **`1.5 - minutes*0.16 - level*0.03, clamp 0.45`**；双投 `time>60 && 35%` → **`time>120 && 20%`**。〔模拟：+20% 存活，与 2 连用 +40%〕
2. **XP 曲线**（`xpToNext` survival.ts:568）：`5+3L` → **`4+2L`**（L5 门槛 50→30 XP）。〔模拟：greedy 存活率 0/16→6/16，是单点杠杆最大项〕
3. **autoPick best 启发式**（swarmAutoPick.ts:42）：最少已取 → **边际估值序**（v1 直接用 greedy 序）；陷阱项 bulletSpeed/thorns 仅在无他选时入选。〔模拟：等价于 best→greedy 的全部收益：P50 +17% 时长、分数 ×2〕
4. **boss 首杀可达**（survival.ts:1119）：90s boss HP 114 → **70**（P50 build TTK 19.7→~11s，仍在弹幕下有压力）；后续 boss 维持现斜率。
5. **难度取整**（survival.ts:87）：casual `max(1,round(0.65))` 改为 **casual HP 10→13**（兑现 spec 容错 16 次的 80%），或伤害改累小数制。

**P1（曲线修正）**
6. **敌种权重下限**（survival.ts:170）：每解锁种事件权重下限 **6%**（tank 0.4→6%，brute/healer 同）；swarm 包内体数 8-12 → **6-9**。〔兑现 8 种行为矩阵〕
7. **磁吸基础** 56 → **80**（survival.ts:602）。
8. **perm 首购打五折 + 首局赠币**（swarmMeta.ts:155）：`permCost(level) = baseCost*(level+1)` → `level===0 ? baseCost*0.5 : baseCost*level`；结算赠 `min(30, ⌊score/40⌋)`。
9. **boss 狂暴时限**：25s 未击杀 → 自爆清自身弹幕并退场（防站桩磨血，配 P0-4）。
10. **sprint 模式重校**：boss 提前 60s，sprintSeconds 与新死亡墙重测（90 → 120 候选）。

**P2（深度扩展）**
11. **接线 R202 进化**（S-8）：四配方进 levelup 池（满足条件时替换一张普通卡）。
12. **daily 种子接入 survival**（S-7）：引擎 rand() 闭包化。
13. 每级 +2% 基础伤害的「等级地板」（level → `(1+taken.damage)*(1+0.02*level)`）——把「活下来」本身变成成长，削平刀锋二值性（模拟中 D 变体已显示雪球/死亡二值是结构问题，此项是针对性解法，需单独 A/B）。
14. 满配后币消费端（重掷升级卡 / 局内商店 / 神器强化），修经济死端。

---

## 五、品类对标差距矩阵（Nova Swarm vs VS/Brotato/Goobies）

| 维度 | VS/Brotato 基准 | Nova Swarm 现状 | 差距 |
|---|---|---|---|
| 决策面 | 走位+朝向/拾取时机/每 15-30s 三选一/进化合成/地图交互/主动技 | 走位+拾取+（被 autoPick 移除的）三选一+90s 后轮盘 | **缺朝向控制（恒瞄最近）、缺主动技、缺地图交互、进化未接线** |
| 升级节奏 | 首分钟 2-3 次 level-up | 首分钟 0-1 次（8 XP 门槛 + 低击杀率） | 慢 3-5×（S-1） |
| 中期心流带 | 5-15 分钟紧张可控 | 85s 墙或无限雪球，无中间态 | 结构性（补丁 13） |
| AoE 可及性 | 前 2 分钟必有穿透/范围武器 | pierce 黄卡前 8 级出现率 <44%，blade 同 | 稀有度+autoPick 双重锁 |
| 敌人矩阵 | 每种稳定出场、counter 关系可感知 | 5/8 种在场，tank 类统计幽灵 | S-4 |
| 元游戏 | 每次 run 结束都有可见增量 | 前 17 局无感，之后一次性换游戏 | S-6 |
| 每日挑战 | 种子局玩法差异 | 仅记分板 | S-7 |

另三作品类成立度：**Tetris**（SRS 双向踢墙表/hold 一次限制/lock delay 0.5s×15 重置/T-spin 三角判定/B2B ×1.5/连击/幽灵块/7-bag + 种子化 daily）——现代规则完整，无品类缺陷；**TD**（5 塔含经济塔、5 词缀+深水词缀、卖塔 0.7 回收、升级费 0.85/1.35 系数、四档 lives 30/20/14/10）——塔经济成立；**Slash**（60s 定局、4 心、chain 窗 0.18s、knife 1.02s、guard/dasher/thrower）——短局节奏斩击成立。

---

## 六、被推翻的假设 / 已验证无问题

**被推翻：**
1. ~~healer 90px 群疗在高敌密下形成「不可推进墙」~~——微模拟（150s 中期 build，36 chaser + 3 healer）：清场 8.4→11.6s（+38%），**实际治疗量 0**（击杀快于 6s 脉冲节拍；且 4.7% 权重使 healer 本就稀有）。
2. ~~玩家拾取效率是主要死因~~——「懒拾取」变体死亡 P50 与积极拾取差 <1%（95 vs 95s）。
3. ~~调 baseStats.damage 可加强早期 DPS~~——死值（S-9）。
4. ~~敌 HP 爬坡减半能显著推后死亡墙~~——G 变体 P50 113s vs D 变体 115s，无效（瓶颈是投放吞吐不是单体 HP）。
5. ~~casual 敌伤 0.65× 生效~~——取整坍缩为 1（S-3）。

**已验证无问题：**
- Tetris 现代规则全项在位（grep 逐项核）。
- boss 弹幕四型轮转、1.2s 节拍正常（与 swarmEvolve.test 一致）。
- combo 计分（2.5s 窗、+min(combo,25)）在模拟中自洽。
- 难度分数倍率 1/1.5/2/3 正确生效（结算公式实测）。
- 敌解锁时间轴与文档一致（0/40/45/60/75/90/90/105）。
- shooter/healer 风筝带（220-300/140-220）行为正常。
- max build DPS 上限（bullet 141 + blade 72 ≈ 213，轮盘后 ~409）vs 10 分钟 boss 420HP——**数值天花板未失控**，乘法交互无指数破绽。
- splitter 裂变（母体死→2×25%HP 小体，gen1 不再裂）逻辑正常。
- 敌人分离推挤、击退（tank 0.08/其余 0.5）、后撤（tank 8px/其余 46px）工作正常。
- 已知已修项（R219.9 固定视口、R219.7 动态背景停用、R219 五轮表现修复、enterGame 残留 running、vision 键池）未重复报；R219.9 的 1P 固定视口（900×520）相对 2P 大世界（1800×1040）使同吞吐下接触密度更高，属已知取舍，仅提示。

---

## 七、未验证项 / 局限

1. **bot 保真度**：16 向采样 ≈ 中上人类；真实人类的corner 逃生、珠取舍、boss 风筝细节未建模。真实用户 best 7048 与模拟尾部吻合是间接校准，非直接证明。
2. **15 分钟全长局**未完整模拟（O(n²) 分离循环代价）；后期（>420s）boss TTK/无聊窗口数据来自解析推算 + 单个 189s 幸存局。
3. **多人局（2-4P）**未模拟：共享 build + 世界钳制 + 复活珠的平衡独立成题。
4. **TD/tetris/slash 未做数值模拟**（按任务约定仅品类级评估）。
5. artifact 组合局（chrono 时流 ×1.25、mutantis ×1.6 等）与 luck 长期影响未单独 A/B。
6. 真机手感/操作延迟未测（本角色不启动应用）。
7. sprint 模式的「短局矩阵」设计意图（R205）与死亡墙的适配仅做了顺序推演，未跑完整 sprint 模拟。

---

## 附：模拟工程文件（均在 temp）

`build.mjs`/`bundle.mjs`（esbuild 打包+sfx stub）、`sim.mjs`/`sim2.mjs`（引擎驱动+bot+统计）、`micro*.mjs`（boss TTK/healer 墙/权重/分布）、`patchtest.mjs`/`patchlib.mjs`（bundle 补丁敏感性）。种子可复现（mulberry32，seed=1000+i*7919）。
