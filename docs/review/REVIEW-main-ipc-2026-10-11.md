# 深度 Review — 主进程 + preload 桥 + IPC 通道层（2026-10-11）

范围：`src/main/index.ts`（1833 行）、`src/preload/index.ts`（405 行）、`src/shared/ipc.ts`（138 通道）、`src/main/{atomicJson,lanService,audioAiService,permissionGate,systemSettingsStore,profileStore,mediaProtocol}.ts`、`tests/main/`（39 文件）+ `tests/preload/` + `tests/integration/`。
方法：只读代码 + grep 差距审计 + 通道三方 diff（脚本比对 ipc.ts↔preload↔main）；未跑测试/构建。已知立案不重复：R264（Profile 导入校验）、workspace review U2（overlay 开关结果被渲染层忽略）。

## 1. 模块概览

| 层 | 职责 | 数据流 |
|---|---|---|
| main/index.ts | 单文件入口：窗口/托盘/生命周期 + `registerIpc()`（~1270 行，~90 个 handler/on）+ media:// 协议 + 模型下载器 + AI 多画像编排 | renderer `invoke/send` → handler → 各 store/manager |
| preload | contextIsolation 白名单，`window.rgbbox` 单根 138 方法；订阅统一返回反注册函数 | 唯一合法通道（R5.1） |
| shared/ipc.ts | `as const` 通道名表 + `IpcChannel` 联合 | 双方 import 同一常量 |
| 持久化 | profileStore/systemSettingsStore（atomicJson 原子写+坏文件备份）；audio/video 播放列表（裸 writeFile，见 U5）；captureStore/ai8Credentials 等独立 store | |
| 周边服务 | lanService（dgram+net 传输层）、audioAiService（onnxruntime VAD/AST）、permissionGate（origin×类型白名单） | 均为注入式/纯函数，可测性好 |

**两条全局断言先行（本次验证为真，值得固化成测试）：**
- **B1（✅）R5.1 白名单成立**：全 renderer 无 `ipcRenderer`/`from 'electron'` 直连（仅注释与 i18n 文案命中，`grep src/renderer`）。
- **B2（✅）138/138 通道三方一致**：ipc.ts 每个 key 在 preload 与 main 均有消费/注册，无死通道、无游离字符串（comm diff 脚本验证；`tests/integration/ipcChannels.test.ts` 手工映射表只锁了 46 个，见 T3）。

## 2. 发现清单（24 条：P1×2 / P2×6 / P3×14 / 断言成立×2）

### U — bug / 正确性（10）

| # | 严重度 | 位置 | 证据（一句话） |
|---|---|---|---|
| U1 | **P1** | `src/main/atomicJson.ts:54-66` | `writeJsonAtomic` 失败 catch 块里**再次 `rename(tmp, path)`**：writeFile 半途失败（ENOSPC/EPERM）留下截断 tmp，该 rename 会把截断文件盖到原文件上——恰好复现 R221.1 要消灭的清空链；且头注释承诺「写失败时清理临时文件」未实现（孤儿 `.tmp` 累积），`atomicJson.test.ts:48-62` 只测成功路径，与其头注释 ②「原文件在写失败时保持不变」的声明相悖 |
| U2 | **P1** | `src/main/index.ts:1677-1689` | R221.5 media://local 白名单只有 captures/models/Downloads/Music/Videos 五根：① `userData/ai8-artifacts` 不在内 → AI8 生图缩略图（`AiLabAi8Tab.tsx:1263` `mediaLocalSrc(local)`，local 即 `ai8SaveArtifact` 返回的 artifacts 路径）**确定性 403**（R127 功能回归）；② `audio/videoOpenFolder` 让用户选**任意**目录（`index.ts:1417-1430/1463-1476`），白名单外的盘符/目录全部 403 无法播放（`AudioStudioView.tsx:1214,1552`、`VideoStudioView.tsx:1077,1304`、`superres.ts:177`）——「添加文件夹」是一等入口，非边缘路径 |
| U3 | P2 | `src/main/index.ts:235-243 + 246-250` | F2 DevTools 注册了**两个** `before-input-event` handler（一处 open/close(detach)，一处 toggle），同一 keyDown 双重切换，净效果=热键失灵（两段连注释都是重复的 "F2 toggles DevTools"） |
| U4 | P2 | `src/main/systemSettingsStore.ts:58-66` + 5 个调用点 | `saveSystemSettings` 读-浅合并-写**无串行化**：`index.ts:288`（powerSaveBlock）、`index.ts:393`（snip 热键）、`index.ts:451`（AI 密文 persist）、`screensaverManager.ts:241`、`shutdownScheduler.ts:75/94/110` 并发时后写整文件覆盖前写 → 跨字段丢失更新；`runAiStoreOp` 队列只护住 AI 域，注释自己承认「ipcMain does not serialize invokes」 |
| U5 | P2 | `src/main/index.ts:1391-1403, 1435-1449` | audio/video 播放列表持久化仍是裸 `writeFile` + 解析失败回 `[]`——正是 R221.1 修掉的清空链原样第二现场：坏 JSON → UI 空列表 → 下一次保存把空数组覆盖落盘，用户歌单/片单蒸发；未复用两步之遥的 atomicJson |
| U6 | P3 | `src/main/index.ts:1071` | `fps: frame.columns > 0 ? engineStatus.fps : engineStatus.fps` 三元两支相同：engineStatus.fps 永远停在 defaultProfile 初值（疑似漏写 `frame.fps`），`getEngineStatus` 返回僵尸值 |
| U7 | P3 | `src/main/index.ts:958-962` | `audioAiFeedStream` 无活动流时抛 'AUDIOAI_STREAM: no active stream'，handler `audioHintOf` 把一切非 not-downloaded 错误映射为 `'inference'` → UI 显示误导性失败原因 |
| U8 | P3 | `src/main/index.ts:1513-1546` | `modelDownload` 无并发锁（tts 家族有 `ttsDownloading` 标志，model 没有）：同模型两个并发 invoke 双下载，断点续传（append 模式）交叉写同一 dest → 缓存损坏 |
| U9 | P3 | `src/main/index.ts:660-763` | `ai8OpenLogin` 登录窗口无 `render-process-gone` 处理：登录窗 renderer 崩溃后 `executeJavaScript` 持续 throw→poller 每 1.5s 空转、invoke 永不 settle（渲染层 `await` 悬挂，只能重启恢复）——对比主窗口(:189)与 visionHost(:1143) 均已处理 |
| U10 | P3 | `src/main/index.ts:1341-1371` | `downloadWithProgress` 对**相对 Location** 重定向直接 `attempt(res.headers.location)`：相对路径不以 `https://` 开头走 httpGet → 同步 TypeError，绕过 scheduleRetry 直接 reject |

### B — 行为断言（3 缺陷 + 2 成立）

| # | 严重度 | 位置 | 证据 |
|---|---|---|---|
| B3 | P3 | `src/main/index.ts:507,539` | `aiSetSettings`/`aiSaveProfile` 返回值仍含**明文 apiKey**（渲染层自己刚发的，泄露面有限），与 R221.5 `aiGetSettings` 掩码化（:484）意图不对齐——保存路径回程未收口 |
| B4 | P3 | `src/main/systemSettingsStore.ts:50-65` | 坏 system.json 后任意小开关保存（如 powerSaveBlock）走「以本次增量覆盖」语义：整个 system.json 只剩 `{powerSaveBlock}`，AI 密文/热键/屏保全被挤出（仅 `.bad` 手工可救）——设计上接受但增量粒度是单字段，连带杀伤面大 |
| B5 | P3 | `src/main/lanService.ts:113-139` | `lanHost` 恒返回 `{port:0}`（真实端口要二次 `lanState().room.port` 轮询），preload 类型 `Promise<{port:number}>` 对调用方误导（注释有说明，接口无体现） |
| B1 | ✅成立 | 全 renderer | R5.1：零 `ipcRenderer` 直连（见 §1） |
| B2 | ✅成立 | 三方 diff | 138 通道 preload/main 双侧零死通道（见 §1） |

### T — 测试盲区（4）

| # | 严重度 | 位置 | 证据 |
|---|---|---|---|
| T1 | P2 | `src/main/index.ts` registerIpc（~90 handler） | 主进程 handler 层**零测试**：参数校验分支全裸奔——`clipboardWriteImage` 前缀检查(:316)、`ai8SaveImageToFolder` 会话包含检查(:639)、`snipSetHotkey` 白名单(:384)、`assertPcm16k` 边界(:954)、`lanHost` 强转(lanService:385)。仓内已有注入式范式（`registerLanIpc(ipcMain, svc)`）可照抄 |
| T2 | P2 | `src/main/lanService.ts`（395 行，无 lanService.test.ts） | 传输行为零覆盖：心跳判死（LAN_DEAD_AFTER_MS）、断线 resume（resumable/epoch）、观战忽略 cmd、resync 补发——协议纯层有 `tests/shared/lanProtocol.test.ts`，socket 行为全靠 E2E 手感 |
| T3 | P3 | `tests/main/ipcContract.test.ts:12` + `tests/integration/ipcChannels.test.ts:52-125` | 契约测试正则 `'(rgbbox:` **静默豁免** `overlayFrame:'overlay:frame'`（唯一违反命名空间的通道不进名册）；integration 手工映射表只锁 46/138，新增家族（ai8/agent/tts/lan/audioAi/denoise/avatar/captures/snip/ocr）全不在表内——B2 的三方一致性今天靠人肉，无测试锁定 |
| T4 | P3 | `tests/main/atomicJson.test.ts` | 未覆盖 `writeJsonAtomic` 失败路径（U1 所在），「原文件写失败保持不变」的注释承诺无回归锁 |

### X — 架构债（5）

| # | 严重度 | 位置 | 证据 |
|---|---|---|---|
| X1 | P2 | `src/main/index.ts`（1833 行） | 新 God File：`registerIpc` 单函数 ~1270 行，内嵌 `downloadWithProgress`（55 行纯网络逻辑，:1332-1386）、AI store 编排、TTS/agent/ai8/捕获全家——CLAUDE.md 禁顺手重构，但需要 R-N 分批抽离；网络下载器与 ttsDownload 是同构重复 |
| X2 | P3 | `src/main/index.ts:166` | 主窗口 `sandbox:false`（contextIsolation/nodeIntegration 已达标）：扩大攻击面，若 preload 无 Node API 需求可收紧（需先验证 vision/wasm 链路） |
| X3 | P3 | `src/preload/index.ts:7-13, 213` | preload 自定义 `AudioInput` 与 engine 类型双份漂移风险；`aiGetSettings` 返回类型漏 `hasKey` 字段（main :484 实际返回）——桥类型与实现已漂移 |
| X4 | P3 | `src/main/lanService.ts:336-351` | LAN 零鉴权 + `cmd/snap` payload `unknown` 直透渲染层（lanEvent detail 无 schema 校验）：本网段边界内可接受，但恶意/异构客户端可向 host renderer 注入任意结构 |
| X5 | P3 | `src/main/lanService.ts:361,364`；`atomicJson.ts:44-51` | `teardown()` 重复 `if (this.beaconTimer) clearInterval` 死代码；`preserveBadFile` 动态 import 顶部已 import 的 `rename` |

## 3. 价值任务建议（7 条，均过三关）

| # | 任务 | 三关（用户可感知？/ 独立可验收？/ 文件所有权独立？） | 预估 |
|---|---|---|---|
| W1 | **修 media://local 白名单缺口**（U2）：`ai8-artifacts` 入白名单；`audio/videoOpen*` 选中路径做会话级登记（照 `ai8BatchFolder` 模式）或返回主进程签发的授权 URL；白名单判定纯函数抽进 `mediaProtocol.ts` | ✅ AI8 缩略图立刻恢复、任意目录播放恢复（真机可验）；✅ 单测（白名单纯函数）+ 手动验收清单；✅ 只动 index.ts handler + mediaProtocol.ts | P1，0.5-1 天 |
| W2 | **修 atomicJson 失败路径 + 回归锁**（U1/T4）：catch 删 rename 重试、失败时 unlink tmp；补 ENOSPC/EBUSY 注入单测 | ✅ 用户数据（AI 密文/profile）不因保护机制自身而毁；✅ 失败注入测试即验收；✅ 单文件+单测试文件 | P1，0.5 天 |
| W3 | **system settings 写串行化**（U4）：`runAiStoreOp` 泛化为 store 级互斥队列，5 个调用点全走同一队列 | ✅ 设置不再偶发互相覆盖（电源/屏保/热键/密文）；✅ 并发写不丢字段的单测；✅ systemSettingsStore.ts + index.ts 少量接线 | P2，0.5 天 |
| W4 | **播放列表迁移 atomicJson**（U5）：audio/video Get/SavePaths 改 `readJsonSafe`+`writeJsonAtomic`+坏文件保底 | ✅ 歌单/片单不再被坏文件+自动保存清空；✅ 坏样本→读空→保存不复写的单测；✅ index.ts 两对 handler + 测试 | P2，0.5 天 |
| W5 | **index.ts 首批抽离**（X1+U3+U8）：`downloadWithProgress`+modelDownload → `main/modelDownload.ts`（加并发锁修 U8、相对重定向修 U10），`registerIpc` 改注入式签名开启可测性（照 registerLanIpc）；顺带删 F2 双注册（U3） | ✅ 下载可靠性（并发不写坏）+ F2 恢复；✅ 重定向/续传/重试/并发单测；✅ 新文件独立，index.ts 只减不加 | P2，1-1.5 天 |
| W6 | **lanService 传输行为测试**（T2）：本机 loopback 双 LanService 对拍——心跳判死、断线 resume+seq、观战 cmd 忽略、resync 补发 | ✅ 商业化 LAN 联机稳定性（R234 战役域）；✅ 行为断言单测；✅ 新测试文件零产品代码 | P2，1 天 |
| W7 | **契约测试升级为三方完备性**（T3）：ipcContract 解析全部 key，静态断言 preload api 覆盖 + main handle/on 覆盖；正则修复 overlayFrame 豁免（显式白名单而非静默漏网） | ✅ 防新通道漏接（B2 人肉结论固化）；✅ 测试即验收（本次 comm diff 脚本可直接内联）；✅ 单测试文件 | P2，0.5 天 |

不提（过不了三关）：sandbox 收紧（需 vision 链路验证，非独立可验收）、preload 类型漂移清理（无用户可感知面，并入 W5 顺手）、LAN 鉴权（超本网段边界承诺，另立 R-N 讨论）。

## 4. 优先级排序

| 档 | 任务 | 理由 |
|---|---|---|
| **P1（立即）** | W1 → W2 | W1 是确定性功能回归（两处用户可感知坏）；W2 是数据保护机制自身可毁数据，改动小收益确定 |
| **P2（本迭代）** | W3 → W4 → W5 → W7 → W6 | W3/W4 同为数据完整性批次可合并一个 R-N 交付；W5 是 index.ts 解 God File 的第一刀（带 U3/U8/U10 三个顺带修复）；W7 半天固化 B2；W6 服务 LAN 战役排最后 |


---

## 主审复核（2026-10-11，对码核实）

- **W1 media://local 白名单缺口**：✅ 实锤——`main/index.ts:1680-1687` allowedRoots 确无 `userData/ai8-artifacts`（AI8 缩略图 403）且用户自选音视频目录（非 Downloads/Music/Videos）全 403。
- **W2 atomicJson 失败路径**：✅ 实锤（P1 加重）——`atomicJson.ts:52-62` catch 块在写失败后**再次 rename(tmp, path)**：不完整/不存在的 tmp 覆盖原文件，恰好复现 R221.1 要防的清空链，且无失败路径回归锁。
- 其余 P2/P3 未逐条复核，按报告立项、TDD 先行验证。
