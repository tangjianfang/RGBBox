# 08 · 三体主题灯效库 功能评审（RGBBox / 多角色评审·功能线）

> 评审对象：在现有 48 kind 灯效库上新增「三体（刘慈欣三部曲）主题灯效库」。
> 评审纪律：所有结论均基于本轮亲自读码（grep/Read），标注 file:line 与置信度（Confirmed / Likely / Speculative）。
> 仓库只读；用户真实数据 `%APPDATA%\rgbbox` 只读（captures/index.json 12 条已核，见 §1.4）。
> 日期：2026-10-12。

---

## 0. 结论速览

- **可行，且改动面已被 R285（删除批）反向验证过一遍**：新增一个 CPU kind 触 7 处（types / effects.ts case / defaultProfile / EffectsView 分组 / i18n×zh·en / visual-floor tier / effects.test RGB 扫描），全部为既有模式追加，无 schema 变更。
- **推荐首批 4 个 CPU 效果**：`three-body-orbit`（三体运动·八字周期解）、`trisolaris-dawn`（三日凌空）、`droplet-mirror`（水滴·镜面）、`gravity-wave`（引力波广播），加一个 `effects.threebody` 分类 tab——最小改动成立完整主题库。
- **旗舰 `dual-vector-foil`（二向箔降维）放二批**，走 CPU/GPU-2D 而非 GPU-3D（R284 教训：shader 深改在 headless-gl 下全黑；types.test 硬编码 3D kind 数=5）。
- **明确不做 6 项**：宇宙闪烁（R283 实锤的"全场同步明暗"平淡+光敏风险）、曲率航迹/死线（≈comet）、独立乱纪元（准静态雷区）、写实舰队/城市轮廓（24×14 原理性不可辨，icosahedral-virus 删除先例）、古筝行动（一条亮线）、整段文字叙事（5×7 字体仅容 ~4 字符）。

---

## 1. 现状盘点：效果引擎能力矩阵

### 1.1 三条渲染管线（Confirmed）

| 管线 | 入口 | 交付路径 | 新增改动点 |
|---|---|---|---|
| CPU per-pixel（43 kind） | `renderEffectPixel` switch `src/engine/effects.ts:326-1694` | worker 逐像素算 24×14 帧 → overlay/物理输出（**唯一**驱动 LED 的路径） | effects.ts 加 case |
| GPU 2D shader（24 kind 子集） | `EffectGl` `src/renderer/src/gl/effectGl.ts:1108`，`GPU_DIRECT_EFFECTS` 名单 `effectGl.ts:59-88` | 仅应用内预览与效果卡（`PreviewGrid.tsx:153`、`OverlayCanvas.tsx:158`、`EffectsView.tsx:244`）——**预览增强，不是输出路径** | effectGl.ts 三处（名单/EFFECT_FS/paramsFor） |
| GPU 3D raymarch（5 kind） | `Effect3DGl` `src/renderer/src/gl/effect3dGl.ts:562`，SHADERS map `effect3dGl.ts:520-526` | 全分辨率渲染 + `readLEDs()` 降采样出 LED 帧（`effect3dGl.ts:645`），overlay 经 `EFFECT3D_CHANNEL` 广播透传（`Preview3D.tsx:132`） | types.ts Effect3DKind + EFFECT_3D_KINDS + SHADERS |

**关键结论（Confirmed）**：GPU-direct 2D 效果的物理 LED 输出仍由 CPU `renderEffectPixel` 计算——effectGl.ts 头注 `effectGl.ts:32-46` 明确列出未移植名单与排除原因。因此**每个新效果必须先有 CPU 实现**；GPU 2D shader 是可选的预览平滑化第二步。这直接约束二向箔/水滴的选型：CPU 数学骨架必须先立住。

### 1.2 CPU 引擎可用手法库（对照三体场景需求，Confirmed）

| 手法 | 代码证据 | 已有使用者 | 对三体场景的覆盖 |
|---|---|---|---|
| 径向波/环 | ripple（`effects.ts:577`）、neon-pulse（`effects.ts:1144`）、explode（`effects.ts:762`） | 三环+辐条+热核 | 引力波（需加角向 2θ 项差异化）、光粒爆闪 |
| 轨道天体+帧级几何缓存 | `getSolarSystemPlanets` `effects.ts:213-232`（GEOMETRY_CACHE_LIMIT=64 `effects.ts:197`） | 8 行星开普勒轨道 | **三体运动**（3 体轨迹缓存同模式）、三日凌空 |
| 噪声域扭曲 | `fbm2`/`valueNoise2` `effects.ts:77-101`；nebula/fluid-flow/lava 类用法见 `effectGl.ts:594-669` | 星云/流体/黑洞湍流 | 智子展开、二向箔边界湍流 |
| 点-线段距离绘线 | `pointSegmentDistance` `effects.ts:141-150`（protein/mitosis/synapse 每帧几十采样点） | 蛋白骨架/纺锤体 | 四维超立方体线框、人列计算机行进波 |
| 热辐射色带 | `thermalColor` `effects.ts:125-130` | fire/black-hole | 三日凌空（恒星光度→色温） |
| 离散粒子/块翻转 | starlight `effects.ts:541`、matrix-rain `effects.ts:1099`、glitch `effects.ts:1066`；PIXEL_STYLE_EFFECTS `types.ts:262-268` | 星光/矩阵雨/故障 | 人列计算机（CA 翻转）、末日粒子雨 |
| 文字（5×7 位图） | `getTextMask` `src/engine/textRenderer.ts`（CW=5 CH=7，ASCII 大写+数字 `textRenderer.ts:8-16`）；engine 侧回退调用 `effects.ts:339` | 仅 static kind | 倒计时（受限：24×14 仅 ~4 字符） |
| 音频联动（CPU） | EffectContext `_audioBass/_audioMid/_audioHigh/_audioBeat/_audioFreqBands` `effects.ts:58-62`；audio-beat 例子 `effects.ts:803-849` | audio-beat/equalizer | 全部候选可选接入（引力波随拍发射、粒子雨随 beat 加密） |
| 音频联动（GPU 3D） | R287 `audioDrive3d.ts` + `Preview3D.tsx:126-132`（JS 侧 uniform 调制，零 GLSL） | 5 个 3D kind 免费获得 | 若做 3D 类三体效果自动继承 |
| 跨帧状态（有界 Map） | `_beatEnvMap` `effects.ts:174-175`（now 键控，帧内共享） | audio-beat 包络 | 人列计算机 CA 代际、黑暗森林猎杀状态机 |
| 色彩空间 | hslToRgb/lerpColor/hexToRgb `src/engine/color.ts`（经 effects.ts:2 引入）；shader 侧 1:1 移植 `effectGl.ts:104-197` | 全部 | 三体配色（陶土橙/冰蓝/黑白镜像） |

### 1.3 UI/分组/测试机制（Confirmed）

- **分类 tab**：唯一分组事实源是 EffectsView 里的 `CATEGORIES` 常量 `EffectsView.tsx:312-320`（7 组：classic/custom/advanced/science/threed/gpu3d/audio）；tab 徽标数取 `cat.kinds.length`（`EffectsView.tsx:485`），新增组零额外逻辑。filter 是 `kinds.includes(kind)`（`EffectsView.tsx:419`）——机制上允许一个 kind 出现在多个组，但约定上一组一类。
- **搜索**：非空 query 全库搜 label/desc/kind id（`EffectsView.tsx:410-417`）——新 kind 自动可搜，中文 label 写入即被中文查询命中。
- **精选区**：数据驱动（默认 profile + CLASSIC_FIVE + 收藏 + 最近，`domain/curatedEffects.ts`），新 kind 无需改动即可通过收藏/最近进入。
- **preset i18n 键自动派生**：`defaultProfile.ts:322-325` 循环为每个 preset 生成 `effects.preset.<kind>.label/.desc` 键名；词表本体仍需手写 zh/en 两侧（en 例 `i18n/index.tsx:579-616`，zh 例 `2434-2471`），另有 `effect.<kind>` 名键族（en `i18n/index.tsx:1426+`）。
- **参数滑杆免费**：PARAM_META 按参数名通用（`domain/paramMeta.ts`），primaryParams 未命中 OVERRIDES 时回退 speed/intensity/hueShift（`domain/primaryParams.ts:31,38-46`）——新 kind 复用既有参数名即得滑杆+快捷尺寸+自动化芯片。
- **随机/灵感**：randomizer 从 effectPresets 动态取合法 kind（`domain/randomizer.ts:34-35`）——三体 kind 会**自动**进入 🎲 灵感池（决策点：是否接受，见 §4.4）。
- **测试门禁（新增必改清单）**：
  - `tests/engine/effects-visual-floor.test.ts:116-121` 强制每个 CPU preset kind 归入 AMBIENT/FEATURE/STROBE/TOOL 某档（档位底线 `:48-52`：ambient avgLum≥0.09/lit≥45%，feature 0.04/20%，strobe 0.03/8%，24×14 网格 16 个采样时刻）；新增 CPU kind **不加入档位数组必红**。
  - 该测试的 `GPU_3D_KINDS` 是硬编码 Set（`:31`）——新增 3D kind 不加进去会误判为 CPU。
  - `tests/shared/types.test.ts:72-73` 断言 `EFFECT_3D_KINDS.size === 5`——新增 3D kind 必改；CPU 名单（`:19-64`）建议同步。
  - `tests/effects.test.ts:156-158` 的"all effects return valid RGB"是**硬编码 kind 列表**，不会自动覆盖新 kind，应追加。
  - `tests/renderer/i18nKeyFamilies.test.ts:21` 下限 ≥48——加 kind 只会更安全，无需改。
- **兜底行为（Confirmed）**：`effects.ts:1667-1668` `case 'screen-ambient': default:` 合并——未知 kind 渲染 screen-ambient 回退动画（渐变），不会崩。
- **GPU 3D 参数面约束**：Preview3D 把固定参数名映射进 u_params/u_detail/u_extra 三组 vec4（`Preview3D.tsx:107-125`，参数名硬编码：speed/hueShift/intensity/density + gridDensity/scanSpeed/particleIntensity/glitchAmount + flickerAmount/hologramDepth/saturation/scanWidth）——新 3D kind 要么复用这 12 个名，要么改 Preview3D+OverlayCanvas 两处接线。

### 1.4 质量基线先例（R283-R288，验收标准依据）

- 程序化指标先例：R284 black-hole 修复目标"1s 差分 0%→>2% + 中行亮度档位>6"；R288 warp-portal 实拍"亮像素 65.3%/彩色 63.0%/600ms 帧差 45.8%"（PRD `docs/prd/PRD-0002-rgbbox-project-catalog.md:4198,4205`）。
- R283 五维评分与 10 标杆名单：`docs/review/R283-aesthetics.md:42-52`（nebula/vortex-flame/mirror-symmetry/fluid-flow/pulsar-beacon/dna-helix/microvilli-field/neon-pulse/hurricane-eye/tokamak-plasma）——新三体效果应至少冲"良"档（≥3）。
- R283 三类系统病：暗谷无地板（lit 3-8%=灯坏了）、准静态（1s 差分≈0）、雷同 8 组——**直接构成三体候选的淘汰规则**。
- metric 盲区警示：`R283-aesthetics.md:16,167-170`——motion% 会被全场同步明暗欺骗；lit% 会冤枉黑底亮结构。验收应以"结构运动+暗谷地板"双指标+真机目视复核。
- 用户使用痕迹（只读核实）：`%APPDATA%/rgbbox/captures/index.json` 12 条（2 photo + 10 annotated，2026-10-06~10-11），其中 10-11 三条对应 R283/R288 评审期实拍——用户确实在用截图链路复核灯效，主题库交付同样会被这样检视。

---

## 2. 三体场景候选卡总表（16 项评估，14 卡+2 并入）

记分：价值 1-5（书迷共鸣×视觉签名强度）；频次=预期日常使用；成本 S/M/L（并注明 CPU/GPU）；风险注明引擎/分辨率/雷同；优先级 P0-P3。
kind 命名遵循现有 kebab-case 惯例（types.ts:24-66）。

| # | 场景（出处） | 建议 kind | 视觉签名 | 引擎映射 | 24×14 可辨性 | 雷同风险 | 价值/频次/成本 | 风险 | 验收标准（程序化） | 优先级 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 三体运动·八字轨道（书1 题眼） | `three-body-orbit` | 三颗光球沿"8 字"周期轨道互相追逐，长尾迹 | CPU：Chenciner-Montgomery 周期解预积分成查找表+帧级几何缓存（同 `getSolarSystemPlanets` 模式 effects.ts:213） | 3 球直径各 2-3 格+尾迹 6-8 格，可辨 | 低（solar-system 是 8 行星绕单一恒星开普勒圆轨 `effects.ts:206-207`，本效果无中心+混沌感+尾迹） | 5 / 高 / M(CPU) | 积分表精度；尾迹采样成本≈27 次距离求值/像素 | feature 档 floor（avgLum≥0.04/lit≥20%）+1s 帧差>2%+三色可分（彩色像素>30%） | **P0 首批（主题门面）** |
| 2 | 三日凌空+乱纪元（书1） | `trisolaris-dawn` | 三颗太阳伪混沌漂移，光度干涉，陶土橙→惨白；双日逼近=凌空过曝 | CPU：三光源 `exp(-d/σ)` 光场叠加+thermalColor 色温（effects.ts:125）；era 参数调制漂移速度/间距 | 三团 4-6 格光斑+全场光场，可辨 | 低-中（eclipse 是单日月遮挡+日冕 `effectGl.ts:854-881`；本效果三动光源+无遮挡叙事） | 5 / 高 / S(CPU) | 慢漂移期准静态风险→用 era 周期强制快慢交替 | feature 档+暗谷地板（最低相位 lit≥8%，R283 S1 病根规避） | **P0 首批** |
| 3 | 水滴·镜面（书2） | `droplet-mirror` | 绝对光滑镜面球：反射星带+移动高光+锐利轮廓，"毁灭你与你何干"的冷 | CPU：圆域法线→假环境反射（星带 hash+横光带）+滑动镜面高光+rim；**刻意零 fbm**（与 lava-sphere 的噪声表面相反） | 球径 ~8-10 格，高光弧 2-3 格，可辨 | 中（sphere-pulse 是噪声位移彩球+轨道相机 `effect3dGl.ts:101`；差异点=镜面光滑+反射感，需调参锁住） | 5 / 高 / M(CPU，GPU 2D 可选移植) | 低分辨率下镜面易读成"渐变圆"→移动高光+星带反射是可辨性锚点 | feature 档+高光位置 1s 帧差可见+饱和度低（镜面签名：sat<40%，形成与现有高饱和库的反差） | **P0 首批** |
| 4 | 引力波广播（书2 罗辑） | `gravity-wave` | 双星互绕向外发射四极螺旋波纹（双臂），蓝白冷光 | CPU：`pow(0.5+0.5·cos(2θ−k·r+ω·t),3)·exp(−αr)`+中心双点；纯闭式 | 双臂螺旋在 24×14 走向清晰 | 中（ripple 同心环无角向 `effects.ts:577`、neon-pulse 径向环 `effects.ts:1144`——差异=2θ 双臂螺旋；调参防退化成环） | 4 / 中高 / S(CPU) | 低；天然 audio-ready（beat→波幅） | feature 档+双臂角向调制可测（左右象限亮度差>15% 时变） | **P0 首批** |
| 5 | 人列计算机（书1） | `human-computer` | 三千万人方块阵列，红旗/暗块按逻辑行进波翻转，进位涟漪扫过 | CPU：闭式"进位波"（cell 亮灭=f(x,y,t·clock+相位)）或帧级缓存 CA（`_beatEnvMap`/几何缓存模式）；红旗橙红调 | 24×14=336 格正好是"方阵"，行进波 2-3 格宽，可辨且题材契合度满分 | 中（matrix-rain 是下落列 `effects.ts:1099`、random-color 是随机色块；差异=斜向行进波+二值翻转+集体感） | 4 / 中 / M(CPU) | CA 若走跨帧状态需处理 seek/循环；闭式化则风险低 | feature 档+翻转密度随 clock 可调+与 matrix-rain 并排盲测可区分（用户裁决） | P1 二批 |
| 6 | 末日之战·粒子雨（书2） | `doomsday-barrage` | 水滴贯穿舰队：高速白色弹道雨+连环爆闪，毁灭的密度与速度 | CPU：多条 hash 种子弹道（斜/横）+尾迹衰减+随机爆闪帧；audio beat 加密 | 弹道 1 格宽×长尾，密集时全屏，可辨 | 中-高（comet 单彗尾 `effects.ts:631`、matrix-rain 列雨——差异=多弹道密度+爆闪+横向贯穿；R283 已把 comet 判"平淡"，本效果要靠密度立住） | 4 / 中 / S-M(CPU) | 密度不足会退化成"多条 comet"；光敏敏感人群（爆闪频率需限 <3Hz 峰值） | strobe 档（avgLum≥0.03/lit≥8%）+600ms 帧差>30%（R288 warp-portal 先例 45.8%） | P1 二批 |
| 7 | 二向箔·降维（书3） | `dual-vector-foil` | 一张小"纸"扫过，三维世界坍缩压扁成二维花纹（名场面：太阳系二维化如梵高星空） | CPU/GPU 2D：坍缩前沿扫过+坐标压缩映射+边界拉伸辉光+坍缩后嵌套环纹二维画 | 前沿线+压缩过程全场可辨；二维画=同心环纹在 24×14 可辨 | 低（全库无"压缩/坍缩映射"手法——独创签名） | 5 / 中高 / **L**(CPU 先行，GPU 2D 移植可选) | 坍缩后终态若静止=准静态病→终态二维画需持续缓旋；GPU shader 若走 headless-gl 有全黑前科（R284 教训，PRD:4198） | feature 档+扫过周期内全程 1s 帧差>2%（含终态）+坍缩前后构图盲测可分 | P1 二批（旗舰，值得 L 成本） |
| 8 | 黑暗森林·猎杀（书2 题眼） | `dark-forest` | 深绿黑暗森林中，一盏灯亮起→一道细光从暗处射来→灯熄灭，循环微叙事 | CPU：跨帧状态机（点亮-被猎-熄灭-冷却）+sparse 星点 | 事件尺度：1 格灯+1 格宽光束，可辨但小 | 中（starlight 是纯闪烁 `effects.ts:541`——差异=因果叙事（光→击→灭），但静态截图不可辨叙事） | 4 / 中 / M(CPU) | 慢叙事=准静态高危（事件间隔需 <3s）；状态机跨帧实现成本 | strobe 档+事件周期内帧差达标+真机录屏目视"因果链"可读 | P2 三批（裁决项） |
| 9 | 智子展开（书1） | `sophon-unfold` | 质子二维展开：电路蚀刻平面+折纸式维度折叠 | GPU 2D：域折叠（对折映射）+电路蚀刻纹（网格+hash 断路） | 平面折痕 2-3 格，电路纹在 24×14 边缘可辨 | **高（hologram 已是全息线框数据球 `effect3dGl.ts:418-516`，且 R287 刚做了音频联动）** | 3 / 中低 / M(GPU 2D+CPU 双实现) | 与 hologram 雷同需用户盲测裁决；"折叠"动画连续性难 | feature 档+盲测与 hologram 可区分 | P2 三批（裁决项） |
| 10 | 光粒打击（书3 歌者） | `photoid-strike` | 相对论光粒入射→恒星不对称爆膨→dim 尾迹 | CPU：边缘入射弹道+不对称爆发壳（偏心 expanding shell） | 入射线+偏心爆壳可辨 | 中-高（explode 是中心对称三环重复爆发 `effectGl.ts:415-452`——差异仅"方向性入射+偏心"） | 3 / 中低 / S(CPU) | 与 explode/audio-beat 的差异化单薄；可并入 #6 粒子雨作为事件 | 若独立：strobe/feature 档+偏心不对称可测（质心偏移>1 格） | P2 或并入 #6 |
| 11 | 归零者·宇宙重启（书3） | `universe-reset` | 万物收缩至亮点→白闪→再膨胀散开，循环 | CPU：收缩-闪-膨胀三段循环（径向映射反转） | 全场过程可辨 | 中（explode 循环变体+breathing 反相——差异=完整三段叙事） | 3 / 中低 / M(CPU) | 长周期=准静态高危（周期需 <8s）；白闪光敏限制 | feature 档+全周期 1s 帧差>2% | P2 三批（裁决项） |
| 12 | 四维碎块（书3 魔戒） | `tesseract-drift` | 四维超立方体旋转投影："内部一览无余"的 impossible 几何 | CPU：16 顶点 4D 旋转→3D→2D 投影+pointSegmentDistance 连线（effects.ts:141） | **高风险**：24×14 下线框顶点间距 2-4 格，接近 icosahedral-virus 不可辨删除线（PRD R285:4198） | 低（全库无线框多面体） | 3 / 低中 / M(CPU) | **分辨率不可辨是主要风险**——必须先做 48×27 卡缩略图原型验证 | 先原型：48×27 卡上 4D 旋转可辨（盲测 3/5 人识"立方体套立方体"）再实现 | P3 原型验证后裁决 |
| 13 | 倒计时（书1 名场面） | `countdown` | 眼前悬浮的 1200:00:00 倒计时+背景噪点 | CPU：getTextMask 数字（textRenderer.ts，DIGIT 3×5 也有现成 effects.ts:152-163）+噪声底 | **5×7 字体 24×14 仅容 ~4 字符**（textRenderer.ts:8-9 CW=5/CH=7）；"1200"可，全时间戳不可 | 低 | 3 / 低中 / S-M(CPU) | 中文 canvas 遮罩仅 static kind 接线（previewEngine.ts:117）；数字滚动体验受限 | 4 字符可读+秒级跳变帧差 | P3（或做成 static kind 的"倒计时文字模板"而非新 kind） |
| 14 | 三日凌空之宇宙闪烁（书1） | — | 整个宇宙为你闪烁 | — | — | — | 1 / 低 / — | R283 实锤：全场同步明暗=视觉平淡+metric 盲（呼吸 m42 案例 R283-aesthetics.md:16,169）；光敏风险 | — | **不做**（可做为他效果的 flicker 参数） |
| 15 | 乱纪元/恒纪元（独立 kind） | — | 长夜-黎明-长夜的慢轮转 | — | — | — | 2 / 低 / — | 慢速状态机=准静态雷区（R283 系统病"准静态 6"） | — | **并入 #2 作 era 参数** |
| 16 | 曲率航迹/死线（书3） | — | 光速飞船留下的死线航迹 | — | — | ≈comet（comet 已判平淡 2.5 分 R283-aesthetics.md:64） | 2 / 低 / — | 一条持久亮线在 24×14=一条 static 线 | — | **不做** |

---

## 3. Top 深入：数学骨架（首批 4 + 旗舰 1）

### 3.1 `three-body-orbit`（三体运动）— CPU

- **骨架**：采用 Chenciner–Montgomery "figure-eight" 周期解（三体问题少数已知稳定周期轨道，三体等质量沿同一 8 字曲线以 1/3 周期相位差追逐）。模块加载时数值积分一次（RK4，固定步长）生成 512×2 查找表 `(x,y)(t)`，归一化到画布；运行时 `position(i, t) = table[(t·speed + i/3) mod 1]`——**确定性、无缝循环、零运行时积分**。
- **渲染**：每像素到 3 个当前体+各 8 个历史采样点（t−kΔ）的距离高斯 → 体=白核+色晕（三色：陶土红/琥珀/冰蓝，对应三个太阳的色温差），尾迹=指数衰减。帧级缓存 3×(1+8) 个采样点（照抄 `getSolarSystemPlanets` 的 layerId+t 键控模式，effects.ts:213-232）。
- **参数**（复用既有 PARAM_META 名）：speed / intensity / density（尾迹长度） / hueShift。
- **音频**：`_audioBeat` → 尾迹亮度踢脚（可后置）。
- **验收**：feature 档 floor；1s 帧差>2%；三体色可分；48×27 卡与 solar-system 并排盲测可区分。

### 3.2 `trisolaris-dawn`（三日凌空）— CPU

- **骨架**：三光源位置用复合 Lissajous 伪混沌漂移 `pos_i(t) = Σ_k a_k·sin(ω_k t + φ_k)`（每体 3 项不同频率比，观感混沌但闭式确定、无积分）；每像素光场 `L = Σ_i w_i · exp(−d_i/σ_i)`，色温走 `thermalColor(L 归一化)`（复用 effects.ts:125）；双日逼近（d(i,j) 小）时全局过曝脉冲+去饱和（凌空事件）。
- **era 调制**（吸收乱纪元）：慢波 `era(t)=0.5+0.5·sin(t·ω_e)` 同时调制漂移速度×(1+2·era) 与 σ——恒纪元慢稳、乱纪元快乱，一个参数承载两个纪元叙事。
- **暗谷地板**：夜相位基线 lit≥8%（R283 S1 病根直接规避；R284 的 8% 温和地板哲学）。
- **参数**：speed / intensity / density（光源尺度） / hueShift / eraSpeed（新参数名，入 PARAM_META 一次）。
- **验收**：feature 档 floor+最低相位 lit≥8%+凌空事件每周期≥1 次（亮度峰值>2×均值）。

### 3.3 `droplet-mirror`（水滴·镜面）— CPU（GPU 2D 可选移植）

- **骨架**：圆心 c(t) 缓慢漂移+半径 R。圆内：法线 `n=(p−c)/R`；假环境反射 `E(v) = 星带 pow(hash2(⌊v.x·18⌋,⌊v.y·6+t⌋),24) + 横光带 0.5+0.5·sin(v.y·3−t·0.2)`（v 由 2D 反射向量采样）；滑动镜面高光 `spec = pow(max(0, n·l(t)), 40)`，l(t) 慢转——高光弧滑动是"镜面感"的可辨性锚点；rim `pow(1−|n·view|, 2.5)`。圆外：稀疏星野（starlight 式但更暗更稀）。**全式零 fbm**——光滑即签名，与 lava-sphere（三重域扭曲 FBM `effect3dGl.ts:345`）正相反。
- **参数**：speed / intensity / density（星带密度） / hueShift（默认 0=冷白）。
- **验收**：feature 档；sat<40%（低饱和冷感，全库反差位）；高光位置 1s 帧差可见；48×27 卡盲测"镜面球"识别率≥3/5。

### 3.4 `gravity-wave`（引力波广播）— CPU

- **骨架**：中心双星 `p_{1,2} = ±ε·(cos ωt, sin ωt)` 两点亮核；四极辐射场 `I(r,θ,t) = pow(0.5+0.5·cos(2θ − k·r + ω·t), 3) · exp(−α·r) · edgeFade`——2θ 项给出双臂螺旋（区别于 ripple 的纯同心环）；蓝白 HSL(210±20)。
- **音频**：`_audioBeat → 波幅 ×(1+0.8·beat)`——"广播"随节拍发射，叙事与机制同构。
- **参数**：speed / intensity / density（k，波数） / hueShift / sensitivity（若接音频）。
- **验收**：feature 档；象限不对称性可测（对角象限亮度差随 t 振荡>15%）；与 ripple 并排盲测可区分。

### 3.5 `dual-vector-foil`（二向箔·降维，二批旗舰）— CPU 先行

- **骨架**：扫过相位 `s(t) = (t·speed) mod 1`；前沿 `y_f(s)` 自上而下（或自一角径向）。三段映射（每像素）：
  1. 前沿上方（未坍缩）：丰富 3D 内容 `C₃D(x,y,t)`=太阳系轨道环+行星点（复用 solar-system 几何）；
  2. 前沿带 `|y−y_f|<w`：拉伸辉光——y 方向指数拉伸+亮缘（物质跌入二维）；
  3. 前沿下方（已坍缩）：二维画 `C₂D = 嵌套扁环纹 (r'=|y_c−y| 的一维化映射) + 缓旋螺旋`——坍缩终态必须**持续缓旋**（防准静态病）。
- **成本 L 的原因**：两个内容场+映射连续性打磨；建议 CPU 实现先过 visual-floor，GPU 2D shader（effectGl EFFECT_FS+paramsFor 三处）作二步移植——headless-gl 风险隔离（R284 教训）。
- **验收**：feature 档；全周期（含终态）1s 帧差>2%；坍缩前后构盲测可分；600ms 帧差>30%（对标 warp-portal 45.8%）。

---

## 4. 主题库机制：最小改动方案

### 4.1 呈现方式（Confirmed 可直接吃现有机制）

- **新增分类 tab**：`EffectsView.tsx:312-320` 的 CATEGORIES 追加一行：
  `{ labelKey: 'effects.threebody' as const, kinds: ['three-body-orbit', 'trisolaris-dawn', 'droplet-mirror', 'gravity-wave', ...] }`
  tab 渲染（`EffectsView.tsx:473-489`）、计数徽标（:485）、搜索旁隐藏逻辑全部现成。
- **i18n 键命名**（走既有约定）：
  - 分类键：`effects.threebody`（en 'Three-Body Collection' / zh '三体'），插入位置对齐现有 7 键（en i18n/index.tsx:617-623，zh 2472-2478）。
  - 每 kind：`effect.<kind>` 名键 + `effects.preset.<kind>.label/.desc`（键名由 defaultProfile.ts:322-325 自动派生，词表条目手写 zh/en）。
- **不需要新分组字段**：分组唯一事实源就是 CATEGORIES（Confirmed）；PresetDefinition 无 category 字段（types.ts:336-349），也不必加——搜索/精选/收藏均数据驱动。

### 4.2 单 kind 改动面清单（CPU 路线，照 R285 反向验证）

1. `src/shared/types.ts` EffectKind 联合追加（:23-67）。
2. `src/engine/effects.ts` 加 case（位置按分组排入；几何缓存照 :189-309 模式）。
3. `src/shared/defaultProfile.ts` effectPresets 追加（kind/label/description/defaults，:3-317 数组内）。
4. `EffectsView.tsx` CATEGORIES 追加 kinds。
5. `i18n/index.tsx` 每 kind 3 键 ×zh/en = 6 行。
6. 测试：`effects-visual-floor.test.ts` 档位数组（:33-46）**必改**；`effects.test.ts` RGB 扫描列表（:156-158）应追加；`types.test.ts` CPU 名单（:19-64）建议追加。
7. 可选：`primaryParams.ts` OVERRIDES、`quickDimensions.ts` QUICK_EFFECT_KINDS、GPU 2D 移植（effectGl.ts 三处）。

### 4.3 GPU 3D 三体效果的建议

不推荐首批做：① types.test.ts:72 硬编码 size=5 必改且易漏；② Preview3D/OverlayCanvas 的 4+4+4 uniform 参数名固定（Preview3D.tsx:107-125），新语义参数要动两处接线；③ R284 实锤 shader 方程改动在 headless-gl 下全黑、只能走参数路径（PRD:4198）。若二批后仍想上（如智子展开 3D 化），按上表 #9 裁决。

### 4.4 决策点（需用户裁决，不建议默认）

- **🎲 灵感池**：新 kind 自动进入 randomizer 池（randomizer.ts:34-35 动态取数）——若希望"灵感"保持原库风味，需在 randomizer 加排除名单（小改）。
- **QUICK_EFFECT_KINDS**（quickDimensions.ts:15 硬编码 12 kind）：是否把 `three-body-orbit` 加入快捷尺寸适用集。
- **AMBIENT_PRESETS**（ambientPresets.ts:13-19）：是否加"三体氛围"预设（如三日凌空低速暖光版）——建议二批随用感再定。

---

## 5. 分批路线图

| 批次 | 内容 | 预估规模 | 出口验收（全批统一门槛） |
|---|---|---|---|
| **批次 1（P0）** | 机制：`effects.threebody` tab + i18n；4 kind：three-body-orbit / trisolaris-dawn / droplet-mirror / gravity-wave（全 CPU） | ~7 文件 + 3 测试文件；每 kind S-M | typecheck 双绿；vitest 全量 0 失败（visual-floor 新档位绿）；`i18n-audit` zh=en 0 findings；快照 9/9 GATE PASS；每 kind 真机实拍（亮像素/彩色%/600ms 帧差，R288 先例格式）+ AI 目视复核；48×27 卡与最近邻效果（solar-system/eclipse/lava-sphere/ripple）并排盲测可区分 |
| **批次 2（P1）** | dual-vector-foil（旗舰 L）+ human-computer + doomsday-barrage | 3 kind，1 个 L | 同上；二向箔加"全周期含终态帧差>2%"专项；人列计算机与 matrix-rain 盲测；粒子雨爆闪频率<3Hz 峰值（光敏） |
| **批次 3（P2，按反馈裁决）** | dark-forest / sophon-unfold（盲测 hologram）/ photoid-strike（或并入粒子雨）/ universe-reset | 3-4 kind | 同上 + 各自卡片风险项 |
| **观察项（P3）** | tesseract-drift 原型（48×27 可辨性验证）、countdown（或 static 文字模板） | 原型 | 盲测 3/5 识别率门槛 |

流程合规提醒：本评审为只读产物；实施须先在 PRD-0002 追加 R-N（CLAUDE.md 强制约束 1/2），提交标题 `[PRD-0002] feat: <R-N> 三体主题灯效库批次N`。

---

## 6. 「不该做」清单

1. **宇宙闪烁（cosmic-flicker）**：全场同步明暗已被 R283 实锤"视觉平淡+metric 盲"（呼吸 m42 案例，R283-aesthetics.md:16,169）；高频闪烁另有光敏风险。→ 降级为其他效果的 flicker 参数。
2. **曲率航迹/死线**：单条持久亮线 = comet 窄化；comet 本身已被 R283 判"平淡"（2.5 分，:64），做它的变体没有意义。
3. **独立"乱纪元/恒纪元" kind**：慢速状态机是 R283"准静态 6 效果"同款病根；叙事价值并入 trisolaris-dawn 的 era 参数（§3.2）。
4. **写实轮廓类场景**（末日之战舰队阵型、星环城、太空电梯、蓝色空间号船体）：24×14=336 格原理性不可辨——icosahedral-virus 即因分辨率不可辨被 R285 删除（PRD:4198）。同理 tesseract-drift 必须先过 48×27 原型关。
5. **古筝行动**（纳米丝切船）：视觉=一条水平亮线扫过 = wave/lightning 的退化子集，无独立签名。
6. **整段文字叙事**（"不要回答"滚屏、面壁者宣言）：引擎 5×7 ASCII 字体在 24×14 仅容 ~4 字符（textRenderer.ts:8-9）；中文 canvas 遮罩仅 static kind 接线（previewEngine.ts:117）。倒计时若做，走 static 文字模板或限 4 字符的 countdown 小 kind（P3）。

---

## 7. 未核实项（本评审范围内未能闭环）

1. **tab 容量**：8 个 tab 在 `.effects-category-tabs` 的 CSS 宽度容限未读样式文件（Speculative——低风险，tab 是 flex 滚动/换行的常见实现，实施批次 1 时用 ui-snapshot 验证）。
2. **快照基线操作**：ui-snapshot `--update-baseline` 的具体命令与新增 kind 对基线的影响面未逐行核（流程存在于 R285/R287/R288 证据，PRD:4198,4204,4205）。
3. **headless-gl 对新增 GPU 2D shader 的测试覆盖**：tests/renderer/gl/ 下已有 3D 侧测试（audioDrive3d.test.ts），effectGl 新 shader 的编译级测试是否存在未核（批次 2 GPU 移植前需确认）。
4. **motion 帧差工具链**：R283 的 engine-motion-sweep.csv / R288 实拍脚本属 scripts/*.mjs（本评审禁跑 electron 类脚本），指标口径引用自 PRD 证据行，未亲跑复现。
5. **三体版权/命名**：kind id 与 label 使用"三体/Trisolaris"等词的商用合规问题超出代码评审范围，未核（提示：个人项目通常无碍，对外分发需注意）。

---

## 8. 被推翻的假设 / 已验证无问题

| # | 原假设 | 核验结果 | 证据 |
|---|---|---|---|
| 1 | 新 kind 忘加 effects.ts case 会渲染崩溃 | **推翻**：`case 'screen-ambient': default:` 兜底，渲染渐变回退动画不崩（但 visual-floor 覆盖测试会逼档位归属） | effects.ts:1667-1694；effects-visual-floor.test.ts:116-121（Confirmed） |
| 2 | GPU-direct 2D 效果的 LED 输出走 shader | **部分推翻**：GPU 2D shader 只喂预览/卡片/overlay 画布；物理 LED 帧仍由 CPU worker 的 renderEffectPixel 计算——新效果必须先有 CPU 实现 | effectGl.ts:32-46 头注；PreviewGrid.tsx:153；OverlayCanvas.tsx:158（Confirmed） |
| 3 | 新增 3D kind 需要改 Preview3D/OverlayCanvas 接线 | **推翻**：kind+params 经 EFFECT3D_CHANNEL 透传，复用固定 12 参数名即零接线；但 types.test.ts 硬编码 size=5 必改 | Preview3D.tsx:107-132；effect3dGl.ts:25；types.test.ts:72-73（Confirmed） |
| 4 | 需要给 PresetDefinition 加分组字段承载主题库 | **推翻**：分组唯一事实源是 EffectsView CATEGORIES；labelKey/descKey 由 defaultProfile 循环自动派生 | EffectsView.tsx:312-320；defaultProfile.ts:322-325（Confirmed） |
| 5 | i18n 键族下限会挡新增 kind | **无问题**：下限是 ≥48（防删除漂移），新增只增不减 | i18nKeyFamilies.test.ts:21（Confirmed） |
| 6 | 新 kind 会被搜索/精选/随机漏掉 | **无问题**：三者均数据驱动自动纳入（搜索全库扫 label/desc/kind；randomizer 动态取 effectPresets）——反而是"是否要排除出灵感池"的决策点 | EffectsView.tsx:410-417；randomizer.ts:34-35；curatedEffects.ts（Confirmed） |
| 7 | effects.test.ts 会自动覆盖新 kind 的 RGB 合法性 | **修正预期**：RGB 扫描是硬编码列表，不会自动覆盖——需手动追加（不追加不红，但丢失防线） | effects.test.ts:156-158（Confirmed） |
| 8 | 黑体类（黑洞/日食）刻意暗=可复制的暗色路线 | **修正**：R283-R284 已把"暗谷无地板"定为系统病并加了 8% 温和地板；三体暗色场景（黑暗森林/死线）必须带暗谷地板设计，否则重蹈覆辙 | PRD:4194-4198；R283-aesthetics.md:139（Confirmed） |

---

## 附：证据文件索引（绝对路径）

- 引擎：`C:\tjf\github\RGBBox\src\engine\effects.ts`（1694 行）、`src\engine\previewEngine.ts`、`src\engine\textRenderer.ts`
- 类型/预设：`src\shared\types.ts`、`src\shared\defaultProfile.ts`
- GPU：`src\renderer\src\gl\effectGl.ts`、`src\renderer\src\gl\effect3dGl.ts`、`src\renderer\src\gl\audioDrive3d.ts`
- UI：`src\renderer\src\components\EffectsView.tsx`、`Preview3D.tsx`、`PreviewGrid.tsx`、`OverlayCanvas.tsx`、`WorkspaceView.tsx`
- 域：`src\renderer\src\domain\{curatedEffects,randomizer,quickDimensions,primaryParams,paramMeta,ambientPresets}.ts`
- i18n：`src\renderer\src\i18n\index.tsx`（3772 行）
- 测试：`tests\effects.test.ts`、`tests\engine\effects-visual-floor.test.ts`、`tests\shared\types.test.ts`、`tests\renderer\i18nKeyFamilies.test.ts`
- 方法论先例：`docs\prd\PRD-0002-rgbbox-project-catalog.md`（R283-R288：4194-4205 行）、`docs\review\R283-aesthetics.md`
- 用户数据（只读）：`C:\Users\tjf\AppData\Roaming\rgbbox\captures\index.json`（12 条）
