# G3 · 渲染实现评审——「Electron 最佳游戏效果」差距对拍与迁移路线

> 角色：Canvas/WebGL 渲染工程师 + Electron 性能专家。对象：四作（重点 Nova Swarm/survival）。
> 方法：静态代码审查（全部 file:line 亲自读过）+ 主审 CDP 已测事实（r219-perf.mjs 结论，未复跑）。
> 环境：Electron 41.4.0 / React 19.2.5 / Canvas 2D 单画布 / 仓库内 WebGL 先例 gl/effectGl.ts。

---

## 1. 摘要（评级 + 推荐路线）

**评级：Canvas 2D immediate-mode 实现的「合格偏好」档（B / B+）。**
R217/R219 五轮后，HiDPI 画布、alpha:false、背景离屏缓存、假发光、Electron 后台节流全关等关键项已达标；剩余差距集中在**每帧矢量重绘（无 sprite 缓存）、ctx 状态高频切换、每帧重建渐变对象、残留 shadowBlur、冗余全幅 clear、TD/Tetris/Slash 未享受 survival 的背景缓存**。当前实测游戏 JS 仅 ~0.7ms/帧（小负载），瓶颈在呈现链（RDP 30Hz 天花板）而非 JS；但实体上量（几百敌+粒子）后 draw 成本线性放大，矢量重绘会成为第一瓶颈。

**推荐路线：方案 (a) Canvas2D 深度优化（sprite 图集 + 状态排序 + 渐变缓存 + 残留 shadowBlur 清零 + TD/Tetris 背景缓存），不上 WebGL。** 理由：本作实体规模 <500、单人维护、引擎层已是纯 TS 可单测的 immediate-mode 结构，WebGL2 spritebatch 的收益（万级实体、真后处理）在本规模是过度工程；且 CLAUDE.md「不引入路由/store 库」的约束精神下，引 PixiJS 这类渲染运行时同样应避免。视觉上限的廉价突破点是把 `globalCompositeOperation='lighter'` 引入激光/爆炸/XP 珠（Canvas2D 原生支持，一次状态切换/批的成本）。

---

## 2. 已做对的事（避免后人重做）

| # | 事项 | 证据 |
|---|---|---|
| 1 | `getContext('2d',{alpha:false})` 不透明上下文，免整页逐像素混合 | MiniGamesView.tsx:976 |
| 2 | DPR-aware backing store（dpr 钳 2、下限 900×520、比例锁、ResizeObserver 重设） | hdCanvas.ts:40-47；MiniGamesView.tsx:983-1001 |
| 3 | survival 静态背景离屏缓存：键=`场景|岛|backing 尺寸`，miss 才重画，每帧一次 drawImage blit | MiniGamesView.tsx:1119-1133；survival.ts:1725-1731 |
| 4 | 珠/敌弹 shadowBlur→双层假发光（CDP 二分确认 shadowBlur 是帧耗时主因） | survival.ts:1790-1800、1820-1830 |
| 5 | Electron 后台节流三开关全关（app 级 disable-renderer-backgrounding / disable-backgrounding-occluded-windows / CalculateNativeWinOcclusion）+ 所有 BrowserWindow `backgroundThrottling:false`——LAN 双端/浮窗场景的 rAF 停摆问题已解 | src/main/index.ts:88-89、102、160-168；overlayManager.ts:119 |
| 6 | MediaPipe 视觉栈放独立 renderer 进程（visionHost 隐藏窗），不抢游戏窗主线程 | src/main/index.ts:1079-1094 |
| 7 | 逻辑/绘制分层干净：引擎纯 TS（tick/draw 分离）、帧数据走 ref、React 快照 0.18s 才发布一次（~5.5Hz） | MiniGamesView.tsx:1275-1282 |
| 8 | dt 钳 0.05 防挂起跳帧；fsPaused 时 dt=0 冻结全部引擎 | MiniGamesView.tsx:1025-1027 |
| 9 | 1P 固定视口（消除跟镜头滚动读作卡顿的观感问题）、fs 可变纵横比零黑边 | survival.ts R219.9（PRD §R219.9） |
| 10 | 每帧 setTransform 顺手「治愈」ResizeObserver 重设 backing 后的 ctx 状态丢失 | MiniGamesView.tsx:1010-1022 注释明说 |
| 11 | 世界层/HUD 层用 save/translate/scale/restore 分层（摄像机语义正确，HUD 恒视口坐标） | survival.ts:1784-1787、2041 |
| 12 | slash 分支 `getContext('2d')` 二次调用返回同一 ctx（首次的 alpha:false 生效），无透明回退 | MiniGamesView.tsx:1157-1159（同 canvas 幂等） |

---

## 3. 对拍表：Canvas 2D immediate-mode 最佳实践 × 现状

置信度：★高（代码直证）/ ◆中（静态推算）/ ◇低。

| # | 最佳实践 | 现状（file:line） | 差距 | 改法 | 置信度 |
|---|---|---|---|---|---|
| 1 | **sprite 位图缓存**：静态外形（船/敌各 kind/珠/弹）预渲到 offscreen，每帧 drawImage（实测通常 3-10× 差） | 全部矢量每帧重绘：船 7+ 笔+渐变（survival.ts:1645-1699），敌 2-6 笔（1876-1991），珠 2 fillRect+save/rotate（1820-1830），Tetris 格子 3 fill+save/restore（tetris.ts:592-612，满盘 200 格=600 fill） | **最大单项差距**。每实体 3-9 个绘制调用 vs 1 个 drawImage | 按 kind 预渲 sprite 图集（按 dpr×2 烘焙一次），绘制处 drawImage+translate/rotate；hitFlash 白闪可烘焙白色变体 | ★高 |
| 2 | **ctx 状态切换最小化**（fillStyle/strokeStyle/font 按类排序成批） | survival 中期一帧估算 350-500 次样式写入（敌每只 3-5 次 fillStyle+1-2 strokeStyle+1 次 `ctx.shadowBlur=0` 无条件写（survival.ts:1984），粒子每颗 2 次 globalAlpha+1 fillStyle（1996-2001），飘字每条 font+textAlign（2029-2036） | 颜色逐实体交替，Chromium 每次不同串都要 parse+设状态 | sprite 化后自然归零；过渡期按颜色/kind 分桶绘制 | ◆中（次数为静态数点） |
| 3 | **path 合批**（beginPath 累积多段一次 stroke） | TD 网格 40 根线逐根 beginPath/stroke（td.ts:692-699）；Tetris 背景网格 ~32 根+盘内网格 28 根逐根（tetris.ts:739-740、749-750）；slash 道场 12 根斜纹逐根（slash.ts:566-572） | 每根一次状态应用+stroke 提交 | 一条 beginPath 累积全部 moveTo/lineTo 后单 stroke；更优=静态部分进背景缓存（见 #4） | ★高 |
| 4 | **静态层离屏缓存**（survival 已做，推广到 TD/Tetris/Slash） | 仅 survival 有 bgCache（MiniGamesView.tsx:1119-1133）。TD 每帧重画：面板渐变 fillRect（td.ts:630-633）+40 网格线+路径三次 stroke 中前两次静态+出口环（690-715）；Tetris 每帧重画底色+网格+盘框（tetris.ts:735-750）；slash 每帧重画渐变+斜纹+光尘（slash.ts:554-587，含动画不宜全缓存，渐变对象可缓存） | TD/Tetris 的静态底 ≈70-90 次绘制调用/帧纯浪费 | 复用 survival 的 key 化 bgCache 模式；TD 动画项（dash 流动 lineDashOffset:708、出口脉冲:713）保留在动态层 | ★高 |
| 5 | **渐变对象复用**（createLinearGradient 每帧分配+跨 binding） | 血条每条每帧新建渐变（hud.ts:83，survival HUD 6-8 条+TD 1+Slash 1）；船尾焰每船每帧（survival.ts:1660）；dojo 背景每帧（slash.ts:555）；vignette 每帧径向（hud.ts:118，仅低血时） | 位置固定的条/背景渐变完全可缓存（渐变坐标在 paint 时才解析，缓存安全） | 模块级/WeakMap 按 (x,y,w,h,ratio 档位) 缓存；ratio 只有 3 档色，可只建 3 个 | ★高 |
| 6 | **shadowBlur 清零**（R219.8 只清了珠/敌弹） | 残留四处：TD 弹体每发 shadowBlur 10（td.ts:759）；survival 精英敌 14（1878-1879）；复活珠 12（1842-1843）；Tetris 当前方块每格 10（tetris.ts:780-783） | TD 后期几十发弹=每帧几十次高成本模糊；精英敌/boss 战全程带着 | 统一双层假发光（已有 in-house 模式，survival.ts:1791-1799 照抄） | ★高 |
| 7 | **冗余全幅 clear 消除**（alpha:false 下 clearRect=整幅黑 fill） | survival：clearRect 全幅后紧跟全幅 bg blit（survival.ts:1764→1772）；TD：clearRect 后紧跟全幅渐变 fill（td.ts:686→630-633）；Tetris 同（tetris.ts:729-736） | 每帧多一次整屏栅格化 pass，弱 GPU 上直接吃呈现预算 | 全幅不透明覆盖前删 clearRect（Tetris 双板 noClear 路径已证明可行） | ★高 |
| 8 | **分层画布**（背景/世界/HUD 三 canvas 叠加，HUD 免每帧重画） | 单 canvas，HUD（血条/胶囊/文字 ~40-60 op）与世界同帧重画（survival.ts:2043-2101） | HUD 大部分帧间不变（分数/时间 1Hz 变化），60Hz 重画浪费 | HUD 拆第二 canvas，脏检（值变才重画）或降频 10-15Hz。收益中等（HUD 占比小），优先级低于 sprite | ◆中 |
| 9 | **字体设置/测量成本** | 每帧每文本项设 font（'800 13px Inter…' survival.ts:2032 等 ~10+ 处）；measureText 仅 wrapCanvasText（fs HUD，非逐帧） | 同串重复 set 在 Chromium 有缓存，成本小 | 把 font 串提为常量并按块设置一次；非热点，顺手做 | ★高（成本低这一事实）/影响 ◇低 |
| 10 | **dirty-rect** | 无（全幅重画） | **不适用**：弹幕生存类全部实体持续运动，dirty-rect 反而增加维护成本。行业惯例就是全幅重画 | 不做（明确写进「不建议」清单） | ★高 |
| 11 | canvas 尺寸/GPU 纹理上限 | backing 最坏 1800×1040（MAX_SCALE=2）；survival fs 随 CSS 盒×dpr≤2，1440p 全屏≈2560×1440 | 远低于 GPU 纹理上限（8192+），无风险 | 无需改 | ★高 |
| 12 | willReadFrequently 误用 | 仅 superres.ts:308（视频读回，正确用法）；游戏路径未用 | 无问题 | — | ★高 |

---

## 4. Electron 特化检查

| 项 | 现状 | 判定 |
|---|---|---|
| backgroundThrottling | 主窗 false（src/main/index.ts:167），overlay/screensaver/snip/visionHost 全部 false；app 级 `disable-renderer-backgrounding`+`disable-backgrounding-occluded-windows`（88-89）+ `disable-features=CalculateNativeWinOcclusion`（102） | **满分**。后台/遮挡窗口 rAF 停摆对 LAN 双端的影响已被系统性排除（R38/R43/R44 三层修复，注释链完整） |
| GPU raster 强制开关 | 未设（默认开启 GPU 栅格）；无 disable-gpu | 正确，勿动 |
| offscreen 渲染 | 未用 | 不需要（无无头采集需求） |
| vsync/帧调度 | 单 rAF、dt 可变钳 0.05（MiniGamesView.tsx:1025）。物理为 dt 积分 → 30/60/120/144Hz 下**时间一致性成立**（弹道速度同、仅视觉步进密度不同）。已知弱点：①30Hz 下高速弹无 CCD 可能穿墙（本作弹速/尺寸下风险低）；②非确定性积分（浮点 dt 逐帧不同）——但 LAN TD 走「房主权威+15Hz 快照+恒速外推」（MiniGamesView.tsx:1037-1051、td.ts:880-888），已绕开该问题 | **可接受**。固定步长+插值只有「需要确定性回放/物理严格」才值得做，现状不是瓶颈，列入不建议 |
| rAF 生命周期 | loop effect deps 含 `selectedTowerId/fullscreen/bgmOn/tdSpeed`（MiniGamesView.tsx:1317）→ 点塔/切全屏会 cancel+重建 rAF；`fullscreenchange` 再叠加一次 setState。表现为一次性的掉帧可能（非持续） | 小瑕疵；deps 收敛为 ref 即可（S 级顺手项） |
| React 重渲与游戏循环互斥 | 快照 0.18s 发布（5.5Hz）+ 深拷贝实体数组（publishSurvival MiniGamesView.tsx:586-588）。PRD R219.8 已证实「卡顿=循环外工作挤压」（rAF 入口 gap 2.1-12.7ms） | 5.5Hz 的 DOM 部分是当前非 fs HUD 的架构需要；fs 态已纯画布 HUD。若真机仍有压力，可将快照间隔放宽到 0.25s 或 diff 后才 setState |
| Chromium canvas 加速条件 | alpha:false ✓；canvas 无 CSS filter/transform 降级路径；`imageSmoothingQuality='high'` 每帧设置（1023-1024）对 1:1 blit 无重采样成本 | 达标 |

---

## 5. 迁移路线四案对比

| 方案 | 内容 | 预计收益 | 工作量 | 判定 |
|---|---|---|---|---|
| **(a) Canvas2D 深度优化** | sprite 图集（对拍表#1）+ TD/Tetris/Slash 背景缓存（#4）+ 渐变缓存（#5）+ 残留 shadowBlur 清零（#6）+ 删冗余 clear（#7）+ path 合批（#3）+ 可选 lighter 加色混合 | draw 0.6ms→0.2-0.3ms（小负载）；满负载（数百实体）估算 3-6ms→1-2ms；全幅 pass 从 4-6 次降到 2-3 次，直接缓解弱 GPU 呈现反压 | **S-M**（无新依赖，纯绘制层改动，引擎 tick 零改动，可逐作独立落地） | **推荐主路线** |
| (b) WebGL2 spritebatch | gl/effectGl.ts 只有全屏 quad+片元公式的先例（effectGl.ts:98-105），**没有**批渲染基础设施；需新建 instanced quad+纹理图集+正交相机+文本方案（SDF 或 DOM 叠加）~500-800 行 | 1 万+实体才需要；<500 实体下相对优化后的 Canvas2D 无可感知差 | M-L + 维护两套绘制路径（四作共享 hud.ts 文本/胶囊体系全要移植） | **不建议**（过度工程；对拍表已证 Canvas2D 余量充足） |
| (c) OffscreenCanvas+Worker | 渲染搬 worker，主线程只发状态 | 主线程解放——但实测主线程 JS 仅 0.7ms/帧，无债可还；输入/状态需 SharedArrayBuffer 或逐帧序列化，复杂度换零收益 | M-L | **不建议** |
| (d) PixiJS 等库 | 声明式 WebGL2 场景图 | 同 (b) 的收益 + 开箱 bloom/filter；但引 ~400KB 渲染运行时 | M + 新依赖 | **不建议**：CLAUDE.md 明文「不引入路由/store 库」针对的是应用架构膨胀；游戏渲染运行时虽不同类，但「纯 TS 引擎+零渲染依赖」是本仓库已验证的架构资产（engine 可独立编译/单测 1483 用例），引库破坏该边界。且 (a) 已达本规模所需 |

---

## 6. 帧预算表（静态推算 + 主审实测锚点）

锚点（主审 CDP，r219-perf.mjs）：小负载（0-4 敌/3-14 珠）游戏 JS **0.7ms/帧**（tick 0.05 + draw 0.6）；rAF 入口 gap 2.1-12.7ms（画布隐藏归零）→ 卡顿源=呈现反压+循环外工作；RDP 30Hz 呈现天花板（环境）。

| 每帧工作项 | 现状（中期负载估算） | Step1 后 | 16.7ms(60Hz) | 8.3ms(120Hz) |
|---|---|---|---|---|
| 清屏 clearRect | ~0.05-0.1ms（整幅，冗余） | 0（删） | — | — |
| 背景 blit | 1×drawImage ≈0.1ms | 同（TD/Tetris 也缓存） | — | — |
| 世界层（敌/弹/珠/粒子/船） | 满负载 ~2-4ms（矢量+状态切换） | 0.8-1.5ms（sprite） | ✓ | ✓ |
| HUD（血条/胶囊/文本） | ~0.3-0.5ms（含渐变重建） | ~0.2ms | ✓ | ✓ |
| 残留 shadowBlur（TD 弹/精英/方块） | 峰值 ~0.5-1.5ms（几十次模糊） | ~0.1ms（假发光） | TD 后期当前已紧 | 修复后 ✓ |
| React 5.5Hz 快照（摊销） | ~0.5-1ms/触发帧 + DOM diff | 同或降（diff 门控） | ✓ | 边缘 |
| **合计 JS** | **~3-6ms（满负载峰值）** | **~1.5-2.5ms** | 现状达标但余量薄；Step1 后厚 | 现状不保证；Step1 后 ✓ |
| 呈现（合成/栅格） | RDP 30Hz 环境钉死；真机普通 GPU 预计 60Hz 无压力（alpha:false+全幅 pass 减少） | 全幅 pass 4-6→2-3 | — | — |

结论：60Hz 预算现状大概率达标（0.7ms 实测为小负载；满负载静态推算 3-6ms 仍在预算内），120Hz 屏需要 Step1 才稳妥；30Hz RDP 是呈现链环境问题，JS 侧无解（已如实记录在 PRD R219.8）。

---

## 7. 渲染升级路线图

**Step1（S，1-2 天）：卫生_pass**
- 删三处冗余全幅 clear（survival.ts:1764 / td.ts:686 / tetris.ts:729，全幅不透明覆盖前）。
- 残留 shadowBlur 清零：td.ts:759、survival.ts:1878-1879、1842-1843、tetris.ts:780-783 → 双层假发光。
- 渐变缓存：hud.ts:83/118、survival.ts:1660、slash.ts:555、td.ts:630。
- 网格 path 合批（td.ts:692-699、tetris.ts:739-750）。
- loop effect deps 收敛（selectedTowerId 等转 ref，免 rAF 重建）。
预期：满负载帧 JS -30-50%（Likely）；TD 后期/boss 战掉帧风险显著下降；视觉零变化。

**Step2（M，3-5 天）：sprite 图集 + 背景缓存推广**
- survival 八种敌+船四色+珠+弹按 dpr 预渲图集，drawImage 替换矢量段（hitFlash 白色变体、elite 光晕预烘）；Tetris drawCell 同理（tetris.ts:592-612）。
- TD/Tetris 静态底进 survival 式 bgCache（动画项留动态层）。
预期：世界层 draw 3-10×（Likely 0.6→0.2ms 量级）；120Hz 屏预算达标；视觉零变化（逐像素近似，需快照回归）。

**Step3（M-L，按需）：视觉上限档**
- `globalCompositeOperation='lighter'` 加色混合引入激光/爆炸/XP 珠/涟漪（Canvas2D 原生，一批一开关，弱 GPU 成本可控需实测）——观感提升最大的单项。
- HUD 拆层 canvas + 脏检降频。
- 低分辨率 bloom（离屏 1/4 降采样+lighter 回贴）作为可选视觉档。
预期：视觉增益为主；帧预算 +0.3-0.8ms（Likely），Step1/2 腾出的余量覆盖。

**明确不做**：dirty-rect（弹幕类全幅重画是正解）；WebGL2 spritebatch / PixiJS / OffscreenCanvas+Worker（<500 实体 + 单人维护下过度工程，见 §5）；固定步长+插值（仅确定性需求才值得，LAN 已用快照外推绕开）。

---

## 8. 未验证项 / 局限

1. 帧预算表的满负载数字是**静态推算**（以 0.7ms 小负载实测为锚点按实体数线性外推），未在真机几百实体下实测——按约束未启动应用。建议 Step1 落地时用 r219-perf.mjs 同协议复测。
2. `globalCompositeOperation='lighter'` 在用户真机普通 GPU 上的每批成本未实测（Chromium 通常走 GPU fast path，但弱核显需验证）。
3. RDP 30Hz 呈现天花板为主审结论，本报告未复测；JS 侧无法改善该环境。
4. sprite 化后「逐像素近似」的视觉等价性需依赖现有 ui:snapshot 9 快照回归（本仓库已有该基础设施）。
5. React 5.5Hz 快照的 DOM diff 成本未单独计时（PRD 只给了 rAF 入口 gap 总量）。
