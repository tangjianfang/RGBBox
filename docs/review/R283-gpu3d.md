# R283 — GPU 3D 灯效专项评审（6 shader 效果）

- 日期：2026-10-11　分支：main（7568aab）
- 主诉：「灯效要有灵感、生动、触发心灵；太平淡的考虑删除」
- 范围：`src/renderer/src/gl/effect3dGl.ts`（sphere-pulse / warp-portal / neon-galaxy / lava-sphere / laser-show / hologram）+ 预览链路（`Preview3D.tsx`、`EffectsView.tsx` GPU3D 分组）
- 与 3D 视图（LEDMapper / gaussian splats，`MODEL3D_VIEW_ENABLED`）无关，未混淆。

## 0. 证据与局限（先声明）

| 证据 | 状态 |
|---|---|
| `docs/ui-review/r-effect-audit/fx48-0.png` = 球体脉动（单卡直拍，已 VLM 复核） | ✅ 高置信 |
| `docs/ui-review/r-effect-audit/fx56-0.png` = 熔岩球 | ✅ 高置信 |
| `docs/ui-review/r-effect-audit/fx79-0.png` = 全息球 | ✅ 高置信 |
| `docs/ui-review/f4-themes/dark-effects.png` | 仅确认 GPU3D tab 存在（计数 6），tab 未激活，无卡面证据 |
| warp-portal / neon-galaxy / laser-show 实拍帧 | ❌ 该批捕获（81 卡，含大量静态占位/重复帧，fx05=fx24 等指标全同可证）中未找到有效渲染帧；五维分仅按代码推演，标低置信 |

量化基线（`docs/ui-review/r-effect-audit/metrics.csv`，旧版脚本产物）：fx48 motion 42.06%（81 卡最高档）/lit 28.8%/sat 65.6%；fx56 motion 36.9%/lit 28.4%/H 4.04；fx79 motion **8.65%**/lit **13.5%**（双低）。

## 1. 逐 shader 代码分析

共性：全为 WebGL1 全屏片段 shader；时间驱动（u_time×speed），**无音频 uniform**（`Preview3D.tsx:96-114` 只传 layer 参数）；COMMON 注入 hash/noise/fbm/hsl（`effect3dGl.ts:45-92`）。**5/6 个 shader 只消费 u_params.x/y（speed/hueShift）**，intensity/density/u_detail/u_extra 全部忽略——只有 hologram 用满 11 个参数（对照 `defaultProfile.ts:310/316/322/328/334` 默认也只带 speed/hueShift，故无死滑条，但可调性天花板低）。

### 1.1 sphere-pulse 球体脉动（:101-164）
- 视觉构成：环绕相机（XZ 轨道+Y 起伏 :111）→ FBM 表面位移球体（:127，80 步 raymarch）+ 半径双频脉动（:118）+ 经度色相漂移（:139，t×55°）+ 补色 rim 光（:147）+ 镜面高光（:151）+ 体积光晕（:156）+ FBM 星云背景（:159）。
- 生动度要素：相机运动 ✓/形变 ✓/色彩循环 ✓/多层后处理 ✓——六者中要素最均衡。默认 speed 0.5。
- 实拍五维（高置信）：动 4 / 色 5 / 深 4 / 情 4 / 生 4。

### 1.2 warp-portal 曲速门户（:181-264）
- 视觉构成：极坐标 5 重域扭曲同心环（:203-235，手工展开防 WebGL1 嵌套循环）+ 28 步透视隧道（:238-249）+ 螺旋卷须（:252）+ 白热核心闪（:257）+ 大气辉光（:261）；色相漂移 t×85° 极快。
- 生动度：满屏、高亮、高速色彩循环；代码层面六者最华丽。默认 speed 0.6（最高）。**但无实拍帧佐证**（低置信）。
- 代码推演五维：动 5 / 色 5 / 深 4 / 情 4 / 生 5。

### 1.3 neon-galaxy 霓虹星系（:272-336）
- 视觉构成：俯仰摆动轨道相机（:283-288，elev 0.55±0.25）+ 60 步体积积分双旋臂盘（:293-304）+ 核球（:307）+ 24 颗 3D 点星随盘旋转（:312-333）。默认 speed 0.4。
- 风险：与 CPU `spiral-galaxy`（螺旋星系，对数螺旋+核球+星场，`EffectsView.tsx:313` 同仓科学 tab）题材正面撞车；CPU 版实拍（fx74）五维 动3/色3/深4/情4/生4，两者辨识度差异主要剩「透视+体积云」。
- 代码推演五维（低置信）：动 3 / 色 4 / 深 5 / 情 4 / 生 3。

### 1.4 lava-sphere 熔岩球（:345-411）
- 视觉构成：固定相机微摆（:355）+ 三轴域扭曲 FBM 熔岩表面（:369-374，72 步）+ 温度→色相映射（:389-393，红→橙黄）+ rim 热辐射（:398）+ 次表面透光（:403）+ 热雾背景（:406）。
- 生动度：情绪最強（唯一暖色主题、独占「熔岩灯」心智）；但默认 speed **0.3** 为六者最低，表面流速 t×0.45×0.3≈0.135/s——实际观感偏慢（实拍 motion 36.9% 主要来自整体噪声翻涌，靠相机不动吃老本）。
- 实拍五维（高置信）：动 3 / 色 3 / 深 4 / 情 4 / 生 4。

### 1.5 laser-show 激光秀（:419-484）
- 视觉构成：底部舞台原点（:429）+ 5 束独立正弦扫摆光束——**纯角度域高斯条**（:445-477，无 raymarch、无深度循环、无 3D 几何）+ FBM 体积雾（:437）+ 地板辉光（:480）。
- 关键判定：六者中唯一「伪 3D」——就是 2D 极坐标数学，CPU 网格引擎完全可以等价实现（线束+雾化）。无实拍帧（低置信）。
- 代码推演五维：动 3 / 色 4 / 深 2 / 情 3 / 生 3。

### 1.6 hologram 全息球（:492-589）
- 视觉构成：行错位 glitch（:511）+ UV 旋转自旋（:516）+ 解析球交的前/后双表面穿透渲染（:533-566）+ 扫描环（:549）+ 数据带（:550）+ 边缘数据流粒子（:574-578）+ 全屏扫描线（:580）+ 信号丢失（:583）。参数最富（11 个，`defaultProfile.ts:340-353`）。
- **机制与观感倒挂**：机制六者最丰富，实拍却双垫底（motion 8.65% / lit 13.5%）——青色单色系+慢速自旋（t×0.24）+ 低亮度材质，在 80×44 缩略图里几乎不可读。
- 实拍五维（高置信）：动 2 / 色 2 / 深 3 / 情 3 / 生 2。

## 2. 链路层发现（影响全部 6 卡）

1. **缩略图先天贫弱**：`EffectCard3D` canvas 固定 80×44（`EffectsView.tsx:164-165`），raymarch 细节/rim/高光在此分辨率下全糊；且卡片只传 speed/hueShift（:171-176），detail/extra 走默认——效果库里的「第一印象」远弱于真机预览。【高置信】
2. **无音频联动**：3D shader 无 audio uniform，CPU 侧 audio-beat/equalizer 有而 3D 无——灯效「触发心灵」的最大杠杆（随乐而动）在 3D 组缺失。【高置信，增强方向】
3. **可调性差距**：hologram 11 参数 vs 其余 5 个仅 2 参数；warp/lava/neon 的 intensity/density 在 shader 内已声明（COMMON u_params.z/w）却未消费。【高置信】

## 3. 判定表

| 效果 | 五维（动/色/深/情/生） | 证据 | 判定 | 增强/处置方向 |
|---|---|---|---|---|
| sphere-pulse | 4/5/4/4/4 | 实拍 | **保留**（旗舰） | 接通 intensity→位移幅度、density→噪声频率；缩略图升分辨率 |
| warp-portal | 5/5/4/4/5 | 代码推演 | **保留+增强** | 先真机补拍验证；环半径呼吸化；接音频 beat 驱动核心闪 |
| lava-sphere | 3/3/4/4/4 | 实拍 | **保留+增强** | 默认 speed 0.3→0.45；裂缝亮度温度脉冲；飞溅火星粒子 |
| neon-galaxy | 3/4/5/4/3 | 代码推演 | **增强或降级候选** | 与 CPU spiral-galaxy 撞型；差异化=强透视俯冲镜头+旋臂密度波星光爆发，做不到就删（二选一，勿双保留同观感） |
| laser-show | 3/4/2/3/3 | 代码推演 | **删除候选**（首选） | 唯一伪 3D（纯 2D 角度高斯，无 raymarch/深度），CPU 可等价替代；3D 组价值最低 |
| hologram | 2/2/3/3/2 | 实拍 | **增强**（不建议直接删） | 默认 intensity 0.95→~1.3 等价提亮、glitch 0.18→0.35、scanSpeed 1.25→1.8；已被 `randomizer.ts:8` 默认收藏与 `quickDimensions.ts:15` 快捷维度引用，删除牵连大，先救后删 |

## 4. 与 49 个 CPU 效果的差异化结论

- **3D 独有、不可替代**：sphere-pulse / lava-sphere（真 raymarch 表面+光照+次表面）、warp-portal（深度隧道）、neon-galaxy（体积积分+透视盘）——CPU per-pixel 2D 引擎做不到环绕相机与体积光，这是 GPU3D 组的存在理由。
- **可被 CPU 替代**：laser-show（2D 数学伪装）；hologram 半独有（线框球穿透是 3D 的，但 glitch/扫描线主题与 CPU matrix-rain/glitch 重叠）。
- 建议顺序：删 laser-show → 救 hologram（提亮提速）→ neon-galaxy 与 spiral-galaxy 二选一差异化 → 其余三个保留并接音频/参数。

## 5. 附：本评审未做

- 未跑真机补拍 warp-portal/neon-galaxy/laser-show（需 R-N 授权 build+capture）；上述三者的五维分为代码推演，采纳前建议以 `scripts/r-effect-audit-capture.mjs` v3 重跑一遍 GPU3D tab 单页取证。
