# 05 主进程环境兼容性与外部 IO 审计（同程序不同电脑的行为差异）

- 日期：2026-10-24 · 审计对象：RGBBox @ HEAD 0fa0f0a（工作区 package.json 0.3.90 未提交，diff 仅版本号 0.3.86→0.3.90）
- 方法：只读代码审读 + 本机 `C:\Users\tjf\AppData\Roaming\rgbbox`（注意：小写 `rgbbox`）真实配置/日志抽样。未启动应用、未构建、未跑测试。
- 版本归属事实：故障机构建日志 v0.3.86 == HEAD 版本；`yarn dist:win` ENOENT electron.exe 已由主审定性为该机 node_modules/electron/dist 缺失的构建环境问题，本报告不重开。

---

## 摘要（Top 风险，按处置优先级）

| # | 风险 | 置信度 |
|---|------|--------|
| 1 | E-1 LAN beacon 定时器对已关 socket 每 `send` → uncaughtException 风暴，冲掉 crash 历史（本机 0.3.85 实证 20 条同秒记录，KEEP=20 恰被打满） | Confirmed（代码路径） |
| 2 | E-9 主进程 import 期加载 onnxruntime-node 失败 = initLogger 之前零日志静默闪退（"另一台电脑打不开"最强候选之一） | Confirmed（结构）/ 触发 Speculative |
| 3 | E-2 全部 5 个 3D splat 模型下载 URL 指向 404 release（新机器永久不可下载） | Confirmed（代码注释自证） |
| 4 | E-3 模型下载主通道（downloadWithProgress / RapidOCR 下载）无超时、onnx 模型 hf-mirror 单源 —— 弱网半开连接永久挂起、单点故障 | Confirmed（代码事实） |
| 5 | E-7 renderer 崩溃自动 reload 无上限/退避 → 启动即崩的机器上白屏闪烁 crash-loop | Confirmed（代码）/ 后果 Likely |
| 6 | E-16 工作档 `profile.json` 不走 R264 shape 校验（合法 JSON 形状错直通 renderer，R264 同款崩溃路径仍开着） | Likely |
| 7 | E-4 media:// 白名单盘符大小写/目录重定向敏感 → 合法媒体 403 误拒 | Likely |
| 8 | E-6 拔显示器后 overlay/audioViz/screensaver 窗口不随 display-removed 关闭（snip 有处理，其余没有） | Confirmed（代码缺失） |

---

## 发现清单

### E-1 LAN beacon 竞态 → uncaughtException 风暴（冲掉 crash 历史）
- 位置：`src/main/lanService.ts:89-101`（startDiscovery 先 `stopDiscovery()` 只 close socket）、`:103-106`（stopDiscovery **不清 beaconTimer**）、`:125-133`（beaconTimer 每 1s 闭包 `sock.send`）、`:118-136`（host 的 listening 回调异步晚到：快速 host→teardown 交错后回调仍会重建 timer/socket）。
- 触发：① host 建房后调用 `lanDiscover(true)` —— startDiscovery 的 `stopDiscovery()` 把 host 的广播 socket 关掉，而 beaconTimer 存活，闭包内 `sock.send()` 对已关 dgram socket **同步 throw `ERR_SOCKET_DGRAM_NOT_RUNNING`**（interval 回调中 = uncaughtException，每秒一条）；② 快速 host→teardown→host 交错。
- 后果：不退出进程（initCrashLogging 的 handler 吞掉），但每秒生成 crash-*.json；KEEP=20 数量轮转把此前真实崩溃记录全部挤出。**本机实证**：`logs/` 恰 20 条 2026-10-11 01:27 同秒级记录（v0.3.85，堆栈 `healthCheck … index.js:849`，当时形态；当前 HEAD 同类路径仍在）。
- 修复草案：① `stopDiscovery()` 同时 `clearInterval(this.beaconTimer)`；② beacon send 包 try-catch 或检查 socket 状态；③ host 的 listening 回调入口校验世代（teardown 已跑则放弃）。
- 置信度：**Confirmed**（当前代码路径确凿；0.3.85 记录为旁证）

### E-2 3D splat 模型下载死链（models-v1 release 404）
- 位置：`src/shared/modelsManifest.ts:47,55,63,75,84` —— 5 个条目 URL 全为 `https://github.com/tjf/RGBBox/releases/download/models-v1/…`；`:65-68` 注释自证 "the manifest URL's own release (models-v1) is 404"，并给出 hf-mirror/cakewalk 实证替代源（仅用于 pin bytes，未改 URL）。
- 触发：任何新机器（无缓存）点击 3D 模型下载。键盘/鼠标条目本无 pinned bytes（release URL dead 注释），train/garden/bicycle 有 bytes 也无备源。
- 后果：`DL_HTTP: 404` → 4 次退避重试后失败、删除半成品；该功能在全新机器上**永久不可用**。与"视频工作站报错"无关（下载是显式点击）。
- 修复草案：URL 切到注释中已实证的 hf-mirror 源；或为每个条目加 `mirrorUrl` 备源字段。
- 置信度：**Confirmed**（代码注释自证 404）

### E-3 模型下载主通道无超时 + onnx 模型单源
- 位置：`src/main/index.ts:1375-1429` `downloadWithProgress`：`httpsGet(url,{headers})` 无 `timeout` 选项、无 `req.setTimeout`，只有 `req.on('error')`；单 URL 无备源。`src/main/rapidOcrService.ts:72-95` download 同样无超时（全量 buffer 入内存，量小可接受）。
- 触发：弱网/半开连接（TCP 建立后对端不再发数据）—— 无 error 事件、无超时，Promise 永挂；hf-mirror 单点故障时 silero_vad/ast/dtln/realesr（`modelsManifest.ts:96,104,115,123,139` 全 hf-mirror 单源）全部不可下。
- 后果：进度条永久 0%，重试/报错机制（`sendProgress({error})`、throw）均无从触发；对照 lessons L3（渲染层同类问题已立过课）与 ttsService 的双源+续传+HTML 检测（`ttsService.ts:196-285`，工程质量明显更高），主通道是短板。
- 修复草案：`req.setTimeout(30_000, () => req.destroy(new Error('DL_TIMEOUT')))`；onnx 条目加 HF 官方备源（对齐 ttsService 的 mirror→official 链）。
- 置信度：**Confirmed**（无 timeout 是代码事实；挂起为 Node 标准行为）

### E-4 media:// 白名单大小写/目录重定向敏感（误拒方向，无越权风险）
- 位置：`src/main/mediaAllowlist.ts:18-40` —— `startsWith` 严格字节比较；`src/main/index.ts:1704` `resolve(filePath)` 保留传入盘符大小写。
- 触发：① 路径来源给出小写盘符（`c:\Users\…`）而 `app.getPath('music')` 返回 `C:\…` → `underRoot` 失败 → 403（renderer 均用 `encodeURIComponent(path)`，`AudioStudioView.tsx:1229` 等，path 来自 dialog 时通常大写，但拖拽/手输来源不保证）；② 企业环境 Downloads/Music/Videos 文件夹重定向（folder redirection）—— `app.getPath` 返回重定向后路径，但播放列表条目若来自其他位置仍 403；反之已知目录重定向后 `home+sep+Downloads` 不再是实际下载目录。
- 后果：合法音视频/AI8 缩略图 403 播放失败。**安全方向无虞**：不匹配一律拒绝，8.3 短名/大小写变体只会更严（误拒而非误放）；`resolveAppAssetPath`（`mediaProtocol.ts:49-60`，R296）已封段内斜杠 traversal，越权读取边界完好。
- 修复草案：win32 下对 root 与 normalized 做大小写不敏感比较（比较用 lower、打开文件用原串）。
- 置信度：**Likely**（比较逻辑事实确凿；触发依赖路径来源大小写）

### E-5 播放列表/配置存绝对路径，跨机不可移植（by design，需知悉）
- 位置：`src/main/index.ts:1432-1476`（audio/video-playlist.json 存 `{path}` 原样）；`index.ts:1707-1711`（白名单播放列表精确路径匹配，含 resolve）。
- 触发：拷贝 `config/` 到另一台机器（不同用户名/盘符/ UNC）。
- 后果：媒体条目 404/403（文件不存在）；profile `scene.displayIds` 引用对方机器不存在的 display id → `openOverlay` 找不到 display 返回 false（`overlayManager.ts:77-79`），不崩溃、灯效不开。UNC 播放列表文件本身能被放行（resolve 后 `\\server\share` 前缀逻辑不受影响，playlistPaths 精确匹配命中）。
- 修复草案：迁移时对失效条目给 UI 标记（renderer 侧，未审）。
- 置信度：**Confirmed**（持久化格式事实）

### E-6 display-removed 不清理 overlay/audioViz/screensaver 窗口
- 位置：`src/main/index.ts:1819-1825` 只 `notifyTopologyChanged`；`overlayManager.ts`、`screensaverManager.ts` 均无 `screen.on('display-removed')` 处理；对照 `snipManager.ts:93-105` 有完整处理（会话作废+池重建）。
- 触发：overlay/屏保开着时拔掉对应显示器（或投影仪断开 —— 演示场景常见）。
- 后果：Windows 把全屏置顶窗口搬到剩余显示器（或残留在负坐标），以 screen-saver 级 alwaysOnTop 盖住正在用的屏；有 ESC 可退（`overlayManager.ts:145-153`）但主进程不会主动收。DPI/分辨率变化（display-metrics-changed）同理：overlay bounds 不重建（reopenOverlay 只由 renderer 主动触发）。
- 修复草案：display-removed/metrics-changed 时对 map 中已不存在的 displayId 调 closeOverlay/closeAudioVizWindow（复用 snipManager 模式）。
- 置信度：**Confirmed**（代码缺失）；窗口搬移行为为 Windows 标准行为

### E-7 renderer 崩溃自动 reload 无上限/退避
- 位置：`src/main/index.ts:198-203`（render-process-gone → 非 clean-exit 即 `reload()`，无计数/退避/用户提示）。
- 触发：渲染进程启动即崩（GPU/驱动异常 —— "视频工作站打开页面报错"候选路径之一：该机日志/报错原文缺失，无法归因，此处只确认机制）。
- 后果：白屏闪烁 crash-loop，每轮一条 `log.error`，Crashpad dump 持续落盘但用户无感知提示。
- 修复草案：60s 窗口内连续 ≥3 次 gone 则停止 reload，加载本地 error 页并指路 `userData/logs/Crashpad`。
- 置信度：代码事实 **Confirmed**；crash-loop 实际发生 Likely（依赖未知根因）

### E-8 crash 记录 20 条数量上限被风暴击穿（与 E-1 复合）
- 位置：`src/main/crashLog.ts:16` `KEEP=20`、`rotate()` 保留 newest。
- 证据：本机 `logs/` 恰 20 条同一秒内的 uncaughtException 记录 —— 历史真实崩溃记录已被挤出。
- 后果：远程排障时（正是"另一台电脑报错"场景）最有价值的 crash 历史可能已被风暴冲掉。
- 修复草案：同 message 折叠加计数（5 分钟窗口 1 条 + `count:n`）；或按字节预算轮转。
- 置信度：**Confirmed**（实证文件）

### E-9 主进程 import 期 native 加载失败 = 零日志静默闪退
- 位置：`src/main/index.ts:49` 顶层 `import { initAudioAi … } from './audioAiService'` → `audioAiService.ts:14` 顶层 `import * as ort from 'onnxruntime-node'`（native）。而 logger 在 `index.ts:58` 才初始化 —— ESM import 先于任何模块体执行。
- 触发：打包版 onnxruntime `.node` 损坏/被杀软隔离/`scripts/afterPack.mjs` 按 napi 目录裁剪与未来版本不匹配。
- 后果：主进程启动即 throw、零日志、无窗口 —— 用户视角"双击没反应/打不开"。与故障机 electron.exe 缺失同族但不同层；也是排查"另一台电脑打不开"时应先看的事件查看器/缺 DLL 项。
- 修复草案：`audioAiService` 的 ort 改懒 require（对齐 `rapidOcrService` 经 `index.ts:357` dynamic import 的既有模式）；或 main 入口最外层 try/catch 写 Windows 事件日志。
- 置信度：依赖链 **Confirmed**；触发条件本身 Speculative

### E-10 OCR 双引擎离线可用性（总体无问题，含边界）
- `src/main/rapidOcrService.ts:59-67`：packaged → `process.resourcesPath/rapidocr`（extraResources：`build/rapidocr` 存在 3 文件已核实）；`:101-147` sha256 校验、损坏自动切 userData 下载（modelscope.cn，带 UA 防 403，`:70`）；`ocrService.ts:127-160` WinRT 回退（PowerShell + BOM + GBK 已防、中文临时路径双保险 `:151-157`），Server/无语言包 → `RGBBOX_OCR_ERR:nolangpack` 码值而非异常。
- 边界：完全离线 + resources 被破坏 → 双引擎均不可用（有码值反馈）。**打包版正常离线机器 OCR 完全可用。**
- 置信度：**Confirmed**

### E-11 safeStorage/凭据跨机（已验证无问题）
- `aiSecretCodec.ts:18-25` 解密失败 → `''`；`index.ts:443-454` 标记 unreadableIds、`aiProfileStore.ts:88-110` `mergePreservedKeys` 恢复原密文（不误清）；`ai8Credentials.ts:22-31` 解不出 → null → `no-credentials`；`index.ts:499` `keyUnreadable`/`encryptionAvailable` 回传渲染层。跨机拷 system.json / 换 Windows 账户：不崩溃、不清空、有标记。明文回退仅 console.warn（`index.ts:518-520`）。
- 置信度：**Confirmed**（代码路径完整）

### E-12 utilityProcess（denoise）打包路径与近期 commit（无问题）
- `denoiseService.ts:59` `fork(join(__dirname,'denoiseProcessor.js'))` 与实际产物 `out/main/denoiseProcessor.js`（本机 out/ 核实）一致；文件头注释写 `.mjs` 是陈旧注释，非缺陷。模型缺失 → `{ok:false, missing}` 引导下载（`:96-97`）；fork/exit 非 0 → fail 上抛（`:71-74`）。
- 近 4 个 denoise commit 复核（73a7083/1731e55/d531773 + c6d1842）：纯并发共享/背压/重同步逻辑，**未引入新路径/平台/环境假设**。慢 CPU 机器过载 → 队列帽 4 丢新 + `DENOISE_OVERLOAD` 遥测（`denoiseProcessor.ts:90-121`），是环境差异下的正确降级。
- 置信度：**Confirmed**

### E-13 LAN 广播发现对网络形态敏感（设计内兜底，噪音小瑕）
- `lanService.ts:131-132` beacon 发 `255.255.255.255` + 回环；多网卡/VPN-only/域防火墙环境广播不可达 → 发现列表空 → 手输 IP join 兜底（`:145+`）。无广播能力接口上 send 错误仅 `console.info`（`:122`），不写文件日志（排障时 LAN 问题在 rgbbox.log 不可见）。
- 置信度：**Likely**

### E-14 带空格/中文/非系统盘安装路径（已验证无问题）
- 全部资源定位走 `join(__dirname, …)` 相对路径（`index.ts:166,281`、`overlayManager.ts:116,159`、`screensaverManager.ts:136,172`、`denoiseService.ts:59`）；icon/rapidocr 打包分支 `process.resourcesPath`（`index.ts:268-276,1577-1581`、`rapidOcrService.ts:59-67`）。`app.isPackaged` 共 5 处（index×2/overlay/rapidOcr/screensaver）+ `isDevelopment` 轴（`ELECTRON_RENDERER_URL`）双轴一致，`yarn preview`（isPackaged=false + 无 ELECTRON_RENDERER_URL）落 loadFile 分支亦正确。media:// `?p=` 参数 `encodeURIComponent` 承载中文路径（renderer 8 处实证）。
- 置信度：**Confirmed**

### E-15 单实例锁/自启/热键（多用户服务器无问题）
- `index.ts:66-80` 单实例锁（`--perf-selftest` 豁免；锁为 per-user，终端服务器多用户互不干扰）；`index.ts:304-309` `setLoginItemSettings`（HKCU per-user）；全局热键被占 → 保留原键 + 托盘气泡降级（`index.ts:399-411,1789-1793`）。
- 置信度：**Confirmed**

### E-16 工作档 profile.json 缺 shape 校验（R264 覆盖缺口）
- 位置：`src/main/profileStore.ts:18-26` `loadProfile` 仅 spread 合并（坏 JSON 回 default ✅），但**不走** `normalizeProfile`（R264 只接了 `loadProfileById:207-218` 与 `importProfile:170-182`）。
- 触发：`profile.json` 被外部编辑/半迁移成"合法 JSON 但形状错"（`scenes: []`、scene 缺 layers 等 —— R264 注释自述的崩溃形态）。
- 后果：直通 renderer → `activeLayer()/activeScene()` 崩 → ErrorBoundary（"打开页面报错"候选之一；新机器手搬配置正是高发场景）。
- 修复草案：`loadProfile` 也过 `normalizeProfile`，null 回 `defaultProfile`。
- 置信度：缺口 **Confirmed**；实际触发 **Likely**

### E-17 其余核对点（简记）
- `getDisplayTopology`（`displayTopology.ts:40-58`）纯快照、0 显示器时 virtualBounds 宽高 0 → `captureVirtualScreenFrame` 返回 null（`screenCapture.ts:86`），无捕获源/权限拒绝路径均返回 null 不 throw（`screenCapture.ts:56,74-76`）；dxgi/sck 为 stub（`captureProviders/dxgiProvider.ts`），实际恒走 desktopCapturer + 崩溃自动回落（`captureProviders/index.ts:53-64`）—— 远程桌面会话下 desktopCapturer 可用性依赖 OS，失败表现为采样帧 null（灯效静默无联动，无错误提示），属已知降级形态。
- crashReporter：`crashLog.ts:28` `uploadToServer:false`，dump 落 `userData/logs/Crashpad`（本机存在）；无网络外发。
- 日志编码：logger 强制 UTF-8 落盘（`shared/logger.ts`），规避 GBK 终端 mojibake（R53.8 注释）；但 `lanService`/`ai8` 若干 console.info/warn 只进 stdout，打包版无控制台即丢失 —— 排障盲区。
- `getDesktopAudioSourceId`（`index.ts:1177-1180`）无屏幕源时返回 null（回退链在 renderer，未审）。

---

## 离线 / 弱网机器功能生死表

| 功能 | 需联网? | 失败表现（新机器首用） | 降级方案 |
|---|---|---|---|
| 核心灯效/预览/overlay/多屏 | 否 | — | 完全离线可用（启动路径零联网：whenReady 全本地） |
| 屏幕采样（灯效联动）/截图/窗口截图 | 否 | 远程桌面/无源时采样帧 null | 静默无联动（无提示） |
| OCR | 否（打包版内置 RapidOCR） | resources 被破坏+离线 → `nolangpack`/`engine` 码 | WinRT 回退；码值反馈不崩溃 |
| TTS（Kokoro/Piper） | 首次下载（~293MB/63MB） | `model-not-ready` | 双源+断点续传+重试（工程最完善）；离线新机不可用 |
| DTLN 降噪 | 首次下载 dtln_1/2（hf-mirror 单源） | `{ok:false, missing}` 引导下载 | E-3 修复前弱网挂起风险 |
| VAD/AST 音频 AI | 首次下载（hf-mirror 单源） | `not-downloaded` hint | 同上 |
| 3D splat 模型 ×5 | 名义可下载 | **404 死链，永久不可用**（E-2） | 无（需修 URL） |
| 超分 realesr | 首次下载（hf-mirror 单源） | 同模型下载 | 同 E-3 |
| AI 整理/翻译/agent/聊天 | 需用户自配端点 | `nokey`/`auth`/`http` hint（30s 超时 ✅） | 不配置即不可用，无隐性请求 |
| AI8 全家（登录/绘图/视频） | 需 ai8.rcouyi.com | 15s 超时（R308 ✅）；自动登录 `network` reason | 离线即整板块不可用 |
| LAN 联机 | 需局域网 UDP 53891/TCP | 广播不可达 → 列表空 | 手输 IP 直连兜底 |
| 启动本身 | 否 | — | 无启动网络探测，离线机启动干净 |

---

## 被推翻的假设 / 已验证无问题

1. **"视频工作站报错可能与联网下载有关"——基本证伪**：启动路径零联网（whenReady 内无任何 fetch/getSources 前置网络调用），模型下载均为显式点击。renderer 启动即错更可能落在 GPU/渲染层/崩溃恢复机制（E-7 reload 循环、E-16 profile 形状）——无报错原文，不能定性，列为候选而非结论。
2. **"旧版本 profile/损坏 JSON 在新机器会出事"——证伪（named slots/import/playlist/system.json 全链有防御）**：R221.1 原子写+`preserveBadFile`、R264 `normalizeProfile` 校验+迁移、R267 串行队列；坏文件回默认且不回空覆盖。本机真实 `system.json`（含 4 个 AI 画像、enc:v1 密文）、`profile.json`（v0.3.x 老档含 `_savedAt`）、双 playlist 与 schema 假设一致。**唯一缺口是工作档 loadProfile（E-16）。**
3. **"带空格/中文/非系统盘安装目录会挂"——证伪**（E-14）。
4. **"safeStorage 换机/换账户解密失败会崩溃或清密钥"——证伪**（E-11，密文保留+标记）。
5. **"denoise 近期 commit 引入新环境假设"——证伪**（E-12，diff 纯并发/背压）。
6. **"media:// 有越权读取边界问题"——未发现**：白名单方向过严（误拒而非误放），traversal 已由 R296 封死；剩余是功能性问题（E-4/E-5）。
7. **"单实例锁/自启在服务器多用户环境不兼容"——证伪**（E-15）。
8. **RapidOCR 打包路径 dev/packaged 分支遗漏——无**：`resolveRapidOcrDir`（rapidOcrService.ts:59-67）双分支+损坏自愈；build/rapidocr 资产在库。

## 未验证 / 局限

- 遵守约束未启动应用：所有"行为"结论 = 代码审读 + 本机静态证据（userData 只读抽样）；E-1 竞态时序、E-4 大小写 403 未实际复现（代码路径确凿）。
- 故障机（Windows Server 2022 构建失败 + 视频工作站"打开页面报错"）无报错原文/日志可取，E-7/E-9/E-16 仅为其候选机制，非归因。
- renderer 侧（displayIds 失效的 UI 反馈、keyUnreadable 提示、播放列表失效提示、GPU/软件 GL 签名阈值 R292）不在本次主进程 IO 范围，未审。
- Crashpad dump 的数量/大小保留策略（Electron 内建默认）未深查。
- `hooks/domains`、`lanProtocol` 帧协议细节、agentService 工作区文件操作面未展开（非本次主题）。
