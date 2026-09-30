# G2 · 游戏手感（Game Feel / Juice）专项评审 —— 四作 · 重点 Nova Swarm

- 评审人角色：游戏手感/Juice 工程师（对标 VS / Brotato / Nuclear Throne）
- 日期：2026-10-01。仓库只读，未启动应用，未跑 scripts/。
- 主证据：`src/renderer/src/games/survival.ts`（2123 行，全文通读）、`juice.ts`、`hud.ts`、`sfx.ts`、`swarmMeta.ts`、`MiniGamesView.tsx`（循环 970-1317 / 输入 1319-1419 / DOM 浮层 2628-2706）、`td.ts`/`slash.ts`/`tetris.ts` juice 触点、`app.css` 浮层样式、PRD R200/R202/R218/R219 条款、SRS §5.2。
- 方法：代码级反馈链时序推演（帧数/毫秒/像素均手工验算）；无活体试玩——感知类结论一律标 Speculative 并附复测法。

---

## 一、摘要

**总评：骨架完整、参数全在可感知阈值边缘以下——「每一档 juice 都做了，但每一档都不够响」。**

Nova Swarm 的 juice 四件套（hitStop / shake 衰减 / 飘字 / 涟漪）+ 预警箭头 + hitFlash + 无敌闪烁 + 低血 vignette + 张力 BGM 全部真实接线且实现正确（冻结不累积 dt、震屏单路径、粒子按真实 dt 步进），工程纪律好。但逐链对标后：击退量级 ≈3.5px（不可感知）、普通击杀无音效、玩家受击无顿帧无方向指示、boss 弹幕无预警发光（偏离 FR-SW02 spec）、死亡无 slow-mo、窗口态升级卡最迟 0.18s 才浮现、升级卡选择无声、XP 磁吸恒速直线、进化系统（R202 FR-SW01）**只有数据没有运行时**——局内最大的「爽点仪式」不存在。

对标分（Nova Swarm，10 分制）：

| 维度 | 分 | 一句话 |
| --- | --- | --- |
| 命中打击感 | 5 | 白闪✓ 飘字✗ 击退≈无 粒子 3 颗全向 kill 无声 |
| 受击清晰度 | 6 | 闪白+shake+飘字+无敌闪烁✓；无顿帧/方向/边缘泛红来得太晚 |
| 成长反馈 | 5 | 冻结三选一+音阶✓；卡延迟/选卡无声/磁吸平/进化缺失 |
| 演出时刻 | 4 | boss 登场/死亡/换岛全部= banner+通用 wave 音 |
| 音频 | 5 | 合成音齐+BGM 张力✓；kill 静音、张力切换重排可闻 |
| 输入手感 | 8 | ≤1 帧响应、对角归一化、宽容判定 0.8、速度带合理 |
| **综合** | **5.5** | 框架 8 分，参数 3 分 |

---

## 二、反馈链审计表（事件 × 环节 × 现状 × 差距 × 改法）

### 2.1 输入→移动链
| 环节 | 现状（file:line） | 估计 | 对标差距 | 改法 |
| --- | --- | --- | --- | --- |
| keydown→Set | 事件同步写 `survivalRef.current.keys`（MiniGamesView.tsx:1371-1375） | 0ms | 无 | — |
| Set→tick | rAF 循环逐帧读（1085-1301 段，1285-1301） | ≤1 帧 | 无 | — |
| tick→呈现 | 同帧 draw + vsync | 1-2 帧 | 常规 | — |
| **端到端** | | **≈2-3 帧（33-50ms）** | 达标 | 不动 |
| 速度/屏比 | 170px/s ÷ 900×520 → 横穿 5.3s 纵穿 3.1s（survival.ts:601,1281-1283） | — | VS 纵穿 ≈5s、Brotato ≈2.3s，落带内 | 不动 |
| 对角归一化 | `moveLen` 归一 ✓（1294-1298） | — | ✓ | — |
| 惯性/加速度 | 无（即时启停） | — | **VS/Brotato 同为即时——这是正解，别加惯性** | 不动 |
| 摇杆死区 | 0.18 硬阈值后**原始幅值直通**（1290-1295；pollGamepad 650 原始轴写入） | — | 过阈瞬间 0→~18% 跳变；无 (v-dz)/(1-dz) 重映射、无 expo | F-14 |
| blur 粘键 | **无 blur/visibilitychange 处理**（全文 grep 0 命中） | — | alt-tab 后船持续漂移 | F-13 |

### 2.2 打击感闭环（子弹命中敌人）
命中链逐环节（survival.ts:1451-1467）：
| 环节 | 现状 | 强度估计 | 对标（VS） | 差距 |
| --- | --- | --- | --- | --- |
| hitFlash 白闪 | `enemy.hitFlash=0.1`（1459；绘制 1890） | 60fps 下 6 帧全白 | ✓ 同量级 | **唯一达标环节** |
| 击退 | `enemy.x += bullet.vx*dt*knock`（1461-1463），knock=0.5/0.08 | **420×0.0167×0.5≈3.5px/击；tank 0.56px；随弹速(798 满级翻倍)与帧率(30fps 翻倍)漂移** | 20-60px 衰减位移 | **量级低一个数量级 + 双重耦合** → F-2 |
| 顿帧 | 仅 tank/splitter 母体击杀 0.03s（1142-1143） | 60fps 2 帧、30fps 1 帧 | 普通命中无顿帧（VS 同）✓ | 击杀档 0.03 贴阈值，建议大敌 0.04-0.05 |
| 粒子 | `spawnBurst(...,3,60)`（1465）全向随机 | 3 颗 60px/s | 6-10 颗锥形+impact flash | F-10 |
| 飘字 | 敌方伤害无数字（仅玩家 -N） | — | VS 有 damage number（可关） | P2 只给 crit 出字 |
| 音效 | `playSfx('hit')` 70ms 节流（1466；sfx.ts:8） | 密集射击时击杀帧常被节流吞 | — | 配合 F-3 |
| squash/stretch | 无 | — | Brotato 命中有 scale pulse | F-11 |
| 击杀 | 涟漪 0.4s + burst 9 + 掉珠（1136-1182）**无 playSfx** | | VS 每杀有 pop | **F-3** |
| blade 命中 | hitFlash✓ 粒子 0 颗、无声（1436-1448） | | | P2 |

### 2.3 受击链（玩家被打）
现状（survival.ts:1490-1502 / 弹幕 1211-1234）：hitFlash 0.15 白船 + invuln 0.9s 6Hz 闪烁（2013）+ shake 6（boss 9）+ 红爆 12 + 飘字 `-N` + hurt 音 + 敌方反冲 46px。
| 对标项 | 差距 |
| --- | --- |
| 短暂 time-freeze | **无**（TD 漏球都有 juiceHitStop 0.02，td.ts:531——同平台不一致）→ F-4 |
| 受击方向指示 | 无（飘字在角色头顶，不指方向）→ F-4 |
| 边缘泛红定位性 | vignette 仅 `lowRatio≤0.25` 呼吸（2104-2106）：standard 7HP=最后 1 HP 才亮；**insane wisp 3HP 永不触发（1/3=0.33>0.25）**——验算确认 → F-4 |
| 「瞬间知道且能归因」 | 闪白+飘字达标 60%；顿帧+方向缺 40% |

### 2.4 升级/拾取反馈
| 环节 | 现状 | 差距 |
| --- | --- | --- |
| XP 磁吸 | 恒速 260 直线追最近存活者（1544-1549）；基础磁距 56（601） | 无 ease-in：满级磁距 191px 时珠要匀速爬 0.67s——「吸不动」观感 → F-8 |
| 拾取瞬间 | 仅 `playSfx('xp')`（60ms 节流，密集吸珠大部分被吞）+ XP 条瞬时跳宽（2087） | 无粒子/无珠闪光/条无脉冲 → F-8/F-15 |
| level-up 仪式 | phase 冻结（粒子/涟漪/时钟照常步进——细节好）+ banner `LEVEL N` 1.4s + 4 音符大调琶音（sfx.ts:46-51）+ **窗口态 DOM 卡最迟 0.18s 浮现**（publish 节流 MiniGamesView.tsx:1275-1282；只有 autoPick≠off 才即时 publish 1079-1086）→ F-6；fs 画布卡读 ref 即时（2125） |
| 选卡确认 | `applyUpgrade`（903-916）burst+`+id` 飘字但**无 playSfx**（轮盘领取有 levelup:943、溶解有 xp:953）→ F-7 |
| 进化 | **R202 FR-SW01 未接线**：`EVOLUTIONS/readyEvolutions`（swarmMeta.ts:39-51）全 src 无调用点；`state.evolved` 只在 532/685 初始化——升级池永无进化卡、无质变、无专属演出；R200 声称的「Swarm 进化顿帧」因此无触发路径 → **F-1（最大单一缺口）** |

### 2.5 死亡/胜利节奏
现状（1507-1513）：全灭帧 burst 30 + gameover 音 + `return`；下一帧起 0.68 压暗（dimScene 1631-1641）；DOM `swarm-summary`（≤0.18s 内浮现）+ run-recap（settleBest 事件驱动即时）。
差距：无 slow-mo、无最后一击顿帧/震屏、结算面板无入场节奏 → F-5。sprint 模式时间到也走 gameover 音（语义混用，P2）。

### 2.6 动画完整性
| 对象 | 现状 | 判定 |
| --- | --- | --- |
| 飞船 idle | 尾焰 flicker `clock*26`≈4.1Hz 常燃、无敌更亮（1657-1667）✓；无 hover bob | 达标（bob 是 P2 甜点） |
| 敌移动动画 | sprinter/shooter 朝向翻转✓（1915-1949）、boss 自旋 0.8rad/s✓（1894）；chaser/swarm/brute/tank/healer/splitter **无 squash 循环/步进** | P2 |
| 传送门 | 双环反转 + 呼吸核心（1802-1818）✓ | 达标 |
| boss 登场 | 仅 banner `BOSS INBOUND` + 通用 wave 音（1118-1127）；**无 warning 箭头（spawnEnemy 有、spawnBoss 没有）、无白闪、无震屏、无专属音** | F-9 |
| boss 弹幕 | 1.2s 一拍四型轮转（1086-1116）；**无 FR-SW02 spec 的 0.8s 预警发光**；弹速 95-170（spec ≤102；瞄准扇形 170=玩家全速） | F-9 |

### 2.7 音画同步
- 全部 `playSfx` 在 tick 命中点同步调用、同帧绘制——无先画后响错位；WebAudio 输出延迟 ~20-40ms 属平台常态。✓
- 节流表（sfx.ts:8）：shoot 90/hit 70/xp 60/pop 60。最大基础射速 ≈7/s（143ms 间隔）不咬 shoot 节流 ✓；hit 70ms 在 pierce 多目标/blade 同帧命中时会吞。
- BGM 张力：danger= hp≤2 或 boss 在场（MiniGamesView.tsx:1259-1274）→ `setBgmTension` stop+start 重挂（sfx.ts:232-240）→ **bgmStep 归零，听感「重启」** → F-17；过渡时延 ≤1 拍（150-190ms）可接受。
- 音量层级：hurt 0.07 / pop 0.06 / hit 0.05 / shoot 0.022 / BGM 0.014——层级方向正确；BGM 是否被完全掩盖需真机听（未验证）。

### 2.8 可感知帧率与节流
- 0.18s publish：画布 HUD 全部 60fps 直绘自 ref，**游戏画面对象不受影响**；受影响的是 DOM（状态条 5.6Hz 步进、levelup 卡、spin FAB ≤0.18s 延迟）+ 重渲尖峰（已知，不重复）。
- dt=min(0.05, real)（MiniGamesView.tsx:1025）：30fps 下游戏速度仍正确（dt=真实时间）✓；**穿隧**：子弹碰撞为一点采样（1457），420 基础弹速×0.033=13.9px、×0.05=21px vs swarm 碰撞直径 17.6px（size6×0.8+4）；弹速满级 798 时 45fps 以下可穿 swarms → F-12（真机 60fps 基本安全，标风险）。

---

## 三、发现清单（F-1…F-19）

> 置信度：高=代码级逐行确认；中=逻辑确认+听感/观感推断；低(Speculative)=需活体复测。

**F-1｜进化系统运行时未接线（R202 FR-SW01 半交付）** —— 置信度：高
- 位置：`swarmMeta.ts:39-51`（EVOLUTIONS/evolutionReady/readyEvolutions）；`survival.ts:532,685`（`evolved` 仅初始化）。
- 证据：grep 全 `src/` 无任何调用点（仅 `tests/renderer/games/swarmEvolve.test.ts` 测纯函数）；`pickOffers`（survival.ts:899-901）只从 UPGRADES 抽卡。
- 触发/后果：任何对局都无法进化；SRS §5.2 要求「升级卡池出现进化卡（专属稀有度与演出）+替换两条原强化+更换绘制形态」；PRD R202 状态 ✅ 但「质变效果」无运行时。这是 VS-like 中局最大的多巴胺节点（构筑兑现时刻）整体缺失，连带 R200「Swarm 进化顿帧」成为死代码路径。
- 修复草案（L）：`pickOffers` 后追加 `readyEvolutions(taken, evolved)` 注入进化卡（rarity=4 专属色）；`applyUpgrade` 识别进化：moonblade=blade 半径 78→125、可暴击；barrage=multishot 扇形 7 向；lightspear=每 1.5s 穿透射线；thornAura=半径 110 每秒灼烧；演出=`queueHitStop(0.06)`+全屏白闪 0.12s+`banner 'EVOLVED'`+levelup 音。

**F-2｜击退量级不可感知且随帧率/弹速漂移** —— 置信度：高（现状）/Speculative（阈值体感）
- 位置：`survival.ts:1461-1463` `enemy.x += bullet.vx * dt * knock`（tank 0.08 其余 0.5）。
- 数值：60fps 基础弹速 3.5px/击；满级弹速 798 → 6.7px；30fps 再×2；dt 钳 0.05 极端 10.5px。tank 0.56px。位移还是「瞬移」不是衰减。
- 后果：命中无「推动感」，tank 的 0.08 系数形同虚设（本来就不到 1px）；帧率低反而击退更强（参数漂移）。
- 修复（S）：改固定像素 + 指数衰减：`enemy.kb = 12`（tank 2）→ 每帧 `enemy.x += kbDir*kb; kb *= 0.0015^dt`（复用 shake 衰减常数），与弹速/帧率解耦。

**F-3｜普通击杀无声** —— 置信度：高
- 位置：`killEnemy`（`survival.ts:1136-1182`）非 boss 分支无 `playSfx`；对照 `td.ts:605`、`tetris.ts:352` 都用 `pop`。
- 后果：割草的听觉奖励缺失；且击杀帧的 `hit` 音常被 70ms 节流吞掉（射速高时），出现「打死没声音」。
- 修复（S）：非 boss 击杀加 `playSfx('pop')`（自带 60ms 节流）；或 kill 时绕过 hit 节流。

**F-4｜玩家受击无顿帧/无方向指示；vignette 阈值过晚且有难度死角** —— 置信度：高
- 位置：受击 `survival.ts:1490-1502`（无 hitStop）；vignette `2104-2106` `lowRatio<=0.25`。
- 验算：standard 7HP → 仅 hp=1 亮；**insane+ wisp 3HP → 1/3=0.33 永不触发**；hard 5HP → 仅 hp=1。
- 对照：TD 漏球有 `juiceHitStop 0.02`（td.ts:531）——同平台四作不一致。
- 修复（S/M）：受击 `queueHitStop(state.juice, 0.04)`；vignette 阈值改 `hp<=Math.max(2, maxHp*0.35)`；加 0.15s 一次性受击 vignette 脉冲（方向性可后置）。

**F-5｜死亡瞬间缺「最后一击」演出** —— 置信度：高（现状）/Speculative（收益）
- 位置：`survival.ts:1507-1513`；结算 `dimScene 1631-1641` + DOM 面板即刻压上。
- 修复（M）：全灭帧 `queueHitStop 0.12 + queueShake 10` → 0.6s `timeScale 0.3` 渐复（已有 timeScale 字段 671）→ 0.5s 后再显示 summary（面板入场加 CSS 动画）。

**F-6｜窗口态升级三选一最迟 0.18s 才浮现** —— 置信度：高
- 位置：DOM 卡读 `survivalSnapshot`（MiniGamesView.tsx:2628-2645）；publish 节流 1275-1282；仅 autoPick≠off 时即时 publish（1079-1086）。
- 后果：手动选卡模式下，冻结后最多 ~180ms 只有画布 banner、无卡（fs 态画布卡读 ref 无此问题，2125-2145）。
- 修复（S）：loop 内检测 `phase !== lastPhase` 时立即 `publishSurvival()`。

**F-7｜升级卡选择无声** —— 置信度：高
- 位置：`applyUpgrade`（903-916）无 playSfx（轮盘领取 943 有 levelup）。
- 修复（S）：加 `playSfx('confirm')`。

**F-8｜XP 磁吸恒速直线、拾取无闪光** —— 置信度：高（现状）/Speculative（增益）
- 位置：`survival.ts:1544-1554`（speed 常量 260；拾取半径 17px）；`601-602`（magnet 56 基础）。
- 数值：满级磁距 191px → 珠匀速爬 0.67s，无加速吸入感；`playSfx('xp')` 60ms 节流在连续吸珠时吞掉大半。
- 修复（S）：`speed = 260 + (1 - dist/magnet) * 420`（近处快）；拾取 `spawnBurst(state,x,y,'#4ade80',2,70)`；XP 条 fill 时 0.12s 脉冲。

**F-9｜boss 弹幕无预警演出（偏离 FR-SW02 spec）+ 登场无演出** —— 置信度：高（代码）/Speculative（可躲性）
- 位置：`bossBarrage`（1086-1116）1.2s 一拍、无 0.8s 发光预警（spec 明确要求）；弹速 120/170/95/110（spec ≤60% 玩家移速=102；瞄准扇形 170 与玩家全速持平，直线跑不掉）；`spawnBoss`（1118-1127）无 warning 箭头、无 shake/白闪/专属音（与 spawnEnemy 984-985 不一致）。
- 修复（M）：`bossBulletTimer ≥ 1.2-0.8` 时 boss 画预警光圈（发光/膨胀）；弹速统一压到 ≤120；登场 `queueShake(8)`+0.1s 白闪+专属低音 stinger。

**F-10｜命中粒子量低且无方向性** —— 置信度：高（现状）/Speculative（阈值）
- 位置：`survival.ts:1465`（3 颗 power 60 全向）；blade 命中 0 颗（1436-1448）。
- 修复（S）：5-7 颗、初速沿 `-bullet.v` 方向 ±30° 锥形 60-140；blade 命中 2 颗。

**F-11｜敌人受击无 squash/scale-pulse** —— 置信度：高（现状）/Speculative（效果）
- 位置：敌绘制 1876-1990 静态形状+白闪。
- 修复（S）：`hitFlash>0` 时 `ctx.translate(x,y); ctx.scale(1.08,0.92); ctx.translate(-x,-y)`（两行，全部敌型通用）。

**F-12｜掉帧时子弹穿隧（离散采样无扫掠）** —— 置信度：高（数学）/Speculative（实际发生率）
- 位置：碰撞一点采样 `survival.ts:1457`；dt 钳 0.05（MiniGamesView.tsx:1025）；弹速 420→798（604）。
- 验算：swarm 碰撞直径 17.6px（size6×0.8+4）；60fps 步进 7-13.3px 安全；45fps 满级弹速 17.7px 贴线；30fps（RDP 天花板）满级 26.6px 会穿。
- 修复（S）：`|v|*dt > 12` 时子弹内步进 2 次（把移动+碰撞拆两半步）。

**F-13｜窗口 blur 不清键池（粘键漂移）** —— 置信度：高（处理器缺失确认；触发场景推断）
- 位置：MiniGamesView.tsx 全文无 `blur/visibilitychange` 监听（grep 0 命中）；keydown 写 keys（1371-1375）。
- 后果：按住 WASD alt-tab，keyup 丢失 → 回来后船自漂直到重按该键。
- 修复（S）：`window.addEventListener('blur', () => { inputs.forEach(s=>s.clear()); axis/axes 归零 })`。

**F-14｜手柄死区无重映射 + 线性响应** —— 置信度：高（现状）/Speculative（手感）
- 位置：pollGamepad 写原始轴（650）；引擎 `axisLen>0.18` 后原始幅值直通（1290-1295）。
- 后果：过阈瞬间速度 0→~18% 跳变；慢速精走难。
- 修复（S）：`mag = (len-0.18)/0.82` 再 `^1.4`。

**F-15｜HP/XP 条无变化动画；drawHealthBar 文档承诺 flash 未实现** —— 置信度：高
- 位置：`hud.ts:66-69` 注释 "white flash overlay when `flash` > 0" 但 `HealthBarOpts`（59-64）无 flash 字段——死文档；玩家 HP 条（survival.ts:2059）与 XP 条（2087）掉血/涨 XP 均瞬时跳变。
- 修复（S）：opts 加 `flash`（白色覆盖 alpha=flash 剩余比例）；或显示层 ratio 缓动（白条滞后红条的 lag-bar 手法）。

**F-16｜飘字双体系字体不一致** —— 置信度：高（现状）/影响小
- 引擎 texts `800 13px Inter`（2032）vs juice floats `bold 12px system-ui`（hud.ts:219）同世界层叠画。统一为 Inter（S）。

**F-17｜BGM 张力切换重排可闻** —— 置信度：中
- `setBgmTension`（sfx.ts:232-240）stop+start → `bgmStep=0` + 新 stepMs，拍点不连续。修复（M）：不重挂 timer，仅换 effective preset，下一拍自然过渡。

**F-18｜敌接触反冲 46px 瞬移无缓动** —— 置信度：高（现状）
- `survival.ts:1500-1502` 一步位移 46px（tank 8px）。读作 teleport/jitter。修复（S）：并入 F-2 的 kb 冲量体系。

**F-19｜敌方接触判定只查 nearest 目标（2P+ 公平性）** —— 置信度：高（代码路径）
- `survival.ts:1476-1490`：每个敌只对 `nearestAlive` 判接触——贴身 P2 但 nearest 是 P1 时不伤 P2。修复（S）：接触判定遍历所有存活玩家。

**F-20｜0.18s publish（已知项，仅记录手感侧面）**：画布内对象 60fps 不受影响；DOM 状态条/FAB 5.6Hz 步进 + 重渲尖刺为主审已知，不重复报。

---

## 四、Juice 补丁清单

### P0（一改就有感，合计 ≈1 天）
| # | 项 | 对应 | 工作量 | 预期增益 |
| --- | --- | --- | --- | --- |
| 1 | 击杀 `playSfx('pop')` | F-3 | S（3 行） | 割草听觉奖励立刻补齐，最高性价比 |
| 2 | 击退改固定像素+衰减冲量（含 F-18 接触反冲） | F-2/F-18 | S（~15 行） | 命中「推得动」感；tank 阻挡感成立 |
| 3 | 受击顿帧 0.04 + vignette 阈值修正 | F-4 | S | 「瞬间知道」达标；insane 不再无警示 |
| 4 | phase 变化即时 publish + 选卡 confirm 音 | F-6/F-7 | S（4 行） | 升级瞬间不再有 180ms 空窗 |
| 5 | 命中粒子 5-7 颗锥形 + blade 命中粒子 | F-10 | S | 命中密度感翻倍 |
| 6 | 敌受击 squash（hitFlash 时 scale 1.08/0.92） | F-11 | S（2 行） | 全敌型通用廉价打击感 |

### P1（仪式时刻，≈2-3 天）
| # | 项 | 对应 | 工作量 | 增益 |
| --- | --- | --- | --- | --- |
| 7 | boss 攻击 0.8s 预警发光 + 弹速压 ≤120 + 登场演出（shake+白闪+stinger+warning 箭头） | F-9 | M | 弹幕可读性/可躲性（spec 回归） |
| 8 | 死亡 slow-mo：顿帧 0.12 → timeScale 0.3 渐复 → 0.5s 后结算入场 | F-5 | M | 败局也有尊严 |
| 9 | XP 磁吸加速曲线 + 拾取闪光/XP 条脉冲 | F-8 | S | 拾取链从「平」到「吸」 |
| 10 | HP 条伤害白闪（补 hud.ts 死文档）| F-15 | S | 归因+状态可读 |
| 11 | blur 清键池 | F-13 | S | 消灭粘键漂移 |
| 12 | **进化系统接线（含进化卡+演出）** | F-1 | L | 全场最大爽点，但属功能补全而非纯调参 |

### P2（打磨，按需）
子弹子步进防穿隧（F-12, S）· 摇杆死区重映射+expo（F-14, S）· 多人接触全目标判定（F-19, S）· 飘字字体统一（F-16, S）· BGM 无缝张力切换（F-17, M）· 飞船 hover bob ±1px（S）· 圆系敌 squash 循环（S）· crit 飘字/音（S）· XP 条升级 carry 动画（S）· sprint 时间到改专属音（S）· levelup/summary 面板 CSS 入场动画（S）· 大敌击杀顿帧 0.03→0.045（S）。

---

## 五、被推翻的假设 / 已验证无问题

1. **「hit-stop 冻结会累积 dt 导致恢复跳帧」——否**。`hitStopTick` 丢弃溢出（juice.ts:20-26）；survival 双路径（juice 1192-1194 / legacy 1236-1241）均不推进游戏计时；渲染照常。实现正确。
2. **「170px/s 需要加速度/惯性曲线」——不需要**。VS/Brotato 均为即时启停；加了反而毁响应感。速度/屏比（横 5.3s 纵 3.1s）落带内。
3. **「对角线更快」——已归一化**（1294-1298）✓。
4. **「R219.8 假发光丢了光感」——双层绘制在**（eBullets 1790-1799 / orbs 1820-1829）✓；仅 reviveOrbs 保留了 shadowBlur（1833-1846，频率低无碍）。
5. **「只有敌人有受击闪白」——玩家也有**（1218/1494 → drawShipBody 1675 白船）✓。
6. **「顿帧会冻住屏震/飘字」——不会**，tickJuice 按真实 dt 步进（1193），设计正确。
7. **「预警箭头在冻结期不倒计时」——R219.1 已修**（1191 在 early-return 之前）✓。
8. **「shoot 90ms 节流会咬最高射速」——不咬**：最大基础射速 ≈7/s（143ms 间隔）>90ms；仅轮盘 bonus 极端堆叠时咬（设计意图）。
9. **「磁吸珠会穿身飞过」——不会**：拾取半径 17px vs 单帧步进 ≤4.3px。
10. **「音画错位」——无**：全部 playSfx 与视觉同帧同点触发；仅平台级输出延迟（~20-40ms）。
11. **「juice 冻结会冻闪烁/传送门旋转」——会但不可感知**（clock 冻 2 帧，26Hz flicker 中断 2 帧低于感知）。

## 六、未验证项（活体复测清单）

1. 所有 Speculative 结论：F-2 击退阈值体感、F-8 磁吸加速收益、F-9 弹速 170 可躲性（建议真机录 30s boss 战数被弹率）、F-11 squash 效果、F-5 死亡演出收益。
2. 顿帧 A/B：0.03 vs 0.045/0.06 在 60fps 真机的可感知度（建议同 seed 双跑对比录像）。
3. RDP 30Hz 下 F-12 穿隧实际发生率（CDP 注入 `Object.defineProperty(performance)` 或降帧，统计 60s 命中/击杀比）。
4. 音量层级实听：BGM 0.014 是否被 SFX 完全掩盖；hurt/shoot 3 倍差在用户音响上的实际动态。
5. WebAudio 冷启动首音延迟（首局第一发 shoot 是否丢）。
6. 2P+ 摄像机 0.1 平滑 + 90px 死区的跟手度（本评审只核了单人固定视口路径）。

## 七、局限

- 未运行应用/未跑 scripts/（约束），一切时序为代码推演+手工验算；无 Node 微基准必要（主审已测游戏 JS 0.7ms/帧，本报告所有建议均为 O(1)/O(n) 微改，不新增逐帧成本）。
- `slash.ts`/`tetris.ts`/`td.ts` 仅审计 juice 触点与冻结路径，非全文件通读；四作对比结论以触点表为限。
