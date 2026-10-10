# REVIEW — AI 实验室 + 3D 可视化（2026-10-11）

> 只读差距审计。范围：`components/AiLab*.tsx`（View/Vision/Agent/Ai8/Voice）、`shared/ai8Client.ts`、`ai8/localStore`、`gl/`（previewGl/effectGl/effect3dGl）、`3d/`（SplatViewer/LEDMapper/useModelStore）、`shared/modelsManifest.ts`、相关测试。主进程侧只看了模型下载/TTS IPC 的调用契约面。

## 1. 模块概览

| 模块 | 职责 / 数据流 |
|---|---|
| `AiLabView.tsx` (546L) | AI 实验室壳：9 tab 路由 + profile 生命周期自管理（自动保存/Bedrock 表单）；voice/agent keep-alive（R175） |
| `AiLabVisionTab.tsx` (621L) | 视觉能力工作台：`useVisionInput` + window bus `vision-input` 事件点亮目录行；3 个客户端组合（双捏/张掌/握拳）复刻消费者语义 |
| `AiLabAgentTab.tsx` (678L) | 内核 agent 工作台：`agentSend` IPC + `onAgentEvent` 流式转 transcript；会话 JSONL 恢复/改名/删除；AI8 档 modelOverride |
| `AiLabAi8Tab.tsx` (1405L) | AI8 站点直连工作台（渲染层 fetch，CORS `*`）：chat SSE / draw 轮询+采纳 / video 轮询 / 文件夹批量；会话落 localStorage |
| `AiLabVoiceTab.tsx` (529L) | 声文：系统 speechSynthesis 与 Kokoro/Piper 双引擎，句级流式合成队列 + 词典钉音；模型按需下载经 ttsModelDownload IPC |
| `gl/previewGl.ts` (393L) | LED 网格预览渲染器：RGB 帧纹理 + 单 draw call shader（pixel/smooth、stretch/contain） |
| `gl/effectGl.ts` (1346L) | 28 个 GPU-direct 2D 特效 shader（CPU 公式 1:1 移植）+ `EffectGl` 驱动；PreviewGrid/OverlayCanvas 物理输出路径 |
| `gl/effect3dGl.ts` (752L) | 6 个 raymarching 3D 特效 shader + `Effect3DGl`（draw + readLEDs 采样回 LED 网格）；BroadcastChannel 同步 overlay |
| `3d/` (SplatViewer 481L / LEDMapper 305L / useModelStore 186L) | 高斯泼溅查看器（PMREM+ACES+LED 发光球）、LED 点击标定、模型清单/下载状态机；**App.tsx:59 `MODEL3D_VIEW_ENABLED=false` 生产不可达** |
| 模型清单 | `shared/modelsManifest.ts`（5 splat + 5 onnx，主/渲染共用）与 `scripts/models-manifest.json`（仅 5 splat，download-models 用）双份维护 |

## 2. 发现清单

严重度：P0 立即修 / P1 高 / P2 中 / P3 低。共 **21** 条（U8 / B3 / V1 / T4 / X5）。

### U — bug / 正确性

| # | 严重度 | 位置 | 证据（一句话） |
|---|---|---|---|
| U1 | **P1** | `src/renderer/src/components/PreviewGrid.tsx:151` + `gl/effectGl.ts:1289` | `EffectGl.render()` 内 shader 编译失败会 throw 且无捕获，异常发生在 rAF 链尾 `requestAnimationFrame` 之前 → 一次编译失败**永久冻结预览循环**（28 个 shader 零编译测试兜底） |
| U2 | P2 | `src/main/index.ts:1318` + `shared/modelsManifest.ts:31-67` | splat 缓存零完整性校验（onnx 有 R90.9 ±10% bytes 校验，splat 只查存在性）；断点续传刻意保留 partial，进程被杀后 `modelGetCachedPaths` 把半截文件当 cached 返回 → 模型永久损坏且 UI 不再给下载入口 |
| U3 | P2 | `components/AiLabView.tsx:543` + `ai8/localStore.ts` | AI8 tab 无 keep-alive（voice/agent 有 R175）：切走卸载后流式任务继续跑但 `setSessions` no-op → **完成的回合永不落 localStorage**，绘画/视频分钟级任务回来只见空白气泡；且 `writeSessions` 写在 setState updater 内（副作用位置错误） |
| U4 | P2 | `components/AiLabVoiceTab.tsx:133-139` | 系统引擎句队列只给末句挂 `onend`、全程无 `onerror`；任一句失败（如缺 zh-CN 声音）→ `playing` 永久卡 true、跟读高亮停在半路 |
| U5 | P3 | `3d/useModelStore.ts:55-57` | `ledMapBasePath()` 硬编码绝对路径 `/assets/models/`，打包后 file:// origin 解析到盘根 → 生产包 LED map 必然 fetch 404（仅 dev 正常） |
| U6 | P3 | `components/Model3DView.tsx:143` + `App.tsx:459-460` | `ledColors={ledColorsRef.current}` 是渲染期快照；网格分辨率变化时 App 换新数组 → SplatViewer 持旧数组，LED 球颜色冻结直到偶发重渲染 |
| U7 | P3 | `components/AiLabAgentTab.tsx:210-216` | 自动恢复 effect 捕获首渲染的 `loadSession` 闭包，profiles 异步加载完成前 `isAi8` 恒 false → 恢复 AI8 会话时 session-meta 的 model 不回填 `ai8ModelValue` |
| U8 | P3 | `3d/LEDMapper.tsx:72-81` | `syncMarkers` 只 `scene.remove`，每标记一个 LED 新建 SphereGeometry/Material 从不 dispose → 长校准会话 GPU 内存持续累积 |

### B — 行为断言（隐性契约，未钉死）

| # | 严重度 | 位置 | 证据 |
|---|---|---|---|
| B1 | P3 | `gl/effectGl.ts:59-92` vs `:208-1098` | `GPU_DIRECT_EFFECTS` 集合与 `EFFECT_FS` 键靠人工同步，无测试钉住相等；漂移时 `ensureProgram` 返 null → render false → **静默**退回 CPU 网格（分辨率级卖点无声失效） |
| B2 | P3 | `components/AiLabVisionTab.tsx:368-387` | palmHold/fistClutch 在持续保持时每 ~820ms 重复计数（MiniGames 同参数但被游戏相位门控）——与头注释"mirror consumer semantics exactly"有出入，可接受但应注明 |
| B3 | P3 | `components/Preview3D.tsx:108-111` | 每帧 readPixels 全画布（DPR 分辨率）+ 新建 `Uint8ClampedArray`；预览常驻时是固定每帧成本，未与引擎 tick 节流对齐 |

### V — 视觉 / 表现

| # | 严重度 | 位置 | 证据 |
|---|---|---|---|
| V1 | P2 | `3d/SplatViewer.tsx:128-172` + `keyboard_rgb.led-map.json`(led_count=104) | 每 LED 一盏 `PointLight`（104 盏）走 Three 前向渲染：超 shader uniform/编译预算，低端 GPU 编译失败或整帧拖慢；LED 视觉主力本应是 emissive+halo，点光源贡献可限量 |

### T — 测试盲区

| # | 严重度 | 位置 | 证据 |
|---|---|---|---|
| T1 | **P1** | `tests/renderer/gl/effectGl.test.ts`（全文 2 例） | 只测 BroadcastChannel 消息形状——**28 个生产 2D shader（物理 overlay 输出路径）零编译/绘制覆盖**；对照 effect3dGl R163.1 已有 headless-gl 每种一例像素读回，且 `glHarness.ts` 基建现成 |
| T2 | P2 | `tests/renderer/3d/SplatViewer.test.tsx` / `LEDMapper.test.tsx` | 仅断言 "module exports the component symbol"——下载状态机、importFile blob 生命周期、导出 JSON 格式零行为覆盖 |
| T3 | P3 | `tests/renderer/gl/effectGl.test.ts` | 无测试钉住 `GPU_DIRECT_EFFECTS == Object.keys(EFFECT_FS)`（与 B1 同根） |
| T4 | P3 | `tests/renderer/ai8/`（4 文件）+ components 无 AiLabAi8Tab.test | 域函数（client/localStore/markdown/mdPrompt）覆盖良好，但 1405 行 UI（登录/绘画采纳/视频轮询/批量）零组件级渲染测试 |

### X — 架构债

| # | 严重度 | 位置 | 证据 |
|---|---|---|---|
| X1 | P2 | `App.tsx:59` `MODEL3D_VIEW_ENABLED = false` | `src/renderer/src/3d` 全模块 + Model3DView 生产不可达，而 modelDownload IPC、manifest splat 条目、download-models 脚本仍活着；配套测试只剩 smoke 是自然结果——需明确恢复或归档决策 |
| X2 | P2 | `components/AiLabAi8Tab.tsx`（1405L，components/ 最大） | 登录+凭据+chat+draw+video+batch 六职责 God Component，违反 R147"编排层+域模块"约定；`findLatestDrawTask`/`runDrawTask` 已是纯逻辑形态，可整体下沉 `domain/ai8Draw.ts` |
| X3 | P3 | `scripts/models-manifest.json` vs `shared/modelsManifest.ts` | 双清单独立维护（后者多 onnx+ledMapFile），新增 splat 需改两处、必然漂移 |
| X4 | P3 | `shared/ai8Client.ts:336-353` + `AiLabAgentTab.tsx:199` | AI8 token 明文存 localStorage，而同一 secret 又经 safeStorage 加密进 profile（agent 自动建档）——密码加密+令牌明文的不一致安全姿态 |
| X5 | P3 | `AiLabAi8Tab.tsx:132` 与 `AiLabAgentTab.tsx:92` | 同一公开模板两处模块级缓存（chatTmplCache / ai8ModelCache），首开两个 tab 并行拉两次同一端点，缓存逻辑可漂移 |

## 3. 价值任务建议（过三关：砍掉可感知 / 独立可交付可验收 / 文件所有权独立）

| # | 任务 | 覆盖发现 | 三关通过依据 | 验收 |
|---|---|---|---|---|
| **W1** | **2D GPU shader 补 headless-gl 编译+像素读回测试（28 例）+ `EffectGl.render` 编译失败兜底** | U1, T1, T3, B1 | 冻结预览是全体用户可感知故障；`glHarness.ts` 现成，测试独立交付；兜底是 effectGl.ts 局部 try/catch | 新增测试全绿（本机 headless-gl 可用）；故意注入 GLSL 语法错误 → 预览回退 CPU 网格不冻结、console warn 一次 |
| **W2** | **AI8 tab keep-alive + 落盘副作用移出 setState updater** | U3 | 绘画/视频任务切 tab 丢结果是可感知数据丢失；对齐 R175 voice/agent 既有模式，改动小 | AI8 tab 切走再回来，流式完成的回合完整在列表；重启后仍在 |
| **W3** | **splat 缓存完整性校验（manifest 补 `bytes` + `getCachedModelUrl` 复用 R90.9 ±10% 模式）** | U2, X3(部分) | 半截模型永久"已缓存"是可感知死局；`modelsManifest.ts` 加 5 字段 + main 校验一段 | 手工截断缓存文件 → 状态回到 remote 可重下（main/index.ts 属 P0/P1 集中点，须走 R-N） |
| W4 | 系统引擎句队列补 `onerror` 兜底（失败句跳过 + 队列继续/收束 playing） | U4 | 缺声音环境卡死播放态可感知；VoiceTab 单文件 | 模拟 onerror：队列继续、playing 最终归 false |
| W5 | 3D 视图启用决策落地：启用（顺带修 U5 相对路径/U6 ref 直传）或整体归档拆解 | X1, U5, U6, U2 前置 | 死模块+活 IPC 是持续债；两条路线都独立可验收 | 启用：打包包内 LED map 可加载；归档：manifest/IPC/脚本一并清理 |
| W6 | SplatViewer 灯光预算：LED 点光源限量/关闭，视觉主力转 emissive+halo | V1 | 104 盏前向点光在低端 GPU 是可感知卡顿/黑块；SplatViewer 单文件 | 真机 fps 对比 + 截图视觉复核（表现层零容忍基线） |
| W7 | Ai8Tab 拆分：draw/video 轮询-采纳-恢复状态下沉 `domain/ai8Draw.ts`，UI 收薄 | X2, T4 | 1405L 六职责违反项目架构约定；域函数化后 T4 的测试才有落点 | 拆后组件 <600L；新域函数单测覆盖采纳/超时/停止分支 |

## 4. 优先级排序

1. **W1**（U1+T1，P1×2）——生产渲染路径的裸奔+冻死链，基建现成成本最低
2. **W2**（U3，P2）——可感知数据丢失，改动最小
3. **W3**（U2，P2）——下载死局，复用已验证模式
4. W4（U4，P2）——小而可感知
5. W5（X1，P2）——债的利息在涨（清单/IPC/测试三头漂移）
6. W6（V1，P2）——启用 3D 视图的前置条件
7. W7（X2，P2/P3）——最大工程量，放最后或随 W5 启用路线一起做

> P0：0 条 · P1：2 条（U1, T1）· P2：7 条（U2, U3, U4, V1, T2, X1, X2）· P3：12 条
