# REVIEW — 灯效引擎 + 诊断模块 差距审计（2026-10-11）

范围：`src/engine/`（effects / previewEngine / color / textRenderer / videoWall / videoWallFrame，附带目录内其余 4 个小文件）+ `src/renderer/src/engine/metricsCollector.ts` + `DiagnosticsView.tsx` 及其数据链路（useEngineLoop / previewEngineWorker / canvasTextMask / frameAge / App 装配段）。只读审计，未改产品代码。

## 1. 模块概览（职责 / 入口 / 数据流）

```text
useEngineLoop(App.tsx 装配, 全 ref 化)
  → 每帧 tick: 采集(screen-ambient 才捕获) → applyParameterAutomation → postMessage
  → previewEngineWorker: canvasTextMask(OffscreenCanvas, CJK) → renderPreviewFrame(previewEngine)
      └ effects.ts renderEffectPixel 49 效果 switch + zone/slot mask + 亮度/饱和/平滑内联链
  → 回帧(零拷贝 transfer) → frameRef/ledColorsRef/distributeFrameToOverlays
  → FrameMetrics → MetricsCollector(180 帧滚动, avg/p95/droppedTicks)
  → DiagnosticsView(1Hz 快照) / Dashboard dashFps(1Hz)
旁路: ScreensaverView → IPC → 主进程 renderPreviewFrame(无 textMasks → 位图字体回退)
      3D 效果 → Preview3D GPU 直渲染 → handleFrame3D 喂 MetricsCollector
      GPU 直渲 2D 效果(GPU_DIRECT_EFFECTS 26 种) → OverlayCanvas/PreviewGrid EffectGl，不过 CPU 引擎
videoWall/videoWallFrame: 纯数学拼接(矩阵/bezel/旋转/fit) → 视频墙面板帧
```

引擎层为纯 TS 无 DOM 依赖（架构约定，非缺陷）；主进程 `src/main/index.ts` 历史 P0/P1 不在本报告重复计分。

## 2. 发现清单

严重度：P0 致命 / P1 严重 / P2 应修 / P3 择机。

| # | 类型 | 严重度 | 位置 | 证据（一句话） |
|---|---|---|---|---|
| U-1 | U | **P1** | `src/engine/effects.ts:5-9,1653,1677` | 模块级单槽缓存 `_cachedPixelDataStr/_cachedImageDataStr` 按内容而非 layer 键——两个同类型 custom-paint/image-paint 图层叠加时每像素都要 `JSON.parse` 整份多 MB 图像 JSON（56k 像素 × 2 次/帧），大网格直接卡死 |
| U-2 | U | P2 | `src/engine/previewEngine.ts:168` + `:61-70` | 每像素 `String(prep.slotIndex)` 再在 `computeDisplaySlotMask` 里 `parseInt` 回数字——R221.3 注释①声称已消除的「_displaySlot 的 String()」又从 prep 塞了回去（slotIndex 本来就是预解析好的 number） |
| U-3 | U | P3 | `src/renderer/src/engine/metricsCollector.ts:35` | p95 索引 `floor(n*0.95)` 恒比 nearest-rank（`ceil(0.95n)-1`）大 1：n=20 时直接取最大值（=P100），180 帧窗口也系统性高估 ~0.6 个百分位，预算告警偏松方向失真 |
| U-4 | U | P3 | `previewEngineWorker.ts:133`、`App.tsx:464`、`DiagnosticsView.tsx:99` | `outputMs` 两条喂入路径都硬编码 0（`outputMs: 0` / `const outputMs = 0`），诊断页却当活指标渲染——永远显示 0.0ms 的死行 |
| U-5 | U | P3 | `App.tsx:317-325,465-474` | 3D 路径 `avgFrameMs`≈像素拷贝耗时（<1ms）→ dashFps = min(1000/avg, 999) 恒顶格 999，仪表盘显示假帧率 |
| U-6 | U | P3 | `src/engine/color.ts:13-20` | `hexToRgb` 缓存命中时返回共享对象引用，任何调用方原地改写即全局投毒（当前无 mutator，属埋雷）；另非法 hex 静默回退白色 |
| U-7 | U | P2 | `src/renderer/src/canvasTextMask.ts:9,22-32,50,73`、`src/engine/textRenderer.ts:90,148` | 两处 mask 缓存均无上限（hexCache 有 4096 上限而它没有）：每个 key 一份 cols×rows 布尔数组（317×178≈450KB），拖 textX/textY 每步新 key 永久驻留；且每次未命中做整幅 `getImageData`——317×178 网格 cellPx=32 → 10144×5696×4B ≈ **231MB 瞬时分配** + 57.8M 次像素扫描，拖动文字位置时 worker 逐帧顿挫 |
| B-1 | B | P3 | `src/engine/effects.ts:1714-1715` | `case 'screen-ambient': default:` 未知效果 kind 静默按屏幕环境光渲染——拼错/未来 kind 永不暴露，与 eqResponse 的 `never` 穷举保护风格相反 |
| B-2 | B | P3 | `src/engine/previewEngine.ts:140` | `usePerformanceGuard=false` 时平滑被静默置 0（`? clampUnit(smoothing) : 0`），关闭性能守卫的用户的 smoothing 滑杆实际无效且诊断页不提示 |
| B-3 | B | P3 | `src/engine/previewEngine.ts:71-77` | 多联屏 slot mask 按 `slotIndex/count` 等分虚拟画布——异宽显示器拓扑下羽化边界落在错误位置 |
| B-4 | B | P3 | `metricsCollector.ts:11-12` + `DiagnosticsView.tsx:100` | `droppedTicks` 是进程生命周期累计值，却与 180 帧（约 3-6 秒）窗口的 avg/p95 同列展示，长会话健康运行也会显示不断增长的大数字 |
| B-5 | B | P3 | `src/renderer/src/hooks/useEngineLoop.ts:215-228` | worker `error` 事件仅 `console.warn`，`tickPending` 门闩永不复位——worker 崩溃后引擎静默停摆，唯一信号是没人盯着的 droppedTicks 累计 |
| B-6 | B | P3 | `src/engine/effects.ts:694-705` | audio-beat 包络衰减按「每渲染帧 ×0.72」而非墙钟时间（注释自认"30fps≈200ms"）——60fps 预览与 30fps 输出目标下衰减速度差一倍，同一 profile 手感随帧率漂移 |
| V-1 | V | P2 | `src/engine/effects.ts:193`、`ScreensaverView.tsx:87`、`preload/index.ts:23-24`、`textRenderer.ts:16-81` | static 文字效果双渲染器：主预览/overlay 走 OffscreenCanvas CJK 字体，屏保走位图字体回退（FONT_DATA 仅 A-Z/数字/标点）——中文文字在屏保显示为 `?` 方块；preload 明明支持传 textMasks 但 ScreensaverView 没传 |
| V-2 | V | P2 | `src/engine/effects.ts:1335,1384-1396,1192-1207,1416-1425,1447-1454` | 重科学系效果每像素重算帧不变几何：icosahedral-virus 每像素 `ICOSAHEDRON_VERTICES.map(...)` 新建 12 对象+数组；protein-folding 每像素 46 段曲线采样；solar-system 每像素 8 轨道×3 次 `hslToRgb`（≈40 次）——这些 kind 不在 GPU_DIRECT_EFFECTS，56k 网格必然超帧预算掉帧（R221.3 只修了 fire/static，同模式债务仍在） |
| T-1 | T | P3 | `tests/engine/previewEngine.test.ts` | 19 用例全部只断言 'normal' 混合路径，add/multiply/screen 三种 blendMode 零覆盖 |
| T-2 | T | P3 | `tests/renderer/components/` | 无 DiagnosticsView 测试（frameAge/metricsCollector 有单测）——U-4 的恒 0 行、B-4 的累计值展示这类回归无护栏 |
| T-3 | T | P3 | `tests/effects.test.ts` | custom-paint/image-paint 仅单图层用例，U-1 的同类型双图层颠簸场景零覆盖 |
| T-4 | T | P3 | `tests/engine/effects-visual-floor.test.ts` | 视觉底线只测亮度下限，无任何帧时间预算回归测试（R221.3 那次 198% 超预算没有测试防线） |
| T-5 | T | P3 | `tests/renderer/`（缺） | canvasTextMask（CJK 掩码 + 无上限缓存）无任何单测 |

## 3. 价值任务建议（均过三关：砍掉用户可感知 / 独立可交付可验收 / 文件所有权独立可并行）

| 任务 | 修什么 | 文件 | 验收要点 | 三关 |
|---|---|---|---|---|
| TA1（对应 U-1+T-3） | paint JSON 缓存从单槽改为按内容 Map（带上限），双同类型图层不再逐像素 JSON.parse | `src/engine/effects.ts` | 新增双 custom-paint / 双 image-paint 图层单测：结果与逐层单独渲染一致；大网格下无逐帧 parse（可断言 parse 次数≤2/帧） | 叠加双图像图层从卡死→可用✓ 纯引擎文件✓ 单测可断言✓ |
| TA2（对应 V-2+U-2+T-4） | 重科学系效果帧不变几何按 (layerId, now) 帧级缓存（复用 `_fireColCacheMap` 模式）；顺带一行修掉 previewEngine:168 的每像素 String/parseInt | `src/engine/effects.ts`、`src/engine/previewEngine.ts` | 新增帧时间预算测试（如 317×178 下 solar-system/icosahedral-virus/protein-folding 单层 ≤N ms/帧）；渲染输出逐像素不变（回归快照） | 大网格科学效果掉帧可见改善✓ 纯引擎✓ 预算测试可验收✓ |
| TA3（对应 U-7+T-5） | canvasTextMask：缓存加 LRU 上限 + cellPx 自适应降采样（大网格 32→8，仍保 CJK 可读），消灭 231MB 瞬时分配 | `src/renderer/src/canvasTextMask.ts` | 新增单测（掩码尺寸/命中/上限淘汰）；大网格拖 textX 时 textMaskMs 有上界 | 拖文字位置不再顿挫、内存稳定✓ 单文件✓ 单测+textMaskMs 指标可验收✓ |
| TA4（对应 V-1） | ScreensaverView 预计算 textMasks 随 IPC 传入（preload 通道已支持），屏保中文不再回退 `?` 位图 | `src/renderer/src/components/ScreensaverView.tsx` | 含 CJK static 层的 profile 屏保截图视觉复核（真机截图，符合表现层质量零容忍） | 中文屏保从乱码→正确✓ 单组件文件✓ 视觉复核可验收✓ |
| TA5（对应 U-3/U-4/U-5/B-4+T-2） | 诊断修正包：p95 改 nearest-rank；outputMs 接真实测量（distributeFrameToOverlays 计时）或删行；dashFps 3D 路径改用帧间隔；droppedTicks 标注「累计」 | `metricsCollector.ts`、`DiagnosticsView.tsx`、`App.tsx`、i18n zh/en | metricsCollector 单测更新（p95 精确断言）；新增 DiagnosticsView 冒烟测试锁行集合 | 诊断数字不再误导✓ 小范围三文件✓ 单测+快照可验收✓ |
| TA6（候选，可缓）（对应 B-5） | worker error 时复位 tickPending 门闩并重建/上报，引擎不再静默停摆 | `src/renderer/src/hooks/useEngineLoop.ts` | 模拟 worker error → 门闩复位、下一 tick 恢复或显式降级提示 | 触发少但一旦发生是全引擎死✓ 单文件✓ 可模拟验收✓（P3 优先级，排最后） |

不建议做：给引擎加通用缓存框架（过度设计，现有 per-effect 帧级缓存模式已够）；改 B-1 的 default 回退语义（向前兼容旧 profile 是有意行为，仅记录）；B-3 异宽 slot 精确映射（依赖 display 拓扑数据进 engine，收益低）。

## 4. 优先级排序与 R-N 区间建议

排序：**TA1 → TA2 → TA3 → TA4 → TA5 → TA6**

| 顺位 | 理由 | 建议 R-N（从 R264 起，具体编号由主会话分配） |
|---|---|---|
| 1 | P1 唯一项，用户触发即卡死 | R264 |
| 2 | P2×用户可见掉帧，且能建帧预算防线防回归 | R265 |
| 3 | P2×内存+顿挫，CJK 是目标用户主路径 | R266 |
| 4 | P2×视觉硬伤（表现层零容忍） | R267 |
| 5 | P3 打包，一次交付清理诊断可信度 | R268 |
| 6 | P3 边缘场景 | R269 |

统计：**20 条** — U×7 / B×6 / V×2 / T×5；X 类不单列（layer.id 帧级缓存无淘汰并入 U-7 语境，MetricsCollector.add 每帧全量快照为 P3 琐项）。按严重度分桶：**P1×1（U-1），P2×4（U-2/U-7/V-1/V-2），P3×15**。


---

## 主审复核（2026-10-11，主会话对码核对）

子代理幻报率审计：本报告 Top 结论逐条对码核对结果如下（幻觉/表述偏差已标注）。


**TA1（effects 单槽缓存）**：✅ 确认——`effects.ts:5-9` 单槽 `_cachedPixelDataStr` 实锤；「每像素重复 parse」的热点幅度需 profile 佐证后定级（P1→P2 待定）。
