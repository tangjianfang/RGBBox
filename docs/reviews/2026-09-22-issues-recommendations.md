# RGBBox 问题与优化建议书（R155 只读测试轮）

**日期**:2026-09-22　**配套**:全量测试报告 [`2026-09-22-full-test-report.md`](./2026-09-22-full-test-report.md)
**性质**:建议书——只记录与建议，**未做任何代码修复**（R155 边界）；每条附证据与建议修法，供后续立项 R-N 时取用
**来源**:全量门禁跑批（typecheck/vitest/coverage/build/像素门禁/E2E/hex）+ 9 view 实拍目检 + 运行时探针

---

## 1. 总览

| 级 | 数量 | 条目 |
|---|---|---|
| **P1 门禁债务** | 1 | B1 coverage 全局阈值失守（`test:coverage` 路径 exit 1） |
| P3 | 4 | B2 video 快照设备名噪声、B3 手势助手 pill 挤压浮控件（遗留）、B4 AI 配置表单失衡（遗留）、B5 main 进程 coverage 结构性偏低 |
| P4 | 6 | B6 架构图快捷键提示对比度、B7 音频 icon-only 按钮串、B8 games 图标语义、B9 dashboard 纵向留白、B10 video 次按钮语义、B11 vendor chunk 体积 |
| 性能建议 | 3 | P-1 bundle 拆分、P-2 测试 setup 耗时、P-3 补测优先级地图 |

P1/P2 产品硬伤：**0**（R150 修复批后连续三轮无新硬伤；本轮六项门禁绿详见报告 §0）。

---

## 2. 缺陷 / 门禁类

### B1（P1）coverage 全局阈值失守——`yarn test:coverage` 持续红灯

- **现象**：`vitest run --coverage` 全部 1081 用例通过，但 coverage 收尾 exit 1：lines 61.91%<75、branches 48.66%<60、functions 51.24%<60、statements 59.40%<75。
- **证据**：报告 §4 逐模块表；`components/` 组均 34.35%，`WorkspaceView`/`DiagnosticsView`/`ScreensaverView` 三文件 **0%**，`useEngineLoop` 4.8%。
- **根因**：R147 域拆分 + R149-R153 连续 UI 批次新增视图代码后，测试增长集中在 vision/AI 实验室，全局阈值（R12.6 定标 75/60）与实际覆盖面脱节；R12.6.4 写明的「上调到 85%」从未落地，现状连 75 都不满足。**这是门禁配置债，非产品回归**——但它让 coverage 门禁在日常流程中事实上失效（红灯常态化=没有红灯）。
- **建议修法（二选一，需立项 R-N）**：
  - **方案 a（校准）**：仿 R12 先例，把「3D/重运行时依赖型视图」加入 coverage exclude（WorkspaceView 的画布/采样域、ScreensaverView、Model3DView、ShutdownTimerPanel），把阈值回落到当前真实水位（如 65/50/55/65）使其恢复「红灯=真回归」的信号价值，再逐批补测拉高；
  - **方案 b（补测）**：直接为 0% 大文件补组件测试（WorkspaceView 图层/采样面板交互、DiagnosticsView 四卡渲染、ScreensaverView 状态机），预计 3-5 个测试文件可把 lines 拉回 75 线。
  - 建议走 **a+b 混合**：先 a 恢复门禁信号，b 按报告 §4 优先级表分批还债。

### B2（P3）video view 快照 0.0574% 常态噪声——摄像头设备名文字

- **现象**：像素门禁中 video 是唯一非零 diff view；diff 图定位差异在「摄像头设置 → 设备下拉框」的文字区（`Integrated Camera (13d3:56d5)`）。
- **根因**：设备枚举异步填充，截图时点不同导致文字内容/字体栅格化差异（与 R152.8 记录的跨启动抖动同类）。
- **建议**：①给 `ui-snapshot.mjs` 的 video view 增加该下拉框的掩膜（`*.boxes.json` 已有 canvas 机制，可扩展 data-mask 选择器）；或 ②截图前等待设备枚举完成（等下拉框文本稳定 N 帧）。消除后 video 阈值可收回 0.1% 档，门禁灵敏度提升。

### B3（P3，R150.6 G1 遗留确认仍在）「手势助手」pill 与浮层控件挤压

- **现象**：全 view 右下角常驻「手势助手」pill；architecture view 右下同位有 3D 悬浮控制按钮组，实拍中 pill 与按钮相互挤压遮挡（报告 §9.2 截图证据）。
- **建议**：pill 默认锚点右移出悬浮控件带（如上移 48px），或 architecture view 内检测悬浮工具条时 pill 自动让位；一并复查 video 全屏态。

### B4（P3，R150.6 I2 遗留确认仍在）AI 实验室配置表单宽屏失衡

- **现象**：1440×900 下配置表单占左半 ~55%，右半整片空旷。
- **建议**：双列布局（名称/服务商 + API 地址/模型 两行并排），或表单 `max-width` 居中 + 右侧放连接状态/余额卡（R129 余额、R118 provider 状态都有现成数据可填）。

### B5（P3）`src/main/` coverage 49.09% 结构性偏低

- **现象**：main 组均 49.09%（engine 95.55 / shared 87.16 对照），`captureProviders`、窗口生命周期、托盘/屏保调度等路径 mock 边界外。
- **建议**：优先补「逻辑密集且可纯 mock」的子模块（屏保状态机 R74/R146、定时关机调度 R73、托盘菜单构造），capture 硬件路径维持 exclude。可与 B1 同一 R-N 分批。

---

## 3. UI 布局 / 可发现性类（P4）

### B6 架构图底部快捷键提示对比度过低
「Space·1-7·L·R·Esc」底部居中提示近不可读（低灰 on 深底）。建议升到 `--text-muted` 档或加半透明底容器（S3「警示/提示入容器」原则）。

### B7 音频可视化 tab 行右端 4 个 icon-only 按钮语义不明
刷新/复制/全屏/显示切换无文字无 tooltip（静态目检限制，未做 hover 走查）。建议补 `title`/`aria-label`，或按 R150 ST2 思路收进「⋯」溢出菜单。

### B8 games「光刃斩击」卡图标为时钟
与「光刃」语义不匹配（amber 底 clock 图标）。建议换剑/刀形 icon（lucide `sword`/`swords`）。

### B9 dashboard 模块网格以下整屏留白
1440×900 下内容止于 ~600px。可选增强：运行状态卡合并进磁贴副行、下方加「最近诊断/快捷操作」行；保持 R150.5 的 4×2 网格不动。

### B10 video「开始」旁第二按钮 icon-only
语义需 hover 才可知。建议加 tooltip 或改文字按钮（与「开始」同簇更一致）。

### B11 AI 配置「档位」操作钮簇（+ / 删除）裸图标
右上 + 与垃圾桶无文字兜底；低频但破坏性（垃圾桶）建议 hover 前就有 title。

---

## 4. 性能优化建议

### P-1 renderer bundle：vendor 与重型视图 chunk（构建期即得，性价比最高）

| Chunk | 体积 | 建议 |
|---|---|---|
| `vendor-three` | 1,163.57 kB | three.js 按需 import（`three/examples` 子路径 tree-shake 审计）+ `manualChunks` 把 3D vendor 拆到仅在 architecture/games/model3d 懒加载的入口；R68 已屏蔽 model3d 入口，`vendor-splat`（517.99 kB）可评估动态 import 化，首屏零需 |
| `VideoStudioView` | 981.20 kB | hls.js / wavesurfer 等播放器依赖拆子 chunk；播放器/截图/标注三大功能域按 R147 模式再分层懒加载 |
| `styles` | 750.46 kB | 构成待分析（疑大 JSON/内联资源混入 styles 模块）——用 `rollup-plugin-visualizer` 出一次构成图再定 |
| `index` | 447.89 kB | 随 vendor 拆分自然回落 |

预期效果：首屏关键路径（index + rail + dashboard）显著小于当前 ~1.2MB JS，冷启动 365ms 的余量保持。

### P-2 vitest setup 耗时
总 69.4s 中 setup 32.1s（每文件重入 setupFiles）+ environment 44.9s。可评估 `@vitest/coverage-v8` 之外的省法：`setupFiles` 拆按需（仅 components 组注册 jest-dom）、`fileParallelism`/`pool` 调优。属开发体验优化，低优先。

### P-3 运行时健康：当前无瓶颈，保持基线
冷启动 365ms / 9 view 零 console 告警 / heap 15MB / 最重组件挂载 <300ms——**无需优化动作**。建议把「启动 <500ms、console 0 告警」纳入 R155 式全量测试轮的常规对照基线（本次数字即首期基线）。

---

## 5. 建议落地排序（供下一条 R-N 立项取用）

| 序 | 条目 | 类型 | 风险级 | 建议批次 |
|---|---|---|---|---|
| 1 | B1 coverage 门禁恢复（a+b 混合） | 门禁 | L1-L2（改 vitest.config + 新增测试文件） | 独立 R-N，最高优先 |
| 2 | B2 video 快照掩膜 | 工具链 | L1（scripts/） | 随下次门禁批次顺手 |
| 3 | B3 手势助手 pill 让位 | UI | L2（用户可见） | R148 S3 批次 |
| 4 | B4 AI 配置双列 | UI | L2 | R148 S3 批次 |
| 5 | B6/B7/B8/B10/B11 打磨包 | UI | L2 | 合并一条打磨 R-N |
| 6 | P-1 bundle 拆分 | 性能 | L2（构建配置+动态 import） | 独立 R-N |
| 7 | B5 main 补测 | 测试 | L0-L1 | 随 B1 分批 |
| 8 | B9 dashboard 纵向利用 | UI | L2 | 需用户先拍板方向 |

> 以上均为**建议**，未经用户批准不实施（AI_WORKFLOW §6 反例三条适用：不顺手修、不扩大重构、不擅自决定用户可见行为）。

---

*数据来源与完整门禁数字：[`2026-09-22-full-test-report.md`](./2026-09-22-full-test-report.md) §0/§4/§5/§6/§8/§9*
