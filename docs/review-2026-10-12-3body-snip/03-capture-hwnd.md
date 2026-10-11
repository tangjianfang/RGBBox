# 分报告 03 · 按窗口句柄截图（capture by HWND）评审

- 仓库：`C:\tjf\github\RGBBox`（branch main @ 5b861c8，只读评审，未跑任何 electron/scripts）
- 用户诉求原文：「截图功能还需要增加按照根据窗口句柄开始截图的功能」
- Electron 版本依据：**41.4.0**（`package.json:69`）。Electron API 行为引用官方 master 文档（41 系语义）。
- 置信度标注：Confirmed（读码/官方文档直证）/ Likely（强佐证未真机复测）/ Speculative（推理，未验证）。

---

## 1. 现状走查

### 1.1 snipManager 的截图链路（Confirmed，逐行读码）

| 环节 | 实现 | 位置 |
|---|---|---|
| 触发 | 托盘「截图」项 + 全局热键（默认 `Alt+A`，预设白名单） | `src/main/index.ts:1589`、`src/main/snipManager.ts:21,392-428` |
| 冻结帧来源 | `desktopCapturer.getSources({ types: ['screen'], thumbnailSize: 各屏物理像素最大值 })` —— **无 BitBlt、无 webContents.capturePage、无原生调用**；全屏冻结帧就是 screen source 的 thumbnail，注释明言「小屏返回原生分辨率（Chromium 不放大）」 | `src/main/snipManager.ts:229-233` |
| Windows stall 防护 | `getSourcesWithRetry`：3s 超时 × 3 次（注释：销毁窗口后立刻再捕获实测 stall 51s）——**模块私有函数，未导出** | `src/main/snipManager.ts:210-223` |
| 帧投递 | `nativeImage.toBitmap()`（BGRA）直传 `SnipPushFrame { width, height, data: Uint8Array }`，走 `snipPushFrame` 通道；渲染端 `swapBgraToRgba` → `putImageData` → 回 `snipFramePainted` ack → 主进程才 `show()` 窗口（「窗口出现 = 画面就绪」） | `snipManager.ts:271-287`、`src/shared/types.ts:535-541`、`src/renderer/src/components/SnipView.tsx:46-64`、`src/renderer/src/components/video/frameCapture.ts:57-66` |
| 落档 | `finishSnip(dataUrl,'copy'|'save')` → 剪贴板 + `deps.addPng(dataUrl, 'annotated')`；deps 在 `index.ts:345` 接到 `captureStore.addPng`。**注意：snip 落档 kind 恒为 `'annotated'`，`'snip'` 值目前无任何写入方**（grep 证实） | `snipManager.ts:310-321`、`index.ts:344-345` |
| 失败反馈 | 会话启动失败（`pairs.size===0`）仅 log + `return false`，**无任何用户可见提示**（既有缺口，新功能别复制） | `snipManager.ts:236-239` |
| 预热 | 空闲 3s 用 1×1 thumbnail 预热捕获栈；注释自证 Windows 上初始化的是 **WGC/DXGI**（~150-700ms）+ 每屏隐藏预载窗池 | `snipManager.ts:367-390` |
| 已知边界 | secure desktop（锁屏/UAC）截不到 → 黑帧，ESC 可退 | `snipManager.ts:11` |

### 1.2 capture:get-sources 的消费方（Confirmed）

- 通道 `getCaptureSources: 'rgbbox:video:capture-sources'`（`src/shared/ipc.ts:69`），主进程 handler：`desktopCapturer.getSources({ types, thumbnailSize: {320,180}, fetchWindowIcons: true })`，`id.startsWith('window:')` 区分类型，缩略图转 dataURL（`src/main/index.ts:1176-1193`）。
- **唯一消费者是 VideoStudioView**（`src/renderer/src/components/VideoStudioView.tsx:588-598` `refreshSources`）：320×180 缩略图 + appIcon 渲染源选择卡片（`:1959-1973`）→ 点卡片后 `selectCaptureSource(sourceId)` → `navigator.mediaDevices.getDisplayMedia()` 起直播流（`:600-614`），legacy `chromeMediaSourceId` 兜底（`:617-628`）；主进程 `setDisplayMediaRequestHandler` 按 `pendingCaptureSourceId` 命中回源（`index.ts:1639-1662`，`useSystemPicker:false`）。
- 流的静态化出口已存在：`capturePhoto` 从 video 元素按 `videoWidth/videoHeight` 原生像素抓帧 → `capturesAdd(url,'photo')`（`VideoStudioView.tsx:648-673`）。**即「路线 B」今天已是 Video Studio 的活体功能**。
- 灯效采样的 captureProviders 抽象（`src/main/captureProviders/`）是 screen-only（`desktopCaptureProvider.ts:22`）的引擎帧采样，与本功能无关，勿混入。

### 1.3 captureStore（Confirmed）

- `<userData>/captures/*.png + index.json`，MAX 200 条 FIFO，只收 `data:image/png;base64,` ≤30MB（`src/main/captureStore.ts:26-28,56-67`）。
- kind 枚举：`'photo' | 'snip' | 'annotated' | 'imported'`（`src/shared/types.ts:389`）。`parseIndex` 只校验 kind 是 string（`captureStore.ts:35-44`）→ **新增 kind 值向前兼容**；CaptureFilmstrip 不按 kind 分支（grep 无消费点）。
- 内部已有 `addBuffer(buf, kind, name)`（`captureStore.ts:104-114`）可直接写 PNG buffer，**绕过 dataURL base64 +33% 膨胀**——目前未对外导出，是现成的接入点。

---

## 2. 三路线对比（win32 静态截一窗）

| 维度 | A：getSources thumbnail 原生尺寸 | B：getDisplayMedia 窗口流 + canvas 抓帧 | C：主进程 PrintWindow(HWND, 3) |
|---|---|---|---|
| 形态 | 主进程一次 `getSources({types:['window'], thumbnailSize:≥窗物理尺寸})`，取命中源 thumbnail | 渲染层起 60fps 流，video 就绪后抓帧（VideoStudio 现行做法） | koffi/FFI 调 user32 `PrintWindow`，自建 mem DC |
| 分辨率保真 | thumbnailSize ≥ 窗物理尺寸即原生像素；仓库先例（screen 同法，`snipManager.ts:229-233`）；官方文档只承诺 "should be scaled to"（Likely） | 流即窗口原生像素，`videoWidth/videoHeight` 抓帧（Confirmed，`VideoStudioView.tsx:649-661`） | GetWindowRect/GetClientRect 物理像素（Electron 主进程 per-monitor DPI aware）→ CompatibleBitmap（Likely） |
| 单次成本 | **API 无按源单捕：一次调用对全部窗口按同一 thumbnailSize 出图**（Confirmed，options 作用于整个调用）→ 全窗原生采集，窗口多时内存/耗时放大；封顶策略必需 | 起停一条 WGC 流 + 等首帧（数百 ms），单帧成本最重，但全链路代码已存在（增量≈0） | 单窗精确一捕，成本最低；但 FFI 失败码/崩溃面自担 |
| 最小化窗口 | 黑帧/空 thumbnail（Likely；社区一致 + Electron #44504 一类 empty thumbnail 报告） | WGC 对最小化窗冻帧/黑帧（Speculative，未真机验证） | 最小化窗 rect 变 iconic(-32000)，直截不可用；可先 `SW_RESTORE` 再截（侵入桌面，需产品决策）（Likely） |
| 被遮挡窗口 | 可截（DWM 组合内容，Likely） | 可截 | 可截（PrintWindow 直渲染，Confirmed——memory 教训语境） |
| WCO/UWP/GPU 窗 | Chromium 窗口采集含 DComp 处理，一般不黑；个别窗口仍 empty（Likely→#44504） | Chromium getDisplayMedia 采集器，GPU 窗正确流化（本仓注释背书 `index.ts:1639-1644`） | `PW_RENDERFULLCONTENT` 正面解决（memory 教训；Chromium 自身即用 `PW_CLIENTONLY|PW_RENDERFULLCONTENT`，chromium.googlesource 佐证） |
| 多屏 DPI | thumbnail 为窗口物理像素，天然按窗所在屏 DPR（Likely） | 同左 | 需自处理 per-monitor DPI（物理像素下自然成立，Likely） |
| 权限 | win32 无；macOS 10.15+ 需屏幕录制授权（官方文档 Confirmed） | 同 A | win32 无；**仅 Windows 存在，mac 需另走 SCK** |
| 依赖/体积 | **零新增** | 零新增 | koffi（预编译 FFI，约几 MB）+ `asarUnpack` 打包面（`package.json:94-97` 有 onnxruntime 先例）。注：项目**并非零原生依赖**（见 §7） |
| R112.3 stall | 继承 desktopCapturer stall 风险 → 必须复用 `getSourcesWithRetry` 模式（`snipManager.ts:210-223`，现为私有） | 同样要经 getSources（枚举+handler），但 VideoStudio 路径已在用 | 无 getSources 环节（HWND 直调）；枚举仍需 getSources 或 EnumWindows |
| 与 snip 管线接入成本 | 低：新 handler + `nativeImage.toPNG()` → `addBuffer` 直落档 | 极低（=现状）但语义是「直播暂停帧」非「立即静态捕获」，且产物先过渲染层 | 中：BGRA buffer 与 `SnipPushFrame` 帧格式完全同构（`types.ts:535-541`），可直接推 SnipView 标注 |
| 跨平台 | 同一 API 语义（mac=CGWindowID 源；Linux PipeWire 仅单源，官方文档 Confirmed） | 同左 | Windows-only，需 platform gate |

**结论：推荐 A 为主线**（零依赖、主进程直出、原生分辨率、与 screen 冻结帧同族语义）；C 留作 win32 二期精修（救最小化/WCO 特例），**不做默认**；B 已存在，不重复建设，但需处理与 VideoStudio「拍此窗口」的双入口语义（见 §4.6）。

---

## 3. 窗口句柄语义与交互

- **source id ↔ HWND**：Windows 上窗口源 id 形如 `window:<十进制HWND>:0`（Chromium `DesktopMediaID` 直接拿 HWND 当窗口 id；StackOverflow 佐证 + 本仓已依赖 `window:` 前缀判型 `index.ts:1188`）。这是**平台实现细节而非官方承诺**（Likely）；mac 上同位是 CGWindowID，Linux 是 X11 window id。
- **HWND 会被 OS 复用**、窗口关闭后 id 即陈旧 → sourceId 必须「枚举即用即弃」，任何持久化（记住上次窗口）都要按 title+pid 辅助校验，不能裸存 id（设计约束）。
- **用户意图判定**：输入 HWND 数值对终端用户不可发现、不可校验（需要 Spy++），几乎不可能是一般用户诉求；「在窗口列表里选一个」覆盖实际场景。用户说的「按窗口句柄」≈「按窗口（而不是全屏/选区）」。
- **交互建议**：窗口选择器列表（复用 `getCaptureSources` 的 320×180 缩略图 + appIcon，`VideoStudioView.tsx:1959-1973` 现成卡片样式）+ 按 title 搜索过滤 + 实时预览（列表本身即预览，无需再起流）+「截此窗口」按钮；最小化项置灰标注「已最小化，无法截取」。HWND/`window:` id 输入框只作为开发者向折叠项，不做主入口。

---

## 4. 推荐路线（A）接入设计

### 4.1 流程（单 PRD 条款，建议编号顺延 ≥R289，遵循 CLAUDE.md 单 PRD 铁律）

托盘「窗口截图」/ VideoStudio 源卡片「拍一帧」→ 打开窗口选择器（主窗口内面板）→ 用户点选 → IPC `snipCaptureWindow(sourceId)` → 主进程 `getSourcesWithRetry({types:['window'], thumbnailSize: 封顶值})` → 按 id 命中 → `thumbnail.isEmpty()` 判失败 → `toPNG()` → `captureStore.addBuffer`（新增公开方法）+ `clipboard.writeImage` → 返回 entry → 渲染层 toast + 刷新 filmstrip。

### 4.2 新 IPC 通道（入 `src/shared/ipc.ts`，命名中性不绑 HWND，跨平台不堵死）

```ts
// 建议仅 1 条新通道；枚举复用既有 getCaptureSources
snipCaptureWindow: 'rgbbox:snip:capture-window',
// 入参 sourceId: string；出参 { ok: true; entry: CaptureEntry } | { ok: false; code: 'not-found' | 'empty' | 'stall' | 'denied' }
```

- preload 白名单桥同步暴露（模式同 `src/preload/index.ts:93-96,195-198`）。
- `'denied'` 码预留给 macOS SCK（`systemPreferences.getMediaAccessStatus`），win32 永不返回；Linux PipeWire 单源限制（官方文档 Confirmed）在 UI 层降级说明即可，通道语义不变。

### 4.3 模块职责划分

- 新模块 `src/main/windowSnip.ts`：枚举封顶、捕获、失败码、落档、剪贴板。**不要塞进 snipManager 的会话状态机**（那是冻结帧全屏会话，状态耦合 sessionActive/窗口池）；也尽量不动 `index.ts`（P0/P1 已审集中点）——只在 handler 注册区加一条接线。
- 复用 `getSourcesWithRetry`：从 `snipManager.ts:212` 导出（export），别复制——R112.3 的 51s stall 教训必须单点维护。
- thumbnailSize 封顶：建议 `{width: 3840, height: 2160}` 常量（覆盖 4K 窗；8K 窗截到 4K 上限属可接受降级，注释明示）。
- **P1（可选二期）并入标注器**：把窗口位图当一帧 `SnipPushFrame` 推给单窗 SnipView（帧格式同构，`swapBgraToRgba` 直接可用）；需给 `createSnipWindow` 加「按帧尺寸建窗」变体（现按 display bounds 建窗，`snipManager.ts:136-137`），改动中等，建议独立小条款。

### 4.4 captureStore 落档

- 导出 `addPngBuffer(buf: Buffer, kind, name)`：内部即现有 `addBuffer`（`captureStore.ts:104-114`），避免 dataURL 编码膨胀；`nativeImage.toPNG()` 保证合法 PNG 字节。
- kind：**建议新增 `'window'`** 加入联合类型（`src/shared/types.ts:389`）。兼容性已验证：`parseIndex` 只查 string（`captureStore.ts:39`），旧索引/旧版本读新条目均安全；`'snip'` 值目前无人写入（见 §7），复用它也可——二选一，推荐 `'window'`（来源可追溯）。

### 4.5 与热键/冻结帧的合并点

- 「窗口模式」作为 snip 家族的第二入口（托盘子菜单：截图 / 窗口截图），**不动** Alt+A 热键与 `shared/snipHotkeys.ts` 预设白名单（扩热键=行为变更，若要另立条款明示）。
- 窗口模式**不走全屏冻结帧会话**（无需盖屏），直接选择器→落档，天然避开 sessionActive/窗口池/Esc 逻辑的全部耦合。

### 4.6 与 VideoStudio 的去重

VideoStudio 的窗口流 + capturePhoto 已能「选窗口→存照片」（Confirmed §1.2）。新入口必须在 UI 上与其分工清晰（如 VideoStudio=直播/录像，snip 窗口模式=即拍静态档），或在同一 R-N 里把 VideoStudio 源卡片加「拍一帧（静态原生）」按钮复用 `snipCaptureWindow`，避免两套窗口捕获语义漂移。

---

## 5. 风险清单

| # | 风险 | 影响 | 缓解 | 置信度 |
|---|---|---|---|---|
| 1 | 最小化窗口 → 黑/空图 | 落黑档/用户困惑 | 选择器置灰最小化项；捕获后 `isEmpty()` 判定返回 `empty`，绝不落档 | Likely |
| 2 | 被遮挡窗口 | 预期可截（卖点） | A/C 均支持；验收覆盖 | Likely/Confirmed(C) |
| 3 | UWP/WCO/个别窗口 empty thumbnail（Electron #44504） | 截不出 | `empty` 码 + toast 提示换路（二期 C 路线 `PW_RENDERFULLCONTENT` 兜底） | Likely |
| 4 | desktopCapturer stall（R112.3：51s） | 卡死无反馈 | 复用 `getSourcesWithRetry`（3s×3）→ `stall` 码 + toast；全链路 log 走 `Snip` 标签 | Confirmed（历史事实） |
| 5 | sourceId 陈旧/HWND 复用（窗口已关） | 截错窗/找不到 | 即用即弃，命中失败返回 `not-found` | Confirmed（设计约束） |
| 6 | 自家窗口混入列表（主窗/浮窗/视频预览窗） | 自捕获循环/无意义项 | 按标题 + `getNativeWindowHandle` 对比过滤自家窗口 | Likely |
| 7 | 全窗口原生 thumbnail 内存峰值（N 窗 × 4K × 4B 瞬时数百 MB） | 内存尖峰/卡顿 | thumbnailSize 3840 封顶 + 捕获后立即释放引用；实测记录进 R-N 证据 | Likely |
| 8 | secure desktop（锁屏/UAC）黑帧 | 已知边界 | 沿用 snip 结论（`snipManager.ts:11`），窗口模式同边界，文档化即可 | Confirmed |
| 9 | macOS 权限（SCK）/Linux PipeWire 单源 | 跨平台语义 | 通道用 sourceId 不用 HWND；`denied` 码预留；Linux 降级说明 | Confirmed（官方文档） |
| 10 | `index.ts` 为 P0/P1 已审集中点 | 「顺手」重构风险 | 接线收敛到 handler 注册区一处；逻辑全进新模块 | Confirmed（CLAUDE.md） |

---

## 6. 验收标准草案（真机 win32，Electron 41.4.0，逐条可断言）

1. 记事本窗口在 150% DPI 屏：截出 PNG 的像素尺寸 == 该窗口**物理像素尺寸**（DIP×1.5；A 路线为全窗含标题栏，断言按全窗写；若验收要求客户区，需注明与路线差异）。
2. 用另一普通窗口完全遮挡记事本后截图：内容完整、非黑帧。
3. 最小化记事本后在其置灰项强制触发（或直接调 IPC）：返回 `{ok:false,code:'empty'}` + toast，captures 目录无新文件、index.json 不变。
4. 对 WCO/自绘标题栏应用（Win11 记事本/Windows Terminal）截图：标题栏与内容均非黑块（memory `PrintWindow(3)` 教训的回归点，A 路线验证）。
5. 关闭目标窗口后在已打开选择器点该项：`not-found` toast，无崩溃、无残留。
6. 成功路径：filmstrip 出现 kind=`window` 条目、剪贴板粘贴同图、既有 12 条条目完好、`index.json` 可被旧版 parse（向前兼容断言）。
7. 连续触发 10 次窗口截图：无 >3s 单次等待（重试机制生效），主进程日志含 `Snip` 标签耗时记录。
8. UWP（设置/计算器）：可列出、可截、非黑帧。
9. （若本 R-N 含 mac 范围）未授权时返回 `denied` 而非黑图。

---

## 7. 被推翻的假设 / 已验证无问题 / 未验证项

**被推翻的假设：**
- 「项目零原生依赖现状」——不成立：`onnxruntime-node`、`piper-phonemize` 已是 dependencies（`package.json:50-56`），且 `build.asarUnpack` 已有原生模块打包先例（`package.json:94-97`）。C 路线（koffi）不是首例，破坏性比预设小；但仍新增打包面与平台绑定，维持「不做默认」的推荐。
- 「snip 落档 kind='snip'」——实际恒为 `'annotated'`（`snipManager.ts:315`）；`'snip'` 枚举值当前无人写入，新功能占用或新增 `'window'` 均无冲突。
- 「窗口枚举只用于缩略图」——VideoStudio 已把它作为直播流入口（§1.2），B 路线是现存事实而非新选项；新功能必须处理与其的双入口语义（§4.6）。
- 「desktopCapturer thumbnail 有原生分辨率保证」——官方文档只承诺 "should be scaled to"（Electron master docs）；「不放大、原生直出」是仓库在 screen 路径上的实证经验（`snipManager.ts:229` 注释），窗口路径需真机复验（验收 1 覆盖）。

**已验证无问题：**
- captureStore 对新 kind 值向前兼容（`parseIndex` 仅查 string，`captureStore.ts:35-44`）；CaptureFilmstrip 不按 kind 分支。
- 内部 `addBuffer` 可承载 PNG buffer 直落档（`captureStore.ts:104-114`）。
- `SnipPushFrame` 帧格式与 A/C 两路线产物同构，二期并入标注器无格式障碍（`types.ts:535-541` + `frameCapture.ts:57-66`）。
- preload 桥三处扩展点（`ipc.ts` / `preload` / `index.ts` handler）模式清晰，通道命名空间 `rgbbox:snip:*` 空闲。

**未验证项（Speculative，真机待验）：**
- A 路线 thumbnail 对最小化窗口在本机（Win11 26200）的具体表现（黑帧 vs 空图）与 Win11 24H2+ WGC 最小化行为。
- 单次全窗口原生 thumbnail 采集的实测耗时与内存峰值（决定封顶值是否需要下调）。
- PrintWindow 对最小化窗口的 iconic 坐标行为及 `SW_RESTORE` 恢复方案的侵入度（仅二期 C 需要）。
- `window:HWND:0` 中 HWND 段的进制（十进制为社区共识，未在本机解析验证——若二期 C 依赖它，先真机打印 id 对照 Spy++）。

**外部依据（Electron/Win32 语义）：**
- Electron 官方 desktopCapturer 文档（master，41 系）：thumbnailSize 语义 / 0 尺寸省略 thumbnail / macOS 10.15+ 授权 / Linux PipeWire 单源 — https://www.electronjs.org/docs/latest/api/desktop-capturer
- source id ↔ HWND（Windows）：https://stackoverflow.com/questions/58453942/get-hwnd-from-electron-desktopcapturer-source-id
- 空缩略图实例：https://github.com/electron/electron/issues/44504
- Chromium 使用 `PW_CLIENTONLY | PW_RENDERFULLCONTENT`：chromium.googlesource.com `gpu/ipc/service/direct_composition_surface_win_unittest.cc`
- 本仓 memory 教训：WCO 等原生控件区域截图需 `PrintWindow` 带标志 3（PW_CLIENTONLY|PW_RENDERFULLCONTENT）
