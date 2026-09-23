# 灯效「点击无反应」全量根因 Review + 55 效果审美打分 + 精简方案

**日期**:2026-09-24　**输入**:用户报障「点击和选中一些灯效没有任何反应(屏幕采样/火焰/太阳系轨道等,还有很多)」+ 指令「全量 review 找根因;灯效太多,按大众审美 100 分制逐一打分,给精简/删除建议」
**性质**:只读 review,`src/` 0 diff(临时测量脚本跑完已删)　**修复**:待用户 review 本文档后另立 R-N 实施
**证据**:`effects.ts`(1705 行)全文通读、App/WorkspaceView/useEngineLoop/useLayerActions/useProfileManager/EffectsView 选择链路通读、vitest 客观测量(默认 24×14 网格 × 16 个虚拟时间采样点,见 §2.5)

---

## 1. 结论速览(TL;DR)

1. **「点了没反应」的第一根因不是效果本身,是选择状态损坏**:选中图层 ID(localStorage 持久化)指向一个**不存在的图层**时,UI 读侧静默回退到第一个启用图层(界面看起来一切正常),**写侧却把每次点击写进幽灵图层 = 全部静默 no-op**。三条入口都会造成:首次安装默认值 `layer-rainbow` 就不存在;删除图层不转移选中;加载/导入 layer ID 不同的 profile 不重设选中。
2. **GPU 3D 效果有结构性双缺陷**:放在第一个启用图层时 worker 停转、画布被 Preview3D 独占(此时对其他图层点任何 CPU 效果无反应);放在其他图层时 CPU switch 落到 default 分支,**渲染的是 screen-ambient 兜底动画而非所选效果**。
3. **内容依赖型效果默认全黑**:audio-beat / audio-equalizer 在音频开关关闭(**默认关闭**)时 0% 亮;custom-paint / image-paint 无内容时 0% 黑。
4. **「科学可视化」19 效果客观上接近黑屏**:默认 24×14 网格实测平均亮度 0.02–0.11(满分 1.0)、非黑覆盖率 6–45%——「太阳系轨道没反应」在像素层面是事实(9.6% 覆盖、平均亮度 0.023)。
5. 55 效果打分与精简:建议**删 10、并 3,55 → 42**(§4),修复轮需附「已删 kind → 宿主预设」的旧 profile 迁移映射。

---

## 2. 问题 A:点击/选中灯效无反应——根因链

用户点的是**工作区快捷 chips**(QUICK_EFFECT_KINDS 14 枚)——举例的屏幕采样(`screen-ambient`)、火焰(`fire`)、太阳系轨道(`solar-system`)全部在这排 chips 里,标签与 i18n ZH 词典逐字吻合。chips 点击链路:

```
chip onClick → selectEffect(kind) → updateSelectedLayer(patch) → updateLayer(profile, selectedLayerId, patch)
                                                      ↑ 读显示:find(id) ?? activeLayer(profile)
                                                      ↑ 写更新:find(id) 匹配不到 → 原样返回,无任何报错
```

### RC-1(P0)幽灵选中图层:读有兜底、写没兜底

| 位置 | 代码 | 行为 |
|---|---|---|
| `App.tsx:156-159` | `selectedLayer = scene.layers.find(id === selectedLayerId) ?? activeLayer(profile)` | **读**:ID 失效 → 静默显示第一个启用图层,图层列表/chips 高亮一切正常 |
| `App.tsx:161-163` | `updateLayer(cur, selectedLayerId, patch)` | **写**:ID 失效 → `layers.map` 无匹配 → profile 原样返回,**无报错、无 toast、无高亮变化、无画布变化** |
| `useEngineLoop.ts` | 收到的 profile 未变 | 引擎继续渲染旧效果 |

**ID 失效的三条入口(全部实锤)**:

| # | 入口 | 证据 |
|---|---|---|
| 1 | **首次安装/清空 localStorage**:默认值 `'layer-rainbow'`,而当前默认 profile 的 5 层 ID 是 `layer-aurora-veil`/`layer-ember-bed`/`layer-neon-core`/`layer-starlight-glint`/`layer-nebula-depth`——`layer-rainbow` 是历史遗留,**从一开始就不存在**;boot 流程(App.tsx:334-373)不做对账 | `App.tsx:96` + `defaultProfile.ts` |
| 2 | **删除选中图层**:`deleteLayer` 只滤掉图层,不转移选中;删完所选层后 selectedLayerId 即成幽灵,且**持久化跨重启** | `useLayerActions.ts:106-115` |
| 3 | **加载/导入 layer ID 不同的 profile**:`loadProfileById` / `handleProfileDelete` / `handleProfileImport` / 分身复制后 `setProfile`,全程不重设 `selectedLayerId`(仅图层包导入 `useProfileManager.ts:187` 一处会重设) | `useProfileManager.ts:87-125` |

**影响面(幽灵态下全部静默失效)**:14 枚快捷 chips、效果库全部 55 卡(应用后虽跳回工作区+toast,但 profile 没变)、6 张场景卡(`applyAmbientPreset` 同走 `updateSelectedLayer`)、四维语义微调、全部参数滑杆、🎲 随机、随机器、计划任务(selectEffect 消费方)、Alt+数字收藏快捷键。**唯一恢复方式**:点一下图层列表任意一行(`WorkspaceView.tsx:441` 写入真实 ID)或新增图层——用户无从得知。

**复现/自检**:DevTools 控制台执行 `localStorage['rgbbox:selectedLayerId']`,与图层列表里任一层的内部 ID 对照;或全新 userData 目录启动后直接点 chips。

### RC-2(P1)GPU 3D 效果的双缺陷(solo 架构的代价)

```ts
// useEngineLoop.ts:187 — worker 循环的门
if (is3DEffect(activeLayer(cfg.profile).kind)) return   // activeLayer = 第一个启用层,不是选中层
// WorkspaceView.tsx:891 — 画布渲染器选择
const eff = previewLayer ?? activeLayer(profile); return is3DEffect(eff.kind) ? <Preview3D …/> : <PreviewGrid …/>
```

| # | 场景 | 后果 |
|---|---|---|
| a | 第一个启用层是 3D 效果(如用户把第 1 层改成 hologram),随后**选中其他图层**点任何 CPU 效果 | worker 每 tick 直接 return(停转),画布被 Preview3D(layer-1 独占渲染)霸占——**对其他图层的全部选择无反应**;仅改第 1 层可见 |
| b | 3D 效果放在**非第一个**启用层 | worker 继续跑,但 `renderEffectPixel` 的 switch **没有 6 个 3D kind 的 case**,落到 `default:` = screen-ambient 兜底动画——用户选了「全息术/镭射秀」,看到的却是generic 彩虹波纹 |

根子:GPU 3D 是「单效果独占画布」架构,没有「3D + CPU 多层合成」路径(R67 是同一矛盾的全屏投影面)。效果库卡片(`EffectCard3D`)预览正常,进了工作区多层场景就露馅。

### RC-3(P1)内容依赖型效果:默认状态=全黑

| 效果 | 默认状态实测 | 原因 |
|---|---|---|
| audio-beat / audio-equalizer | **0% 亮,纯黑** | 音频开关默认关闭(`App.tsx:122` `usePersistedFlag('rgbbox:audio', false)`);无 `_audioBass` 等输入时亮度恒 0(`effects.ts:672-755`),且**无「需要开启音频」的任何提示** |
| custom-paint / image-paint | **0% 亮,纯黑** | `pixelData`/`imageDataList` 默认空串,直接返回黑(`effects.ts:1614-1653`);效果库卡片里也是黑卡 |
| screen-ambient | 看场景 | 捕获仅在「**无 overlay 打开** 且场景存在启用的 screen-ambient 层」时发生(`useEngineLoop.ts:91-93`)——开着浮窗(本应用的主用法!)时永远渲染兜底动画不镜像屏幕;捕获链本身是 desktopCapturer 兜底(DXGI/SCK 为 stub,RSK-2);暗色屏幕内容 → 暗色灯效 |

### RC-4(P2)感知层:「其实在渲染,但看不出来」

1. **科学系列客观近黑**(详见 §3 测量列):19 效果平均亮度 0.013–0.113。典型:solar-system 覆盖 9.6%(太阳 ≈2 格 + 8 行星各 ≈1 格 + α≈0.08 的轨道线),comet-tail 6.0%,protein-folding 12.7%——在 LED 珠上就是「几乎全黑偶尔闪一下」。
2. **多层合成稀释**:默认 profile 5 层加法合成;若用户改的是 opacity 0.26(Nebula Depth)/0.34(Neon Core)的层,画布主体仍被 aurora(0.9)+fire(0.56)占据——换了效果但构图不变,读作「没反应」。
3. **EMA 平滑**:`usePerformanceGuard` 默认开,smoothing 0.35 → 瞬态效果(lightning 6.1% 亮本就稀疏,再被前一帧平均 35%)进一步变暗。
4. **重复选择**:默认第二层就是 fire——选中它再点「火焰」= 0 变化(参数被相同 defaults 覆盖);用户无从区分「点了没反应」和「本来就是」。

### 独立 bug 附带发现

| # | 位置 | 问题 |
|---|---|---|
| B-1 | `effects.ts:409-413` starlight | `twinkle = 0.5 + (primary + scintillation) × 0.5` 可为**负**(scintillation 振幅 0.15),`Math.pow(负数, 2.8)` → NaN → 颜色通道 NaN(渲染进程被 Uint8ClampedArray 钳到 0 才没炸)。应 `clampUnit` 后再 pow |
| B-2 | `selectEffect`(`App.tsx:174-179`) | 换效果时 `parameters` 被 preset defaults 整体替换,图层原有 `_maskZone`/`_quickProfile`/`_quickMotion` 等下划线键**静默丢失**(分区/场景卡激活态/四维高亮全部重置)——另一个「调好的东西突然没了」的来源 |

### 修复方向(待批准后另立 R-N,本文档不动手)

| 优先级 | 修复 | 触及 |
|---|---|---|
| P0 | selectedLayerId 对账:boot/profile 加载/图层删除三处收敛到「ID 失效 → 回落到 `activeLayer()` 的真实 ID 并写回」;`updateLayer` 对匹配不到 ID 时告警回落 | App/useProfileManager/useLayerActions |
| P1 | 3D 门禁与画布分支统一改用**选中层**语义 + 非 solo 场景下 3D 层的明确降级策略(禁选提示或合成路径立项) | useEngineLoop/WorkspaceView |
| P1 | 内容依赖效果零状态提示:audio-* 在音频关时画布叠加「开启音频以预览」角标;custom/image-paint 同理 | PreviewGrid/WorkspaceView |
| P2 | screen-ambient 在 overlay 打开时的行为文案化(当前静默 fallback) | i18n + EffectsView 描述 |
| P3 | B-1 NaN 修复;B-2 下划线键保留策略 | effects.ts/selectEffect |

---

## 3. 问题 B:55 效果全量打分(大众审美 · 100 分制)

**打分口径**(面向大众用户在 LED 网格/浮窗上的观感,非工程实现质量):视觉冲击与完整度 30% · 色彩 20% · 动感 20% · 构图可读性 20% · 独特性 10%。客观列来自 §2.5 测量(avgLum=平均亮度 0-1,lit%=非黑覆盖,motion=帧间变化量,hue=色相桶数);GPU 3D 六种无法无头测量,按 shader 通读 + 效果库实拍评分。

### S 档(85+):招牌,一个都不要动

| 效果 | 分 | avgLum/lit%/motion | 一句话 |
|---|---|---|---|
| fire 火焰 | 88 | 0.195/34.1/0.041 | 全库最佳实现:阵风事件+列包络+4 段色 ramp,条形 LED 上以一敌百 |
| aurora 极光 | 86 | 0.129/50.2/0.003 | 多层 ribbon+深度+顶缘辉光,默认场景的台柱;偏暗但克制即气质 |
| rainbow 彩虹 | 84 | 0.520/100/0.098 | 感知均匀亮度补偿,永远成立的大众款 |
| breathing 呼吸 | 82 | 0.256/100/0.106 | Apple 式 quintic 呼吸+色温漂移,优雅 |
| nebula 星云 | 83 | 0.343/98.8/0.079 | 域扭曲 FBM+星点+核心辉光,高级感 |

### A 档(70-84):放心保留的中坚

| 效果 | 分 | avgLum/lit%/motion | 一句话 |
|---|---|---|---|
| plasma 等离子 | 79 | 0.485/100/0.056 | demoscene 经典,全彩全覆盖永不出错 |
| spectrum 光谱 | 78 | 0.453/100/0.146 | 全色域对角洗涤,稳 |
| tunnel 隧道 | 77 | 0.447/99.2/0.103 | 1/r 深度+条纹冲刺,动感强 |
| warp-portal 虫洞传送门 | 78 | (GPU) | 屏幕空间能量门,域扭曲同心环 |
| sphere-pulse 脉冲星球 | 76 | (GPU) | raymarch FBM 球体+环绕相机 |
| neon-galaxy 霓虹星系 | 75 | (GPU) | 3D 星盘透视+体积旋臂 |
| wave 波浪 | 80 | 0.296/80.1/0.302 | 高斯包络+白心 bloom,动感全库第一梯队 |
| lava-sphere 熔岩星球 | 74 | (GPU) | 三轴域扭曲 FBM 地壳+次表面辉光 |
| neon-pulse 霓虹脉冲 | 73 | 0.197/61.4/0.150 | 同心环+莫尔干涉,动感好 |
| vortex 涡旋 | 72 | 0.207/97.0/0.077 | 双向旋转螺旋臂+深度衰减 |
| laser-show 镭射秀 | 72 | (GPU) | 五束扫摆+体积雾,现场感 |
| crystal 晶格 | 71 | 0.304/99.9/0.009 | Voronoi 晶面+边缘高光,优雅低速 |
| glitch 故障 | 71 | 0.317/92.0/0.168 | 数字故障美学,动感全库最高,受众分化 |
| hologram 全息术 | 70 | (GPU) | 线框球+扫描包+信号闪烁,参数最多 |
| comet 彗星 | 70 | 0.027/11.6/0.053 | 双彗星 HDR bloom 优雅,但覆盖太稀 |
| ripple 涟漪 | 74 | 0.154/87.7/0.088 | 多环干涉+点击爆发交互,加分 |

### B 档(55-69):保留,但多数需要一轮调优

| 效果 | 分 | avgLum/lit%/motion | 一句话 |
|---|---|---|---|
| screen-ambient 屏幕采样 | 68 | 0.421/100/0.006 | 氛围灯核心概念;捕获被 overlay 门禁+暗屏=暗灯+多层稀释,体感打折 |
| matrix-rain 矩阵雨 | 69 | 0.035/11.6/0.043 | 3×5 数字字形巧思;太稀,需增亮 |
| starlight 星光 | 66 | (NaN bug)/17.2/— | 概念好,密度低+NaN bug 待修 |
| explode 爆发 | 64 | 0.040/36.0/0.079 | 8 向旋转爆发环,构图单一 |
| black-hole 黑洞吸积 | 64 | 0.113/27.4/0.008 | 概念最酷的科学款,太暗太慢,增亮后可上一档 |
| audio-equalizer 均衡器 | 63 | 0/7.1(无音频) | 32 带 FFT 实现认真;无音频=黑屏,需提示 |
| zone-gradient 渐变 | 62 | 0.803/100/0 | 实用打底,静态 |
| dna-helix DNA 双螺旋 | 61 | 0.023/14.5/0.039 | 轮廓可读的科学款;过细过暗 |
| static 纯色/文字 | 55 | 0.716/100/0 | 基础设施型;文字能力有价值 |
| audio-beat 律动 | 60 | 0/0(无音频) | 无音频纯黑,同均衡器 |
| spiral-galaxy 旋星系 | 55 | 0.042/43.3/0.017 | 旋臂+尘埃带好看,亮度不及格 |
| random-color 随机色 | 58 | 0.484/100/0.045 | 热闹但杂乱,缺统一构图 |
| hurricane-eye 风眼 | 54 | 0.073/28.0/0.034 | 卫星云图轮廓可读,偏暗 |
| vortex-flame 火龙卷 | 57 | 0.106/29.1/0.080 | 与 fire 高度同质 → 建议并入 fire |
| image-paint 图片效果 | 52 | 0/0(无内容) | 工具型;无内容黑卡 |
| orion-nebula 猎户星云 | 52 | 0.110/84.4/0.004 | 与 nebula 同质 → 建议并入 nebula |
| custom-paint 自定义涂鸦 | 50 | 0/0(无内容) | 工具型;无内容黑卡 |

### C 档(45-54):可救但不值得救的大众价值

| 效果 | 分 | avgLum/lit% | 一句话 |
|---|---|---|---|
| eclipse-alignment 日食 | 49 | 0.095/25.7 | 钻石环一瞬戏剧性强,其余时间暗场 |
| pulsar-beacon 脉冲星 | 48 | 0.043/26.0 | 灯塔扫掠节奏可以,构图空 |
| quantum-collapse 量子坍缩 | 47 | 0.044/30.8 | 干涉条纹美但抽象,大众无感 |
| lightning-leader 闪电先导 | 45 | 0.037/30.7 | 与 lightning 同质 → 并入 |
| magnetosphere-aurora 磁层极光 | 44 | 0.051/30.9 | 与 aurora 同质 → 并入 |
| tokamak-plasma 托卡马克 | 43 | 0.034/28.4 | 环形辉光,抽象 → 并入 vortex 预设 |
| wave-diffraction 双缝干涉 | 41 | 0.039/25.9 | 物理课动图,LED 上不可读 |

### D 档(<40):建议删除——概念在 LED 网格上不可读

| 效果 | 分 | avgLum/lit% | 一句话 |
|---|---|---|---|
| microvilli-field 微绒毛 | 28 | 0.036/31.2 | 大众不知道这是什么,也看不见 |
| comet-tail 彗尾 | 33 | 0.013/6.0 | 全库最低亮度之一 |
| protein-folding 蛋白质折叠 | 30 | 0.016/12.7 | 概念完全不可读 |
| solar-system 太阳系轨道 | 34 | 0.023/9.6 | 97% 黑 + 1 格行星;用户报障的直接实证 |
| mitosis-spindle 有丝分裂 | 36 | 0.041/24.7 | 纺锤丝细线在网格上糊成一团 |
| synapse-pulse 突触脉冲 | 37 | 0.019/12.7 | 微观概念+近黑 |
| icosahedral-virus 病毒衣壳 | 38 | 0.031/19.5 | 12 顶点 30 边的真 3D 投影实现认真,但大众看不懂也看不见 |

### 打分校准说明

- 打分是「大众审美」口径:**hologram(70)/laser-show(72)在应用内全屏非常好看**,但在「LED 灯效」的本体语境里离题(GPU 全屏场景≠灯珠光效)且有 §2-RC-2 的多层缺陷,故未上 80。
- lightning(62)实现有质感(flash+回击+余辉),但 6.1% 覆盖 × EMA 削峰在灯珠上几乎必然「没反应」——它是 A 档实现、C 档体验的典型,按体验计。
- 客观测量在 24×14(默认)网格;48×27(效果库卡片)下 lit% 会系统性偏高,但工作区/浮窗用户看到的是前者。

---

## 4. 问题 C:精简方案(55 → 42,待拍板)

### 4.1 为什么可以精简

| # | 事实 | 证据 |
|---|---|---|
| 1 | 科学 20 款平均亮度 0.013-0.113,其中 10 款 lit%<31%——不是「小众品味」,是**在交付介质上不可读** | §3 测量 |
| 2 | 同质组:闪电×2(lightning/lightning-leader)、火焰×2(fire/vortex-flame)、星云×3(nebula/orion-nebula/spiral-galaxy 近亲)、极光×2(aurora/magnetosphere-aurora)、等离子×3(plasma/tokamak/quantum 近亲) | §3 打分 |
| 3 | R160 曾定「不删任何效果(玩家受众资产)」边界——但那是**信息架构轮**的边界;本轮是**内容质量轮**,近黑效果对玩家同样无价值,提请重新拍板 | PRD R160.5 |

### 4.2 三档处置

**删除 10 款**(D 档 + C 档同质款):`solar-system` `comet-tail` `protein-folding` `microvilli-field` `synapse-pulse` `icosahedral-virus` `mitosis-spindle` `wave-diffraction` `lightning-leader`(并入 lightning) `magnetosphere-aurora`(并入 aurora)

**合并 3 款**(宿主加预设/参数,不丢能力):`vortex-flame` → fire 新增「火龙卷」预设 · `orion-nebula` → nebula 新增「猎户」预设 · `tokamak-plasma` → vortex 新增「环形」预设

**增亮保留 7 款**(科学幸存者,统一 +亮度/覆盖率调参轮,目标 lit%≥60%):`black-hole` `spiral-galaxy` `dna-helix` `hurricane-eye` `pulsar-beacon` `quantum-collapse` `eclipse-alignment`

**原样保留 25 款**:S/A 档 20 + `static` `zone-gradient` `random-color` `image-paint` `custom-paint`(工具型保留)+ audio×2(配零状态提示)

**结果:55 → 42**(删 10 + 并 3)。如需更激进(第二轮备选):再删 `eclipse-alignment` `quantum-collapse` `pulsar-beacon` `random-color`,并把 `static` 并入 `zone-gradient` → 37。

### 4.3 实施约束(修复轮必须带上)

1. **旧 profile 兼容**:已删 kind 的图层加载后走 `renderEffectPixel` default 分支(= screen-ambient 兜底)——语义错误但不会崩;必须做「已删 kind → 宿主预设」加载期迁移映射,而非靠 default 兜底。
2. 联动面:`effectPresets` / CATEGORIES / `primaryParams` / `presetI18n` 键 / `effects.ts` switch / 效果库统计 / `ui:snapshot` 基线重拍 / E2E 断言数。
3. 精简与 R164 漏斗正交:curated 规则是数据驱动的(`curatedEffects.ts`),删除后自动收敛,无手工清单要改。

---

## 5. 待确认项

- [ ] RC-1 用户机复现确认:提供 `localStorage['rgbbox:selectedLayerId']` 值即可一锤定音(或直接按 P0 修,三种入口都堵死)
- [ ] screen-ambient 在「开浮窗」时的期望行为:保持静默 fallback,还是允许捕获(有屏摄反馈环风险,需产品决策)
- [ ] 精简档位拍板:42(建议)还是 37(激进),以及删除名单是否有要捞回的
- [ ] GPU 3D 多层合成是否立项(当前 solo 架构是 RC-2 的根,彻底解法要么合成路径要么明确禁选)
- [ ] audio-* / custom/image-paint 零状态提示的交互形态(画布角标 vs 卡片角标 vs toast)

---

## 6. 实施记录(R166 修复 + R167 视觉优化轮,2026-09-24)

**用户裁决**:不做删除——55 种灯效设计全保留;低分归因修正为「交付层欠调」(公式以 48×27 效果卡为调参基准,落到 24×14 工作区/浮窗后特征小于 1-2 格 + 终值乘子压碎亮度)。§4 精简方案作废。修复与优化分立 **R166 / R167** 实施。

### 6.1 R166 修复(幽灵选中 + NaN)

- `domain/profileUtils.ts` 新增纯函数 `reconcileSelectedLayerId(scene, id)`(失效→回落首个启用层,有效→null);App 加单个对账 effect,单点堵死三条入口(首装 `'layer-rainbow'` / 删层 / 换 profile)。
- starlight `twinkle` 先 `clampUnit` 再 `Math.pow`,NaN 清零(全效果 16 采样 × 336 像素扫描 nan=0)。
- 回归测试 4 例进 `tests/renderer/domain/profileUtils.test.ts`。
- **范围外遗留**:RC-2(GPU 3D solo 双缺陷)、RC-3 提示形态、B-2(`_maskZone` 保留)待另立条款。

### 6.2 R167 视觉优化(49 CPU 全保留,27 款交付层调参 + 3 默认值微调)

手法:放宽特征 σ(点/线宽 1.5-2.5×)、抬终值乘子与 lightness、降高阶 pow、稀疏款加底光/halo、音频款加 idle 动画。**设计语义零改动**(色相板/概念/运动模式不动);S/A 档招牌(fire/aurora/rainbow/breathing/plasma/tunnel/crystal/glitch/spectrum/wave/ripple 等 16 款)未触碰防回归。

**24×14 / preset defaults / 16 采样点客观前后对照**(avgLum 0-1 | lit%=非黑覆盖):

| 效果 | 前 | 后 | 效果 | 前 | 后 |
|---|---|---|---|---|---|
| solar-system | .023 / 9.6% | **.103 / 55.7%** | eclipse-alignment | .095 / 25.7% | .164 / 41.1% |
| comet-tail | .013 / 6.0% | **.094 / 25.9%** | tokamak-plasma | .034 / 28.4% | .074 / 34.2% |
| protein-folding | .016 / 12.7% | .070 / 26.9% | dna-helix | .023 / 14.5% | .050 / 27.6% |
| microvilli-field | .036 / 31.2% | .083 / 59.3% | vortex-flame | .106 / 29.1% | .167 / 41.4% |
| synapse-pulse | .019 / 12.7% | .061 / 41.1% | fluid-flow | .071 / 40.7% | .100 / 46.4% |
| icosahedral-virus | .031 / 19.5% | .095 / 39.3% | mirror-symmetry | .125 / 61.8% | .191 / 76.8% |
| mitosis-spindle | .041 / 24.7% | .131 / 38.5% | starlight | **NaN** / 17.2% | .115 / 25.9% |
| wave-diffraction | .039 / 25.9% | .086 / 41.9% | comet | .027 / 11.6% | .102 / 38.5% |
| black-hole | .113 / 27.4% | .169 / 40.2% | lightning | .016 / 6.1% | .038 / 12.4% |
| spiral-galaxy | .042 / 43.3% | .088 / 60.6% | explode | .040 / 36.0% | .063 / 57.8% |
| orion-nebula | .110 / 84.4% | .202 / 95.6% | matrix-rain | .035 / 11.6% | .058 / 17.6% |
| pulsar-beacon | .043 / 26.0% | .088 / 57.9% | audio-beat | **.000 / 0%** | .033 / 46.0% |
| hurricane-eye | .073 / 28.0% | .139 / 46.7% | audio-equalizer | .026 / 7.1% | **.202 / 33.1%** |
| lightning-leader | .037 / 30.7% | .058 / 38.4% | nebula(星点) | .343 / 98.8% | .349 / 98.8% |
| magnetosphere-aurora | .051 / 30.9% | .085 / 39.6% | quantum-collapse | .044 / 30.8% | .075 / 75.7% |

(lighting/matrix 阈值式闪断、audio idle 是「管线关闭 ≠ 全黑」语义,非全屏亮度追求。)

### 6.3 常设门禁 + 验收证据

- 新增 `tests/engine/effects-visual-floor.test.ts`:49 CPU 效果按 **ambient / feature / strobe / tool 四档**锁定亮度/覆盖下限(设计意图分层,非一刀切),附 NaN 全扫 + 工具空态纯黑断言 + 档位全覆盖防漏。
- `yarn typecheck` 绿;`yarn test` **120 文件 / 1103 用例全过**;`ui:snapshot` 重拍基线后 **9/9 GATE PASS**。
- 基线重拍说明:重拍前对照实验(stash 全部 src 改动重建重拍)显示 6 个 view 的超限 diff **与本次改动逐位无关**(环境漂移,基线拍摄日 09-23 与当日渲染环境不一致,R162 已知课题),按 T1/T3 流程在 HEAD 重拍。

---

*关联:R160/R164(三层漏斗)· R166/R167(实施条款)· [2026-09-23-effects-ux-deep-review.md](./2026-09-23-effects-ux-deep-review.md) · PRD-0002 R165-R167*
