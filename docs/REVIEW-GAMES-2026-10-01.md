# RGBBox 迷你游戏专项深度评审（游戏开发视角）· 2026-10-01

> 对象：`main@93d365f`（未发布）。7 路游戏域角色并行（G1 玩法系统/G2 手感 Juice/G3 Electron 渲染最佳实践/G4 游戏架构/G5 游戏音频/G6 游戏 UX/G7 产品内容）；通用 GUI 面见同日 `REVIEW_2026-10-01.md`（01 崩溃取证跳过：无 dump）。
> 玩家真实命中面（localStorage 只读提取）：**survival=casual 难度、best 7048、autoPick=best、coach 已关闭**；TD best 21180、slash 67、tetris 零记录。全部结论以此画像校准。
> 主审已对 7 路的 Top 结论逐条独立复核（§1 复核表，含两次双代理互证与一次主审 CDP 第一手互证）。

---

## 0. 一页结论

**因果链：这不是"内容不够"的游戏，而是"内容被数值锁死"的游戏。** 模拟（真实引擎 esbuild 打包 + 16 向走位 bot，4 配置 × 24-48 种子）显示中位局 **68-98 秒全灭**，而 boss（90s）/轮盘/传送门/tank·splitter·healer（60-105s 解锁）全排在死亡墙之后——**真实用户（best 7048 ≈ 模拟 24 局最优 6510）大概率从未杀过 boss、从未见过轮盘/岛屿/半数敌种**（G1 S-1/S-4/S-5）。叠加三重放大器：①其开启的 autoPick=best 实为**反优化启发式**（死亡 P50 82s vs 贪心 95s，分数腰斩，S-2）且**静默剥夺三选一学习回路**（G6 P0：卡片一帧不渲染）；②R202 进化系统（survivor 品类核心质变）**是死数据**（G2 F-1：EVOLUTIONS 全 src 零调用）；③选卡冻结期间 boss 弹幕照飞照伤（G4，与"冻结"承诺自相矛盾）。曲线呈"墙或雪球"二值：85s 死，或幸运种子滚到 40 万分，无心流带。

**七维评分**：

| 维度 | 分 | 一句话 |
|------|----|--------|
| 玩法系统设计 | **2.5/5** | 骨架全、数值把大半内容锁在玩家到不了的地方；敌伤取整坍缩（0.65/1/1.35 全=1）；元进度 17 局买满后死端 |
| 手感/Juice | **3/5** | 四件套接线正确但全档强度在可感知阈值边缘以下（击退 3.5px、击杀无声、受击无顿帧、0.18s 卡片延迟） |
| 渲染技术（Electron） | **4/5** | Electron 配置满分（backgroundThrottling 等三关全关）；Canvas2D 基本功欠缺（无 sprite 缓存、一帧 350-500 次状态切换、shadowBlur 残留四处） |
| 游戏代码架构 | **4/5** | 纯 TS 引擎可无头测、四件套全复用；确定性承诺未兑现、phase gate 顺序债、350 行单 draw 函数是合并事故温床 |
| 游戏音频 | **3.5/5** | 零素材小实现自洽、无削波；三处实缺陷（tetris 双发、张力 off→on 卡死、BGM 因 effect deps 从头重启） |
| 游戏 UX | **2.5/5** | P0×3 全在学习剥夺/错误信息（autoPick 静默、引导步 2 恒真、HP 预览硬编码 5 无视 casual=10）；画布全英文 vs DOM 全中文 |
| 内容深度 | **3/5** | 垂直切片完备（敌 8+boss 4/升级 12×42/神器 8/成就 12）；乘数型内容未铺开（武器层 ≈VS 的 1/15-1/30） |

**最该先做的 10 件**（= 新分支实施清单，全部经复核）：

1. **死亡墙拆除 P0 组合**（G1 数值化并经敏感性实验）：刷怪间隔基数 1.5→0.16 地板 0.45 改为「1.5 起步 + 地板 0.45 + 后期爬升放缓」、XP 曲线 5+3L→4+2L、90s boss HP 114→70——目标：中位局存活 ≥3 分钟、首杀 boss 概率 >50%（Likely）
2. **autoPick 双修**：best 模式改估值序（S-2）+ 升级卡片强制渲染（显示 3 卡 + 高亮自动选择 + 1s 延迟拍板）——学习回路回归（G6 P0/G1）
3. **选卡冻结期弹幕伤害修复**：bossBulletTimer/eBullets 结算移到 running gate 之后（G4）
4. **R202 进化接线**：readyEvolutions 注入升级池（满级+材料时替换三选一为进化卡）+ 进化演出（G2 F-1/G1 S-8）
5. **敌伤分档修复**：取整坍缩 0.65/1/1.35→全 1；改连续伤害池或分档基数（S-3，同步 R218 spec 容错 16/10/6/3）
6. **手感六件 S 批**：击杀 pop 音、固定像素击退（3.5px→12px 定值）、玩家受击 0.03s 顿帧、levelup 即时 publish、锥形爆散粒子、敌人 squash（G2 P0）
7. **Tetris 双修**：'won' 写 best（:1199）+ 双 playSfx 合并残留（:352）（G7/G5）
8. **信息正确性三连**：引导步 2 恒真（taken 初始 12 键）、HP 预览按难度基数（:2436）、画布 banner/飘字中文化（10 处）（G6）
9. **BGM 双修**：张力 off→on 卡死（else 分支补 setBgmTension(0)）、effect deps 收敛（tdSpeed/selectedTowerId/bgmOn 移 ref）停重启（G5）
10. **渲染卫生 pass**（G3 Step1）：shadowBlur 残留四处（td.ts:759/tetris.ts:781/survival.ts:1842+1878）、每敌无条件 shadowBlur=0、hud 血条渐变缓存、冗余 clearRect——预期满负载 JS -30-50%（Likely）

## 1. 证据与方法

7 路分报告归档 `docs/review-games-2026-10-01/G1..G7`。置信度约定同主评审（Confirmed/Likely/Speculative）。

**主审独立复核表**（Top 结论逐条）：

| 结论 | 来源 | 复核手段 | 结果 |
|------|------|---------|------|
| R202 进化系统死数据（EVOLUTIONS 零调用点） | G2 F-1/G1 S-8 | grep 全 src 唯一命中 swarmMeta.ts 定义 | ✅ |
| 选卡冻结期弹幕伤害 | G4 | 双 phase gate 定位（1132 属 debugSpawnBoss；tickSurvival 唯一 gate 1263；弹幕结算 1199-1211 在其前） | ✅ |
| 每日种子承诺未兑现 | G4/G6 | survival 25 / slash 9 / tetris 7 处 Math.random vs daily.ts 头注 OD-05 | ✅ |
| Tetris 'won' 不写 best | G7 | :1199 仅挂 'lost'；LAN/duel 分支各有处理，单人竞速无 | ✅ |
| autoPick 同帧拍板剥夺卡片 | G6 | :1078-1086 + publish 0.18s 时序 | ✅ |
| 引导步 2 恒真 | G6 | ONBOARD_STEPS sw.2 判 `keys(taken).length>=1` vs taken 初始化 12 键 | ✅ |
| HP 预览硬编码 5 | G6 | :2436 `HP {5+character.hpMod}` 无难度项 | ✅ |
| tetris 双 playSfx | G5+G4 双报 | :352-353 两行连写 | ✅ |
| BGM 张力 off→on 卡死 | G5 | else 分支只清局部变量未推 setBgmTension(0) | ✅ |
| BGM 因 deps 重启 | G5 | effect deps 含 bgmOn/fullscreen/selectedTowerId/tdSpeed | ✅ |
| 敌伤取整坍缩 | G1 S-3/G6 | Math.max(1,Math.round(0.65/1/1.35))=1/1/1 | ✅ |
| shadowBlur 残留四处/每敌清零/渐变每帧 | G3 | 逐行核对 td:759/tetris:781/survival:1842,1878,1984/hud:83 | ✅ |
| backgroundThrottling 等三关全关 | G3 | main/index.ts 确认 | ✅ |
| LAN Tetris 无 desync | G4 排除项 | 事件同步模型+garbage 随机仅落接收方 | ✅ 采信 |
| 击退 3.5px / insane 3HP vignette 永不触发 | G2 | 算术验算 | ✅ |
| 死亡墙 68-98s / 用户未见 boss | G1 | 其自有模拟（方法已核：真实引擎打包+bot）；锚点代码全验证 | ⚠️ 方向采信（模拟假设已列明；实施后以真实局验证） |

**更正记录**：①昨日主评审线索称 publish 为"深拷贝"——G4 实为浅拷贝（enemies 引用共享），以 G4 为准；②G7 纠正线索块"R218.5 S4 大世界待裁决"——实已交付（R219.9 又将 1P 回退固定视口），以 G7 为准；③G4 纠正测试盲区清单（spawn 权重/boss 轮转实有覆盖），采信。

## 2-7. 分维度章节（详见附录）

- **G1 玩法**：S-1 死亡墙（刷怪 4-7 units/s vs 基础 DPS 2.0；XP 三重节流）/S-2 autoPick 反优化/S-3 敌伤坍缩/S-4 统计幽灵（tank 0.4% 事件占比，8 种行为只兑现 5）/S-5 boss 双态（19.7s 弹幕马拉松 vs 后期 0.8s 皮纳塔）/S-6 元进度悬崖（满配 ×28 后死端）。补丁清单已数值化并经敏感性实验。
- **G2 手感**（5.5/10）：四件套接线正确但强度全在阈值下；F-1 进化死数据为最大缺口；不建议加惯性（即时启停是 VS 系正解）。
- **G3 渲染**（B/B+）：推荐 Canvas2D 深度优化（Step1 卫生 S → Step2 sprite 图集+bgCache 推广 M → Step3 lighter 混合+HUD 拆层 M-L）；WebGL2/OffscreenCanvas+Worker/PixiJS/dirty-rect 判**不建议**（<500 实体+单人维护下过度工程，PixiJS 另违背零渲染依赖边界）。
- **G4 架构**（B+）：LAN 无 desync；演进路线 7 步（gate 前移/rng 注入/dt 公式化 → sfx 出引擎/draw 分层/注册表 → fixed timestep+回放）。
- **G5 音频**：三实缺陷+升级清单 P0×2/P1×5/P2×4；已做对 9 项。
- **G6 游戏 UX**：P0×3/P1×8/P2 若干；R219 系列已修 12 项核对全属实。
- **G7 内容**：1 深耕（Survival）+1 维持（TD）+2 冻结（Tetris/Slash）；Top5：C1 武器化 build 层/C2 岛屿事件化/C3 元循环延展/C4 Tetris 结算修复+跨作金币/C5 节拍弹幕（不触 R90 搁置——无 ML）；独占差异化 G-A~G-E（游戏画面投屋/节拍弹幕/成就灯仪式/战绩卡/每日主题色）。

## 8. 路线图（新分支 `feat/games-review-fixes` 实施批次）

| 批 | 内容 | 规模 | 验收 |
|----|------|------|------|
| C1 玩法正确性 | 弹幕冻结伤害/won 写 best/引导步/HP 预览/双音效/BGM×2/enterGame 残留/vision 键池/tdHover ref/fs 死亡结算 | M | 全量测试+新增锁 |
| C2 死亡墙+autoPick | G1 P0 数值组合+卡片强制渲染+估值序+敌伤分档 | M | 模拟复测中位存活 ≥3min |
| C3 手感六件+进化接线 | G2 P0 批+EVOLUTIONS 注入+演出 | M-L | CDP 体感+单测 |
| C4 渲染卫生 | G3 Step1（+Step2 视余力） | M | 帧预算复测 |
| C5 RNG+杂项 | mulberry32 注入+色板/图鉴/预警箭头 | M | daily 一致性单测 |

## 9. 待用户确认 / 未验证

- G5 节拍弹幕（C5 候选）与 G7 独占差异化 G-A~G-E：属新功能，未在本轮实施范围，待点名。
- G1 模拟的 bot 走位策略与真人差异：实施 C2 后需真机实局验证（Likely 标注）。
- G2/G6 的感知类结论（手感阈值/色弱混淆）：列活体复测清单于各附录。
- 音频听感、fs 视觉体感未活体复核（约束不启应用）。

## 附录索引
docs/review-games-2026-10-01/G1-gameplay.md … G7-content.md（7 份）。
