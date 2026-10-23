# 04 — UI 稳定性审查：渲染层「非开发机打开即报错/白屏」候选路径（视频工作站优先）

审查日期：2026-10-24 · 审查人：UI 稳定性审查工程师（只读审计，未启动应用）
范围：`src/renderer/**`、`src/main/index.ts`（协议/IPC）、`electron.vite.config.ts`、构建产物（`out/`、`release/win-unpacked/` 只读）、本机 userData（只读）
关键更新（主审澄清）：报错触发点 = 打开「视频工作站」(VideoStudioView)，**dev 与打包版都报错**，无报错原文。

---

## 摘要 — Top 风险排名

| # | 风险 | 置信度 | 一句话 |
|---|---|---|---|
| R-1 | **打包版 CSP `media-src 'self' blob:` 漏 `media:` scheme** —— 打包版所有 `media://local` 视频/音频加载、`media://` 缩略图被 CSP 拒载，播放器空态直接显示"⚠ 无法播放…" | **Likely**（CSP 字面遗漏 Confirmed；拦截行为为机制推断，未实测） | 打包版视频工作站打开即报错的最强代码级候选 |
| R-2 | R94 自动恢复 + 该机 playlist 文件不可达（dev/dist **共享** `%APPDATA%/rgbbox/config/video-playlist.json`） | Likely | 唯一能同时解释 dev+打包双报错的数据面机制 |
| R-3 | `render-process-gone` 后无上限自动 reload —— 确定性崩溃（驱动/解码）= 白屏闪烁死循环 | 机制 Confirmed / 作为主因 Speculative | |
| R-4 | 全仓**零** `webglcontextlost` 监听，驱动级丢上下文后预览/浮窗永久黑帧无自愈 | Confirmed（代码事实）/ 关联度 Speculative | 旧 Quadro 驱动 / RDP 会话典型 |
| R-5 | `SplatViewer.tsx:226` `new THREE.WebGLRenderer` 无 try/catch —— WebGL 不可用即 throw 进全局 ErrorBoundary | Confirmed（当前被 `MODEL3D_VIEW_ENABLED=false` 关闭，不可达） | 重开 3D 视图即成白屏级风险 |
| R-6 | ErrorBoundary 只兜 React 渲染/同步 effect 错误；boot `Promise.all` reject 会让 `profile` 永为 null → **永卡 boot-screen（"RGBBox" 字样的白屏）** | 机制 Confirmed / 触发 Speculative | |

三档置信度说明：Confirmed = 读到代码且有产物/数据佐证；Likely = 机制确凿、触发条件靠推算；Speculative = 推断未验证。

---

## 发现清单

### R-1 打包版 CSP 漏放行 `media://` 媒体加载（Top 风险）

- **位置**：`electron.vite.config.ts:24-33`（CSP 常量）；构建产物实证——`out/renderer/index.html` 与 `release/win-unpacked/resources/app.asar` 内均为：
  `media-src 'self' blob:`、`img-src 'self' data: blob: https:`、`connect-src 'self' media: blob: https://ai8.rcouyi.com`、`script-src 'self' media: 'wasm-unsafe-eval'`。
- **事实链**：
  1. `script-src`/`connect-src` 为 vision bundle 与模型 fetch **特意加了 `media:`**（commit 9dddbf5 R306/T16 证据原文），但 `media-src` 与 `img-src` **没有** `media:`。
  2. 消费方：`VideoStudioView.tsx:1109/1347`（playlist 项 URL `media://local?p=` 直接进 `<video src>`）、`AudioStudioView.tsx:1229/1568`（音频同 scheme）、`CaptureFilmstrip.tsx:114`（`<img src="media://local…">` 胶片栏缩略图）。
  3. 打包版页面经 `mainWindow.loadFile`（`src/main/index.ts:281`）从 `file://` 加载；CSP source matching 按 scheme/host 字面进行，`media://local` 与 `file://` 页面的 `'self'` 不同 scheme → 不匹配 `'self'`，也不匹配 `blob:`/`https:` → 媒体元素加载被 CSP 拒绝。
  4. 拒载后 `<video>` 触发 `error` → `VideoStudioView.tsx:1419-1428` `onError` → `describeMediaError`（`src/renderer/src/domain/mediaError.ts:31-43`，code 4 → `media.error.unsupported`）→ 空态浮层显示 **"⚠ 无法播放：文件格式无效或不受支持（文件可能已损坏、被加密或下载不完整）…"** ——与用户"打开（视频工作站）就报错"的表现完全同形。
  5. HLS 分支同样死：hls.js 以 fetch 拉 m3u8/ts，`connect-src` 不含任意 `https:` → 被拦 → fatal → "⚠ HLS: …"（`VideoStudioView.tsx:796-798`）。
- **触发条件**：打包版 + ① prod localStorage `rgbbox:videoMode='player'`（`VideoStudioView.tsx:238-241` 持久化）时 R94 自动恢复（`:1326-1335`）即"打开 view 即报错"；或 ② 用户手动点任何 playlist 项 / 加载网络流。dev 不注入 CSP（插件 `apply:'build'`）→ **dev 不受此项影响**。
- **验证缺口（佐证遗漏非故意）**：T16/R307 真机证据（PRD R306.5、commit 9dddbf5/ca85589）只覆盖 vision 的 script/fetch 与 AI8 connect；`scripts/e2e-journeys/journeys/` 5 条（boot/theme/lang/settings/effects）与 verify-r144 vision E2E **均无视频/音频播放用例**。
- **后果**：打包版视频工作站、音频工作站、胶片栏缩略图三大功能面全部不可用并显示报错文案；非崩溃、非白屏。
- **修复草案**：`media-src 'self' media: blob:`、`img-src … media:`（或统一给 media: 全放行）；补一条打包版 journey：视频工作站播放 playlist 项 + 胶片栏缩略图可见；在 CI 快照档加 CSP 指令↔消费 scheme 的一致性静态断言。
- **置信度**：Likely（拦截行为基于 CSP 规范/Chromium 实现推断；CSP 字面遗漏与 E2E 缺口为 Confirmed）。

### R-2 R94 自动恢复 + 该机 playlist 文件不可达（dev/dist 双报错的数据面解释）

- **位置**：`VideoStudioView.tsx:238-245`（`rgbbox:videoMode` 持久化，player 时挂载即走播放器分支）、`:1149`（`rgbbox:videoLastItem`）、`:1326-1335`（auto-restore：mode=player 且无活动源时自动 `playVideoItem`）、`:1419-1428`（onError → streamError）。
- **机制**：`video-playlist.json` 存 **userData**（`src/main/index.ts:1468`）——dev 与打包版共享同一 `%APPDATA%/rgbbox`；若该机 playlist 登记的文件已被移动/删除/在拔出的移动盘，`media://` handler `stat` 失败 → 404（`src/main/index.ts:1747-1750`）→ `<video>` error code 2/4 → 空态显示 **"⚠ 无法播放：文件读取失败（可能已被移动、删除或磁盘不可用）"**。文件在白名单目录外还有 403 路径（`mediaAllowlist`；playlistPaths 登记即放行，`:1707-1717`，故 403 仅在 JSON 与实际请求不同步时出现）。
- **与 dev 双报错的契合**：此项在 dev（无 CSP）与打包版同样触发，是唯一同时覆盖两种形态的机制；前提是该机 userData 里确有 playlist 数据（无法远程证实）。
- **修复草案**：`videoGetSavedPaths` 返回值附 `exists` 预检（主进程 `stat`），auto-restore 跳过不存在项并一次性 toast；或恢复加载失败（onError）时清除该 `videoLastItem` 避免下次再撞。
- **置信度**：Likely。

### R-3 `render-process-gone` 无限 reload 循环

- **位置**：`src/main/index.ts:198-203` —— 每次 `render-process-gone`（非 clean-exit）都 `webContents.reload()`，**无次数上限、无退避**；`unresponsive`（`:204-206`）仅记日志。
- **触发/后果**：若崩溃由确定性原因触发（如特定视频触发的原生解码器崩溃、GPU 驱动 TDR、OOM），reload → 同代码路径 → 再崩，形成**白屏闪烁死循环**（日志会持续增长，虽有轮转）。用户感知为"打开就报错/闪"。
- **修复草案**：崩溃计数窗口（如 5 次/60s），超限停止 reload，改为加载一个本地静态错误页（附 userData/logs 导出入口）。
- **置信度**：机制 Confirmed；作为本次事件主因 Speculative。

### R-4 零 `webglcontextlost` 监听 — GPU 丢上下文无自愈

- **事实**：全仓 `grep webglcontextlost|CONTEXT_LOST|restoreContext` 零命中。各消费方的恢复策略只有 **resize 触发 dispose+recreate**（`PreviewGrid.tsx:133-143`、`OverlayCanvas.tsx:112-124`、`Preview3D.tsx:145-152`、`EffectsView`/`ScreensaverView` 同型）。
- **触发/后果**：远程桌面会话、旧 Quadro 驱动、驱动恢复（TDR）造成的 context lost 不触发 resize → 预览画布/浮窗**永久黑帧或停帧**，无提示、无自愈；对"视频工作站"场景（重解码负载）概率上升。
- **修复草案**：每个 GL canvas 挂 `webglcontextlost`（preventDefault + 置空 renderer 引用 + 延迟 recreate）与 `webglcontextrestored`（重建 program/texture）；浮窗侧同时上报 telemetry。
- **置信度**：Confirmed（代码事实）；与本次报错的关联 Speculative。

### R-5 `SplatViewer` WebGL 构造无守卫（当前不可达，潜伏）

- **位置**：`src/renderer/src/3d/SplatViewer.tsx:226` `new THREE.WebGLRenderer({...})` 与 `:293-302` `new Viewer({...})` 均无 try/catch；WebGL 不可用/上下文数耗尽时 throw → 全局 ErrorBoundary 全屏错误页。`LEDMapper.tsx` 同 view 内。
- **现状**：唯一挂载链 `Model3DView` 被 `App.tsx:60` `MODEL3D_VIEW_ENABLED = false` 关闭 → **当前不可达**。
- **修复草案**：仿 `ScreensaverView.tsx:46-54` 的 try/catch + 降级文案；重开 Model3D 前必须补。
- **置信度**：Confirmed（代码事实 + 不可达现状）。

### R-6 ErrorBoundary 覆盖面与 boot 卡死变体

- **已确认良好**：`main.tsx:44-98` 五个窗口分支（主窗/audioviz/screensaver/snip/overlay）**全部**包 `ErrorBoundary`；App 内所有 view（含 6 个 lazy 重 chunk）都在边界内 → **lazy chunk 404/解压失败不会白屏**，会落到错误页 + Reload 按钮（`ErrorBoundary.tsx:24-54`，自包含内联样式、无 i18n 依赖，设计正确）。
- **缺口**：边界只捕 React 渲染期与同步 effect 错误。`App.tsx:363-402` boot `Promise.all` 若任一 invoke **reject**（如 main handler 抛错），不进 ErrorBoundary，只落 `unhandledrejection` console（`main.tsx:19-21`）→ `profile` 永为 null → **永远停在 boot-screen**（`App.tsx:540-546` 只渲染 `<main class="boot-screen">RGBBox</main>` 的"白屏"）。事件回调内异步 throw 同理不兜。
- **修复草案**：boot fan-out 加 `.catch`（setBootError → 渲染错误卡片 + 重试）；boot-screen 加 10s 超时提示。
- **置信度**：结构 Confirmed；卡死触发 Speculative。

### R-7 `window.rgbbox` 缺失（preload 失败/被杀软剥离）

- `App.tsx:162`（`onMainWindowVisibilityChanged`）、`:364-373`（boot fan-out 首批 9 个调用）、VideoStudioView 挂载 effect（`useVideoAudioEnhance.ts:139/148`、`useSuperres.ts:73`）均为**无可选链的同步调用** → preload 未加载时立即 TypeError → ErrorBoundary 显式报错页（不是白屏）。i18n 侧则用了 `window.rgbbox?.setUiLocale?.()`（`i18n/index.tsx`）——两种风格不一致但后果可接受。已抽检 preload 白名单：video 相关 API 全部存在（`src/preload/index.ts:96-341`）。
- **置信度**：Confirmed（机制）；preload 实际失败概率未知。

### R-8 i18n / localStorage 启动早期风险 — 已验证无问题

见「被推翻的假设/已验证无问题」。

### R-9 R292（commit 0fa0f0a）复核

- **改动面**：仅 `tests/renderer/gl/effect3dGl.test.ts`（droplet-mirror 比率阈值 2.5 → 软件 GL 2.0 分级）、`tests/renderer/gl/glHarness.ts`（新增 `isSoftwareGl`：读 `gl.RENDERER`(7937) 匹配 llvmpipe/swiftshader/software/mesa）+ 两份文档。**零生产代码**。
- **意义**：承认 Windows CI runner 的软件 GL 光栅同一签名幅度更低——纯测试阈值校准，**对非开发机生产行为无影响**；无遗漏的渲染器分支（生产从不走 headless-gl，grep 确认 `src/` 无 headless-gl 依赖，仅注释提及 R284 教训）。
- **置信度**：Confirmed（读全 diff）。

### R-10 近 8 commit 渲染层改动复核

| commit | 渲染层文件 | 结论 |
|---|---|---|
| 0fa0f0a | 仅 tests | 无生产影响（R-9） |
| 1731e55 | `useVideoAudioEnhance.ts`（+丢批 10s 滑窗遥测） | 无崩溃面；小瑕疵：`:153` `sheds === 4` 严格等于——同窗第 5+ 次丢批不再触发提示（遥测漏报，非稳定性问题） |
| 73a7083 | 无（main/denoiseService） | — |
| d531773 | `denoiseWorkletSource.ts`（`this.seq = 1` → `Date.now()%100000+1`） | worklet 内部 id 偏置，无风险 |
| bd5fd57 / a04f3e2 / 82687b7 / 6f7880e | docs/CI/截图 | 无渲染层代码 |

**结论：近期提交不构成"打开即报错"的回归源。**

---

## 对假设 ①②③ 的回应（按主审更新后优先级）

- **② 打包缺 .splat 资产 → 证伪（当前版本）**。唯一消费链 Model3DView 被 `MODEL3D_VIEW_ENABLED=false` 关闭（`App.tsx:60`）；splat 本体走 userData 运行时下载（`useModelStore.ts` 头注+MODELS_MANIFEST）；LED map JSON fetch 失败返回 null 降级（`useModelStore.ts:56-63`）。dev 也报错进一步排除资产类原因。证据强度：强。潜伏项见 R-5。
- **① GPU/WebGL 上下文失败 → 降权为次因，非"打开即报错"主因**。主链 GL 类构造（`PreviewGl/EffectGl/Effect3DGl` 的 `getContext('webgl')` null → throw）在**所有**调用点被 try/catch 降级为 console.warn + 停绘（`PreviewGrid.tsx:59-73,151-157`、`OverlayCanvas.tsx:100-104,137-141,157-162`、`Preview3D.tsx:85-97`、`EffectsView.tsx:278-283`；`ScreensaverView.tsx:46-54` 还有 2D fallback）→ 表现是黑帧不是报错页。真实 GPU 风险是 R-3（进程 gone 循环）与 R-4（context lost 无自愈）。superres 的 WebGPU 探测全 try/catch（`superres.ts:248-260`），失败仅面板内提示。证据强度：强（对"直接白屏"证伪；对"静默黑帧"成立）。
- **③ 运行时模型下载失败 → 证伪为报错主因**。`modelDownload` 失败仅置局部 `status='error'` 文案（`useSuperres.ts:108-112`、`useVideoAudioEnhance.ts:200-203`），且都需用户手动开开关才触发，与"打开即报错"不符。
- **第四候选（本审计提出，R-1+R-2 组合）**：打包版报错首选 **R-1 CSP media-src 遗漏**（打开 video view 若 videoMode=player 即报错）；**dev 报错**只能用 **R-2**（共享 userData 的 playlist 文件不可达 + 该 dev 分区 localStorage 也停在 player/LastItem）或环境类 R-3/R-4 解释。若那台机器 userData 全新（无 playlist、无 localStorage 记录），则 dev 报错最可能是 camera/screen 模式下设备枚举/开流失败显示的 streamError（`VideoStudioView.tsx:575-577,598-600`——有 try/catch，显示 "⚠ <err.message>" 而非崩溃）。建议向用户索取一次 F2 DevTools 控制台截图即可裁决 R-1/R-2。

---

## 被推翻的假设 / 已验证无问题

1. **.splat 排除导致报错**（原假设②）— 证伪：消费链被 feature flag 关闭；模型走运行时下载。
2. **WebGL 构造失败 → 白屏** — 证伪：五个消费组件全部 try/catch 降级；Screensaver 有 2D fallback。
3. **lazy chunk 404 → 白屏** — 证伪：全局 ErrorBoundary 兜住（六个窗口分支全覆盖），落到带 Reload 的错误页。
4. **i18n 缺 key 崩溃** — 证伪：`TranslationKey = keyof typeof EN` + ZH 表类型约束使缺键成为编译错误；运行时 `t()` 缺 key 返回 key 原文（`i18n/index.tsx:3985-3987`）。
5. **localStorage 不可用崩溃** — 证伪：`usePersistedState` 读写双 try/catch；`loadVideoCache/saveVideoCache`、`useRecorderDomain` 选项读取、`loadPos` 同款。理论残余：`I18nProvider`/`App.tsx:120` 直接 `localStorage.getItem` 无守卫（Electron file:// 下可用）。
6. **近 8 commit 引入渲染层崩溃** — 证伪（R-10 表）。
7. **hls.js 顶层 import 副作用** — 未发现：仅 `loadStreamUrl` 内使用。
8. **camera 模式挂载自动开流** — 证伪：`startCamera` 仅按钮触发；挂载只 `enumerateDevices`（有 catch）。
9. **VideoStudioView 挂载链同步 throw** — 未发现：`useRecorderDomain`/`usePreviewZoom`/`useSuperres`/`useVideoAudioEnhance`/`CaptureFilmstrip`/`AnnotateOverlay`（条件挂载）/`MiniPlayerCard`（条件挂载）均无渲染期 throw 路径；所有 `window.rgbbox` 调用在 preload 白名单内。
10. **R292 改了生产行为** — 证伪：纯测试阈值。

## 未验证 / 局限

- **未启动应用**（任务禁令）：R-1 的 CSP 拦截行为未实测；未复现那台机器的报错；无报错原文/截图，R-1/R-2/R-3 的取舍依赖用户侧一次 DevTools（F2）截图或 `userData/logs` 取证。
- CSP `'self'` 对 `file://` 页面 + 自定义 scheme 的匹配基于 CSP 规范与 Chromium 实现推断（Electron `registerSchemesAsPrivileged` 的 `secure:true` 不改变 CSP source matching）。
- 未追 R230 声称的 renderer console → file-logger IPC 转发链是否真的捕获 `console.error`（影响"报错可见性"判断，不影响本次结论）。
- 那台机器的 userData/localStorage/驱动状态未知，R-2/R-3 触发条件无法远程证实。
- `VideoStudioView.tsx:2000-2290`（playlist 侧栏 JSX）只做了关键模式扫描（window.rgbbox/localStorage/useEffect/new），未逐行；`visionHostMain.js`/games vision GPU delegate（线索中 gpu-fallback 键属该域）与本主题弱相关，未深查。
- `AudioStudioView` 受 R-1 同样影响（media://local 播放），未单独展开。
