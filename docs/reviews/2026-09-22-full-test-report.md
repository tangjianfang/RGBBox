# RGBBox 全量自动化测试报告（R155 只读测试轮）

**日期**:2026-09-22　**基线**:main @ `a47e8bc`（R154 后，工作区干净起点）　**性质**:只读测试，`src/` 0 diff
**范围**:typecheck + 全量 vitest + coverage + 构建 + 9 view 像素门禁 + CDP E2E + hex 审计 + 运行时健康探针 + 9 view 截图目检
**前置**:本地视觉 review 产物已清理（`docs/ui-baseline/current/` + `diff/`，gitignored；git 跟踪的受信基线未动，R152.3/T3）

---

## 0. TL;DR

| # | 门禁 | 结果 | 关键数字 |
|---|---|---|---|
| 1 | `yarn typecheck`（node+web） | ✅ PASS | 0 error，7.1s |
| 2 | 全量 `yarn test`（vitest） | ✅ PASS | **118 files / 1081 passed / 41 skipped / 0 failed**，69.4s |
| 3 | coverage（`--coverage` 跑批） | ❌ **FAIL** | lines **61.91%**<75、branches **48.66%**<60、functions **51.24%**<60、statements **59.4%**<75 → exit 1 |
| 4 | `yarn build` | ✅ PASS | 23.2s，fresh out/ |
| 5 | `yarn ui:snapshot`（pixelmatch 硬门禁） | ✅ **GATE PASS** | 9/9 view 在阈值内，最大 diff video 0.0574%（limit 0.2%），exit 0 |
| 6 | CDP E2E `verify-r144-vision-lab.mjs` | ✅ PASS | **27/27**，含 zero page errors |
| 7 | hex 色彩纪律审计 `ui-audit-hex.mjs` | ✅ PASS | bare-hex violations **0** |
| 8 | 运行时健康探针（临时 CDP，仓库外） | ✅ PASS | 启动 365ms；9 view **console error/warning/pageerror/请求失败全 0**；JS heap 15MB |

**唯一红灯**：coverage 全局阈值失守（详见 §4）——`yarn test` 本身全绿，但 `test:coverage` 路径 exit 1。属测试覆盖缺口，非产品功能缺陷。已立建议书 B1。

**视觉复核结论**：R150/R151/R153 的全部历史修复项在 9 张实拍中**零回归**（§8 逐项确认表）；本轮新增发现均为 P3/P4 级观感/可发现性问题，无 P1/P2 硬伤（§9）。

---

## 1. 执行环境

- OS Windows Server（win32 10.0.20348）x64，Git Bash；Node/yarn 1.22.22（repo `packageManager` 锚定）
- Electron 41.4.0（`node_modules/electron/dist/electron.exe`，CDP 9281/9282）
- 探针视口 1440×900，与快照基线口径一致；boot 前 localStorage `rgbbox:*`/`rgbbox-*` 全清（R153.6 快照卫生）
- coverage 输出指向仓库外临时目录（本条 R155.6 边界：不弄脏 git 跟踪的 `coverage/` HTML 报告）

---

## 2. 静态检查

| 项目 | 命令 | 结果 | 耗时 |
|---|---|---|---|
| Node 侧类型（main/preload/shared/engine） | `tsc --noEmit -p tsconfig.node.json` | 0 error | ~7.1s（两段合计） |
| Web 侧类型（renderer） | `tsc --noEmit -p tsconfig.web.json` | 0 error | ↑ 同上 |

R154 删除划词 AI 后的契约面（ipc/preload/i18n）无类型残留，交叉验证 R154.6 验收①持续成立。

---

## 3. 单元 / 集成测试（按模块分布）

总量：**118 个测试文件 / 1122 用例 = 1081 通过 + 41 跳过 / 0 失败**，总时长 69.43s（transform 6.4s / setup 32.1s / import 20.2s / tests 27.3s / environment 44.9s）。

| 模块 | 测试文件数 | 覆盖内容（对应 PRD 条款） | 结果 |
|---|---|---|---|
| `tests/engine/` | 9 | CPU 内置效果 55 种、color/textRenderer/previewEngine 等（R1/R11.2） | ✅ 全过 |
| `tests/main/` | 20 | displayTopology、overlayManager、screenCapture、captureProviders、logger 类主进程子系统（R4/R11.2） | ✅ 全过 |
| `tests/renderer/components/` | 35 | EffectsView、PreviewGrid、DisplayMap、AiLabVisionTab（13 用例）、DashboardView、SnipView、VideoWallEditor 等（R12.1 + R150/R151/R153 适配） | ✅ 全过 |
| `tests/renderer/hooks/` | 5 | useAudioAnalyzer、useVisionInput、persistedState 等（R12.2） | ✅ 全过 |
| `tests/renderer/gl/` | 3 | headless GL 管线（previewGl/effect3dGl，R12.3；GPU 路径按 R12.5.5 优雅降级） | ✅ 全过（skip 主体） |
| `tests/renderer/3d/` | 2 | LEDMapper、SplatViewer import-shape（R12.1.13/14） | ✅ 全过 |
| `tests/renderer/workers/` | 1 | previewEngineWorker 消息协议 + zero-copy transfer（R11.2.13） | ✅ 全过 |
| `tests/shared/` | 7 | ipc 通道表、logger、modelsManifest、ai8Client、dtlnDsp、timeFormat（R7/R11.2） | ✅ 全过 |
| `tests/preload/` | 1 | contextBridge 白名单 API 面与类型签名（R5/R11.2.11） | ✅ 全过 |
| `tests/integration/` | 1 | 46+ IPC 通道唯一性 / payload 契约（R11.3.3） | ✅ 全过 |
| `tests/vision/` | 9 | 体感模块端口/推理/手势（R131-R143 链路） | ✅ 全过 |
| 根（effects/profileStore） | 2 | 55 效果枚举 + profile CRUD/损坏恢复（R11.3） | ✅ 全过 |

41 个 skip 全部集中在 headless 环境无法行使的 GPU/3D 路径（R12.5.5 约定的 `it.skip` 降级），无意外跳过。

---

## 4. Coverage —— ❌ 全局阈值失守（本轮唯一红灯）

> 口径：`vitest run --coverage`（v8），阈值取自 `vitest.config.ts`（R12.6 定标的 lines 75 / branches 60 / functions 60 / statements 75）。

| 指标 | 实测 | 阈值 | 判定 |
|---|---|---|---|
| Lines | **61.91%** | 75% | ❌ −13.09pt |
| Branches | **48.66%** | 60% | ❌ −11.34pt |
| Functions | **51.24%** | 60% | ❌ −8.76pt |
| Statements | **59.40%** | 75% | ❌ −15.60pt |

**逐模块**（Stmts/Branch/Funcs/Lines）：

| 模块 | Stmts | Branch | Funcs | Lines | 评价 |
|---|---|---|---|---|---|
| `src/engine/` | 95.55 | 77.76 | 94.2 | 96.66 | ✅ 优秀（R11 目标达成） |
| `src/shared/` | 87.16 | 77.0 | 79.8 | 88.34 | ✅ 良好 |
| `src/renderer/src/workers/` | 100 | 85 | 100 | 100 | ✅ 满覆盖 |
| `src/renderer/src/engine/` | 96.29 | 85.71 | 100 | 100 | ✅ 优秀 |
| `src/main/` | **49.09** | 46.06 | 51.73 | 49.9 | ⚠️ 中低（capture/窗口管理 mock 边界外） |
| `src/renderer/src/components/` | **34.35** | 32.79 | 36.27 | 35.75 | ❌ 拖累主力 |
| `src/renderer/src/hooks/` | 66.32 | 47.52 | 63.63 | 71.42 | ⚠️ 其中 `hooks/domains` 仅 39.02/12.44 |
| `src/preload/` | — | — | — | — | `**/index.ts` 在 exclude 清单，不计入 |

**最拖累文件**（建议书 B1 的补测优先级即按此排序）：

| 文件 | Lines | 备注 |
|---|---|---|
| `components/WorkspaceView.tsx` | **0%**（160-989 全未覆盖） | 最大单文件缺口 |
| `components/DiagnosticsView.tsx` | **0%**（26-157） | R151.4 四卡后无组件测试 |
| `components/ScreensaverView.tsx` | **0%**（23-112） | R74 灯效屏保 |
| `components/ShutdownTimerPanel.tsx` | 3.57% | R73 定时关机 |
| `hooks/useEngineLoop.ts` | 4.8%（54-230） | 引擎主循环 |
| `components/Model3DView.tsx` | 6.25% | R68 已屏蔽入口，残留低覆盖 |
| `hooks/domains/*`（7 个域） | 39.02% 组均 | R147 域拆分新产线 |

**根因判读**：R147 渲染层域拆分 + R149-R153 连续 UI 批次新增了大量视图代码，而测试增长集中在 vision/AI 实验室（AiLabVisionTab 95.51% lines）。历史条款 R12.6.4 写的「全局上调到 85%」从未落地，现配置 75/60 也已失守——阈值与实际覆盖面脱节。属**门禁配置债**，不是回归。修复路径二选一：补齐 WorkspaceView/DiagnosticsView 等大文件的组件测试，或按 R12.6 先例把「3D 依赖型视图」加入 exclude 并另立补测 R-N。详见建议书 B1。

---

## 5. 构建产物

`yarn build`（typecheck + electron-vite build）✅ 23.16s。renderer 主要 chunk（构建输出原始值）：

| Chunk | 体积 | 备注 |
|---|---|---|
| `vendor-three-*.js` | **1,163.57 kB** | three.js 全量 vendor，超 500kB 警戒线一倍以上 |
| `VideoStudioView-*.js` | **981.20 kB** | 单视图 chunk 最大（内含 hls.js 等播放器依赖） |
| `styles-*.js` | **750.46 kB** | 样式/资源模块，构成待分析 |
| `vendor-splat-*.js` | 517.99 kB | Gaussian Splat vendor（R68 已屏蔽入口，仍打包） |
| `index-*.js` | 447.89 kB | 主入口 |
| `AudioStudioView-*.js` | 185.28 kB | |
| `AiLabView-*.js` | 164.41 kB | |
| `MiniGamesView-*.js` | 155.72 kB | |
| `WorkspaceView-*.js` | 103.17 kB | |

视图级 lazy chunk 生效（9 view 各自分包），但 vendor 与两个重型视图的体积优化空间显著（建议书 §P）。

---

## 6. 视觉像素硬门禁（`yarn ui:snapshot` = capture + pixelmatch compare）

新鲜度前置 `fresh-build check ok`；9/9 view 捕获成功（canvas 掩膜全开，`*.boxes.json` 双侧置零）：

| view | diff-rate | limit | 判定 |
|---|---|---|---|
| dashboard | 0.0000% | 0.1% | ok |
| workspace | 0.0000% | 0.2% | ok |
| effects | 0.0000% | 0.1% | ok |
| video | **0.0574%** | 0.2% | ok（diff 图落盘，见下） |
| audio | 0.0000% | 0.1% | ok |
| games | 0.0000% | 0.1% | ok |
| diagnostics | 0.0000% | 0.1% | ok |
| architecture | 0.0000% | 0.1% | ok |
| ai | 0.0000% | 0.1% | ok |

**GATE PASS，exit 0**。video 的 0.0574% 经 diff 图目检定位：差异像素**集中在摄像头设备名文字区**（`Integrated Camera (13d3:56d5)` 下拉框文本），为设备枚举异步填充时序差异，与 R152.8 校准记录的「跨启动微抖动」同类，量级远低于 0.2% 上限，非 UI 回归。8/9 view 字节级稳定（0.0000%）再次验证 R153.6 localStorage 全清卫生的有效性。

---

## 7. CDP E2E + 色彩纪律

- `verify-r144-vision-lab.mjs`：**27/27 PASS**（board 9 卡、5 折叠组、jawOpen/pinch 触发高亮、计数复位、zero page errors）——R153.6 的 27/27 持续成立，体感链路在真 Electron 环境无回归。
- `ui-audit-hex.mjs`：bare-hex violations **0**——R148 S0 token 体系纪律保持。

---

## 8. 运行时健康探针（临时 CDP 脚本，仓库外 `%TEMP%`）

| 指标 | 实测 | 评价 |
|---|---|---|
| 冷启动（reload → `.module-rail` 可交互） | **365ms** | 优秀（R130 秒开文化一致） |
| console error / warning（9 view 全导航） | **0 / 0** | 干净 |
| 未捕获异常 pageerror | **0** | 干净 |
| 失败网络请求 | **0** | 干净 |
| JS heap（used / total，导航结束时点） | **15MB / 21MB** | 轻量 |
| 各 view 挂载至稳定（扣除固定 800ms 等待） | audio 29ms · games 44ms · dashboard 41ms · workspace 53ms · diagnostics 62ms · architecture 88ms · video 171ms · effects 182ms · ai 280ms | 全部 <300ms；ai/effects/video 最重（lazy chunk + 播放器/画布初始化），体感无卡点 |

---

## 9. 9 view 截图目检纪要（只读复核）

方法：`docs/ui-baseline/current/*.png`（本轮门禁实拍，1440×900）逐张目检，沿用 R150 的 P1-P4 分级；与 R150 已修复项交叉核对防误报。

### 9.1 历史修复项回归确认（全部在位，零回归）

| 历史项 | 本轮实拍证据 | 判定 |
|---|---|---|
| R150.1 W1 视频墙截断 | workspace 右列拓扑面板完整，采样面板下移无遮挡 | ✅ 无回归 |
| R150.1 W2 网格密度值换行 | 「24 × 14」单行 | ✅ 无回归 |
| R150.3 E1 效果计数 stale | 「55 种内置效果」与 tab 合计一致（i18n:1620 复核） | ✅ 无回归 |
| R150.5 E2 效果孤儿卡 | 经典 tab 7 卡 5+2 排布 | ✅ 无回归 |
| R150.2 I1 AI「未测试」裸状态 | 已入 pill 容器 + 刷新按钮 | ✅ 无回归 |
| R150.2 I3 保存无 primary | 「保存」为唯一填充 primary，「设为当前」secondary | ✅ 无回归 |
| R150.3 V1 video eyebrow 重复 | 「采样 · 剪辑 · 标注」与标题不再重复 | ✅ 无回归 |
| R150.4 A2 音频滑杆 status 蓝 | 音量/平衡滑杆均为 accent mint | ✅ 无回归 |
| R150.3 A1 Circular/Wave Ring 硬编码 | 「圆形频谱」「波形环」中文 tab | ✅ 无回归 |
| R151.1 仪表盘图标色相 | 8 tile 8 色相（mint/violet/sky/amber/rose/lime/orange/fuchsia）一眼可辨 | ✅ 无回归 |
| R151.2 音频 transport 三簇 | 播放控制｜进度（≤520px 居中）｜音量三簇成型 | ✅ 无回归 |
| R151.4 诊断三组卡 | 2×2 四卡（帧与时延/渲染管线/环境/各进程 CPU）+ mini-bar + provider 行 | ✅ 无回归 |
| R153 体感 9 卡看板 | E2E 断言 9 卡常驻 + jawOpen 触发高亮 ×1 | ✅ 无回归 |

### 9.2 本轮观察（新记录，均非硬伤；修复建议见建议书）

| view | 级 | 观察 |
|---|---|---|
| architecture | P3 | 右下角悬浮控制按钮组与「手势助手」pill 挤压/部分遮挡（R150.6 G1 遗留，实拍确认仍在；全 view pill 常驻，仅此 view 有同位浮控件冲突） |
| ai（配置 tab） | P3 | 表单仍占左半 ~55%，右半空旷（R150.6 I2 遗留，实拍确认仍在） |
| architecture | P4 | 底部快捷键提示「Space·1-7·L·R·Esc」对比度过低，近不可读 |
| audio | P4 | 可视化 tab 行右端 4 个 icon-only 按钮（刷新/复制/全屏/显示？）静态不可辨义，无文字 tooltip 兜底（目检限制：未做 hover 走查） |
| games | P4 | 「光刃斩击」卡图标为时钟，与「光刃」语义不匹配（内容 nit） |
| dashboard | P4 | 1440×900 下模块网格以下整屏留白，纵向空间利用率低（首页信息密度可选增强） |
| video | P4 | 「开始」旁第二按钮为 icon-only，语义需 hover 确认 |
| 诊断 | 观察 | 「各进程 CPU」卡首屏显示「等待中」（1Hz 轮询未及首拍），属预期时序非缺陷 |

正面：S0-S3 体系继续生效——rail 激活 pill、容器化空态（预览未开启/暂无播放/拖拽音频/更多游戏构思中）、badge 体系（VIRTUAL-PREVIEW/WINDOWS）、字阶与 token 纪律全部在线；运行状态五卡、四卡诊断、三簇 transport 等近期批次设计意图均如实落地。

---

## 10. 结论

- **产品质量面**：typecheck / 1081 用例 / 构建 / 像素门禁 / E2E / 运行时健康**六绿**，R154 后主线处于可发布态。
- **门禁债务面**：coverage 阈值失守是本轮唯一红灯（B1），性质是测试覆盖未跟上 R147+ 的视图扩张，需要一次专门的补测/阈值校准 R-N（非产品 bug）。
- **体验打磨面**：新观察 8 项均 P3/P4，其中 2 项为 R150 显式遗留（G1/I2），建议随 R148 S3 后续批次消化。
- 本轮 `src/` 0 diff，符合「只测试不修复」边界；证据文件：门禁表（§0/§6）、coverage 日志（%TEMP% 存档）、探针 JSON、9 张实拍 `docs/ui-baseline/current/`。

---

*配套文档：问题与优化建议书 → [`2026-09-22-issues-recommendations.md`](./2026-09-22-issues-recommendations.md)*
