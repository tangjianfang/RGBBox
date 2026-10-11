# R283 灯效代码层审计 — 「要有灵感、生动、触发心灵；太平淡；无法实现的考虑删除」

> 日期：2026-10-11 · 范围：`src/engine/effects.ts`（49 CPU case）+ `src/renderer/src/gl/effect3dGl.ts`（6 GPU shader）+ `src/renderer/src/gl/effectGl.ts`（28 GPU-direct 移植）+ 卡片预览三渲染路径
> 方法：只读源码逐 case 运动学标注 ＋ 引擎数学基线扫描（Node 直跑 renderEffectPixel，24×14 产品分辨率，preset 默认参数）＋ 真机干净重捕获（CDP，7 tab × 55 卡，3 帧差分）＋ 遗留 81 卡取证
> 数据资产：
> - `docs/ui-review/r-effect-audit/kind-map.csv` — **新** idx→kind 映射 + 真机卡指标（55 卡，0 未解析，tab 计数与 CATEGORIES 逐一相符）
> - `docs/ui-review/r-effect-audit/engine-motion-sweep.csv` — **新** 引擎数学基线（49 kind × 0.5/1/3/8s 差分 + lit + 量化色数）
> - `docs/ui-review/r-effect-audit/metrics-legacy81.csv` — 原 81 卡指标（**已证污染，仅存档**，勿再作结论依据；对应 PNG fx00-1…fx80-1 保留）
> - 复用脚本：`scripts/r283-kind-map-capture.mjs`（可重跑）

## 0. 结论速览

| 维度 | 数量 | 说明 |
|---|---|---|
| 真静态（引擎无 t，by design） | 4 | static / zone-gradient / custom-paint / image-paint（工具类，非缺陷） |
| 准静态（有 t 但默认参数下 1s 窗口动度 <2%） | 6 | black-hole、aurora、microvilli-field、magnetosphere-aurora、audio-beat(idle)、neon-galaxy(GPU3D) |
| 闪断式（有 t 但大部分时间黑/不可见） | 2 | lightning、audio-beat(idle 亮度低于可见阈值) |
| 慢速（3s 窗口才见明显变化） | 4 | crystal、orion-nebula、screen-ambient(fallback)、spiral-galaxy(边缘) |
| 雷同组 | 8 组 | 见 §3；最强重复 4 对（各含 1 删除候选） |
| 删除候选 | 4 | lightning、spectrum、orion-nebula、（ripple/neon-pulse 二选一） |
| 低成本救活（≤2 行） | 9 | 见 §5，含 2 个 P1 级表现缺陷 |
| 遗留 81 卡 m0 结论 | 不可信 | 多轮遍历 + RAF 冻结 + 预览 pill 遮挡（取证见 §6） |

## 1. 三条渲染路径（审计前置）

1. **CPU 引擎** `renderEffectPixel`（effects.ts）— 卡片预览（非 GPU-direct 卡）+ worker 预览 + LED 输出，卡片网格 48×27（EffectsView.tsx:90-91）。
2. **GPU-direct 2D** `EffectGl`（effectGl.ts，28 kind 的 GLSL 1:1 移植）— 卡片预览（EffectsView.tsx:226-266，每卡独享 WebGL context）。
3. **GPU 3D raymarch** `Effect3DGl`（effect3dGl.ts，6 kind）— 卡片 canvas 80×44（EffectsView.tsx:152-188）。

同一 kind 在 1 与 2 两处实现（公式一致，本次抽检 black-hole/aurora CPU 与 GL 行为一致）。

## 2. 运动学审计（数学静态清单）

基线 = engine-motion-sweep.csv（t=20 vs t+Δ，24×14，preset 默认）。`d1` = 1 秒窗口差分像素占比。

### 2.1 真静态 — 无时间项（高置信，代码可见无 `now`/`t`）

| kind | 位置 | 性质 |
|---|---|---|
| static | effects.ts:372-384 | 单色/点阵字，工具，保留 |
| zone-gradient | effects.ts:446-457 | 双色静态渐变，工具，保留（可考虑并入 rainbow 参数，低置信） |
| custom-paint | effects.ts:1811-1821 | 用户像素画，空数据=黑卡（工具） |
| image-paint | effects.ts:1825-1854 | 单图=静态；多图才有 crossfade（t 仅在此分支）。空数据=黑卡。注：defaults 里 `animateSpeed` 参数在 case 中**从未被读取**（死参数，defaultProfile.ts:113） |

### 2.2 准静态 — 有 t 但默认参数下 1s 窗口动度 <2%（高置信：引擎扫描 + 真机卡双重复现）

| kind | 位置 | d1（引擎） | 真机卡 motion | 根因 |
|---|---|---|---|---|
| **black-hole** | effects.ts:1341-1363（temperature :1357）；GL 版 effectGl.ts:830-861（:853） | **0%** | 0.66% | **数学饱和 bug**：静态径向项 `(0.88-r)*(1.6+density)` 在 r<0.43 处直接把 clamp 打满 1.0，盘内纯白、螺旋带 0.5 权重无残余动态空间；shader 隔离复现 1s 差分 0.19%。描述承诺的"开普勒旋转"实际不可见 |
| **aurora** | effects.ts:778-823（t 系数 :801-804）；speed 默认 0.14（defaultProfile.ts:82） | 0%（d3=4.8） | 1.71% | 时间相位系数过小（t*0.9×speed0.14≈0.126 rad/s），彩带漂移一个带宽需 ~7s、整体形态 ~50s 尺度；shader 隔离 1s 差分 0.23% |
| **audio-beat (idle)** | effects.ts:883-885 | 0%（lit=0!） | 0% | idle 楼层 `0.2+0.14*sin` 上限仅 0.34 亮度 → #ff2266 下最大亮度 ≈32/255，**低于 lit>60 可见线**；无音频时卡片近全黑 |
| **neon-galaxy** (GPU3D) | effect3dGl.ts:272-336（ca=t*0.3 :282；speed 默认 0.4，defaultProfile.ts:322） | —（GPU） | 0.23% | 相机轨道角速率 0.12 rad/s（52s/圈）、俯仰 sin(t*0.13)（~120s）；星点闪烁为孤立像素亚阈值变化 → 展示型 3D 实为静止画面 |
| **microvilli-field** | effects.ts:1646-1671（sway :1659）；speed 0.18（defaultProfile.ts:267） | 1.5% | 3.97% | sway 幅度 ±0.06（归一化局部坐标）且周期 ~8.7s，亚阈值；lit=8% 偏暗 |
| **magnetosphere-aurora** | effects.ts:1724-1743 | 0%（d05=32.1） | 4.8% | 场线/弓激波/极光卵**全部无 t**（结构性静态），仅 solarWind（:1738）以 ~1.04s 周期闪烁 → t 与 t+1s 图像混叠相同，观感=静止结构轻微抖动 |

### 2.3 闪断式 — 有 t 但时间平均近黑（高置信）

| kind | 位置 | 证据 | 根因 |
|---|---|---|---|
| **lightning** | effects.ts:736-776（cycle :742，flashOn :744） | 引擎 4 个采样窗全 0 差分、lit=0；真机卡 motion=0、lit=3.2% | 周期 3.85s 中仅 ~16% 时间发光（0.1+0.08 窗口+余辉），两帧全落黑区概率高；亮时也仅窄高斯束 |
| audio-equalizer(idle) | effects.ts:927-933 | d1=17.3 尚可 | 无问题（对照项） |

### 2.4 慢速（中置信，量级分析）

crystal（effects.ts:1073-1121；种子漂移 t*0.28×0.18 → ~125s 尺度，d1=8.9 但 d8=91 → 缓慢但确实在动）、orion-nebula（:1412-1428，speed 0.16，d1=11；星点 hash2(:1424) **无 t** 恒定）、screen-ambient fallback（:1858-1882，d1=0/d3=40，ambient 场景设计使然）、spiral-galaxy（d1=28.9 边缘可接受）。

### 2.5 与真机 motion<2% 名单对照（甄别真静态 vs 懒激活）

新捕获 motion<2% 共 9 卡：static、zone-gradient、custom-paint、image-paint（4 个 by-design）+ black-hole、aurora、neon-galaxy、lightning、audio-beat（5 个真问题，全部有 §2.2/2.3 代码级根因）。
**懒激活/冻结仅存在于遗留 81 卡数据**（neon-pulse 在遗留中 m=0 三处，但引擎 d1=78.6、新捕获 35.77% → 判定为捕获时 RAF 冻结，非引擎问题）。

## 3. 雷同度聚类（数学结构）

| 组 | 成员 | 结构 | 重复度 |
|---|---|---|---|
| G1 hue 平移场 | **rainbow**(:410) ≈ **spectrum**(:672) ≈ random-color(:967) ≈ glitch 底层(:1153) | 空间线性 hue + 时间旋转 | rainbow/spectrum **高**（仅方向与亮度补偿之差） |
| G2 径向环 | **ripple**(:618) ≈ **neon-pulse**(:1203) ≈ explode(:825) ≈ wave-diffraction(:1746) | `sin(r·freq − t·speed)` 环 + 高斯包络 | ripple/neon-pulse **高**（后者=前者+hue 旋转+pow 锐化） |
| G3 fbm 云 | **nebula**(:1226) ≈ **orion-nebula**(:1412) | 域扭曲 fbm 云 + 星点 + 核心 | **高**（orion 更慢更暗） |
| G4 高斯光斑科学组 | dna-helix / solar-system / icosahedral-virus / protein-folding / mitosis-spindle / synapse-pulse / comet-tail / pulsar-beacon / eclipse-alignment / magnetosphere-aurora | colorAdd 叠 hsl 高斯点/线段（effects.ts:117-123 通用件），黑底+青/品红/蓝 | idiom **同**、几何异；lit 全员 5-22% 造成整页"黑底光斑"观感 |
| G5 闪电 | **lightning**(:736) ≈ lightning-leader(:1475) | 频闪+分支辉光 | **高**（leader 为超集） |
| G6 螺旋族 | vortex(:1012) / hurricane-eye(:1454) / spiral-galaxy(:1392) / tokamak-plasma(:1790) | 角向×径向 sin 条纹旋转 | 中 |
| G7 单色全场脉冲 | breathing(:386) ≈ audio-beat idle(:883) | 全场亮度正弦 | 中 |
| G8 多 sin 干涉 | plasma(:989) / mirror-symmetry(:1286) | 3-4 个时空 sin 叠加 | 中 |

## 4. 平淡根因分类

| 根因 | 数量 | 代表 kind |
|---|---|---|
| A 静态无 t（by design 工具） | 4 | static、zone-gradient、custom-paint、image-paint |
| B 有 t 但数学上不可见（饱和/幅度/速度缺陷） | 6 | **black-hole（饱和 bug）**、aurora、neon-galaxy、microvilli-field、magnetosphere-aurora、audio-beat(idle) |
| C 闪断式近黑 | 1 | lightning |
| D 慢速（>3s 才见变化） | 3 | crystal、orion-nebula、screen-ambient(fallback) |
| E 色彩单一（量化色 ≤10） | 7 | fire(2 色!)、breathing(1)、audio-beat(3)、static(1)、zone-gradient(9)、comet(8)、matrix-rain(9) |
| F 过暗（lit<10%） | 10 | lightning(0)、audio-beat(0)、custom/image-paint(0)、explode(2.4)、synapse(4.8)、spiral-galaxy(5.1)、quantum(5.1)、fire(7.1)、dna(7.1)、microvilli(8) |
| G 结构雷同（§3） | 8 组 | G1-G8 |

（一个 kind 可属多类；B+F 是"打开效果库觉得平淡"的最大贡献者：黑、不动、或与邻卡雷同。）

## 5. 删除候选与救活清单

### 删除候选（代码层，均需 R-N 走 PRD 流程后执行）

| 候选 | 理由 | 置信度 |
|---|---|---|
| lightning | 被 lightning-leader 完全覆盖（G5 超集），且自身 lit=0/闪断 | 中高 |
| spectrum | 与 rainbow 结构重复（G1），差异可作 rainbow 预设参数 | 中 |
| orion-nebula | 与 nebula 重复（G3）且更慢更暗 | 中 |
| ripple 或 neon-pulse 二选一 | G2 高重复（保留带 hue 旋转的 neon-pulse 或参数最简的 ripple 均可） | 中 |

无"真静态且无独特性"的必删项 —— 4 个真静态均为工具类。

### 低成本救活（≤2 行改动，按收益排序）

| kind | 改法 | 位置 | 成本 |
|---|---|---|---|
| **black-hole** | 静态项封顶：`(0.88-radius)*(1.6+density)` → `Math.min(0.55, …)`，spiralBands 权重 0.5→0.85 | effects.ts:1357 + effectGl.ts:853（两处同步） | 2 行 |
| **audio-beat idle** | idle 楼层 `0.2+0.14*sin` → `0.35+0.3*sin` | effects.ts:884 | 1 行 |
| **lightning** | 非闪光窗加 2% 环境辉光 + cycle 闪光窗 0.1→0.16 | effects.ts:744-747 | 1-2 行 |
| **aurora** | preset speed 0.14→0.3（或 t 系数 ×2.5） | defaultProfile.ts:82 | 1 行 |
| **neon-galaxy** | preset speed 0.4→1.2（相机 52s/圈 → 17s/圈） | defaultProfile.ts:322 | 1 行 |
| **microvilli-field** | sway ±0.06→±0.12 + speed 0.18→0.32 | effects.ts:1659 + defaultProfile.ts:267 | 2 行 |
| **orion-nebula** | starSeed 加闪烁 `hash2(x*31+Math.floor(time*6), y*47)` + speed 0.16→0.28 | effects.ts:1424 + defaultProfile.ts:213 | 2 行 |
| **magnetosphere-aurora** | fieldLine 角向加慢旋转 `theta + time*0.25` | effects.ts:1735 | 1 行 |
| **explode** | 环亮度 ×1.6 或 edgeFade 斜率 0.8→0.55（lit 2.4% 过暗） | effects.ts:854 | 1 行 |

另（表现层，非引擎）：image-paint / custom-paint 空数据时卡片为黑卡（lit 6-7%）——卡片预览可放内置示例图案（EffectsView.tsx 卡片层，约 5 行）。

## 6. 被推翻的假设

1. **「遗留 81 卡可按 7 tab × 分类顺序建立 idx→kind 映射」— 推翻。** 取证：custom tab 卡在 fx12-13 与 fx31-32 两度出现；fx33 截到悬停预览 pill（"预览中：屏幕环境光"）；卡尺寸混杂 270/277×131/150/151 四种（布局回流）；curated strip 至少在 fx00-09 与 fx71-80 两轮入镜。故 metrics-legacy81.csv 重命名存档，映射以新 kind-map.csv 为准。
2. **「legacy m0 = 引擎真静态」— 部分推翻。** neon-pulse 遗留三处 m=0（fx08/fx27/fx41 canvas 像素级 100% 相同 = 冻结帧），但引擎 d1=78.6%、新捕获 35.77% —— 属捕获时 RAF/渲染冻结，非引擎问题。
3. **「black-hole 卡片冻结 = WebGL 上下文超额丢失（R41 隐患）」— 探针推翻。** 全新实例直达 science tab 仍 0.35%；app 内 shader 隔离复现 0.19% → 根因是公式饱和（上下文超额问题在 advanced+curated 同屏 19 个 context 时仍真实存在，但不是本案主因）。
4. **「pulsar-beacon 近静态」（首轮捕获 3.66%）— 推翻。** shader 隔离 1s 差分 32.7%；薄束+核心 pow(cos,12) 频闪导致采样方差，属测量伪影。
5. **「speed 默认普遍偏小」— 推翻。** 49 CPU kind 中 36 个 d1≥13%，运动充足；平淡集中在 §4 B/C/F 三类的 ~15 个 kind。

## 7. 建议的后续 R-N 切分（不在本次范围）

1. R-1（P1）：black-hole 饱和修复 + audio-beat idle 可见性（救活清单前两项）。
2. R-2：aurora/neon-galaxy/microvilli/orion/magnetosphere 速度与幅度批次调优（5 个默认值）。
3. R-3：删除候选 4 项走用户可见性验证（预览对照）后移除。
4. R-4（表现层）：image-paint/custom-paint 卡片示例图案；advanced+curated 同屏 WebGL context 数治理（R41 延伸）。
