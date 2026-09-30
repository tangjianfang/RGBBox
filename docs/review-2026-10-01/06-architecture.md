# 06 · 软件工程与高可扩展性评审（架构）

> 评审对象：RGBBox @ `93d365f`（HEAD, 2026-10-01）；已发布 0.3.84 zip=03477e1946a114c1（版本归属已核，package.json version=0.3.84）。
> 方法：静态只读分析；量化脚本在 `exp/metrics.py`、`exp/crosscut.py`、`exp/tests_map.py`（本目录旁）。**未构建、未跑测试**——所有"测试通过/覆盖率"结论均为静态推断。
> 置信度标注：〔高〕= 直接读码/可复算；〔中〕= 启发式脚本结论；〔低〕= 推断。

---

## 1. 摘要

**架构健康度总分：B+（良好，可扩展性不均衡）**。这是一个工程纪律罕见地好的单人+AI 项目：分层铁律真实成立、纯 TS 引擎可移植、编译期安全网（View Record、i18n 双表类型对齐）设计精巧、快照/十六进制/对比度三道视觉门禁是同类项目少见的资产。但扩展性呈**两极**：效果/i18n/视图三条扩展轴有编译期强制的一致性检查，而**游戏、IPC、设置、主进程**四条轴是霰弹式修改；且全部质量门禁**只存在于开发者本机，无 CI 承载**。

### 分维度

| 维度 | 评 | 一句话 |
|---|---|---|
| 分层纪律 | **A** | 0 违例、0 环、engine 零 DOM/零外部依赖（token 级核验）〔高〕 |
| 可测试性 | **B** | engine 10/10、main 模块 28/38 有测试；但两端 God 装配层 0 直接覆盖 |
| 扩展性 | **B-** | a/f/d 轴优秀（11/2/6 文件且有编译期护栏）；e/c/g 轴霰弹式（MiniGamesView 手工接线、137 通道只锁 46） |
| 横切一致性 | **B-** | 无 ESLint、renderer 零日志、持久化三范式并存 |
| 质量基建 | **A-** | ui-snapshot/hex/contrast 门禁脚本精良；但 CI 只有 docs 页面部署 |
| 文档 | **B-** | 架构骨架描述准确；6+ 处数字漂移、1 处门禁承诺失效 |

### Top10 结构性问题

1. **`src/main/index.ts` registerIpc 单函数 1240 行**（255–1495 行），全仓 117 个 `ipcMain.handle` 中 104 个在此（89%）〔高，`grep ipcMain.handle` 计数〕；0 直接测试且被覆盖率排除。
2. **`MiniGamesView.tsx` 2939 行 God view，无游戏注册表**：4 款游戏 state/tick/draw/hints 全部手工接线（54 个 useState、19 个 useEffect；`Screen`/`GameKey` 联合类型硬编码于 140-141 行）〔高〕。
3. **无 CI**：`.github/workflows/` 仅 `pages.yml`（41 行，docs 部署）〔高〕；typecheck/154 测试文件/三道视觉门禁全部依赖本地自觉，R13.8 自认"CI 未做"。
4. **无 ESLint**：无任何 eslint 配置与依赖，但代码里有 **20 个 `eslint-disable` 死注释**〔高〕；React hooks 依赖数组规则无机器保障（App.tsx 等大量手写 deps）。
5. **App→WorkspaceView 87 个 props 钻透**〔高，`interface WorkspaceViewProps` 成员计数〕：域 hook 拆分成功但没给消费缝，App.tsx 646-734 行是 88 行纯 props 展开。
6. **IPC 同步集成测试腐烂**：`tests/integration/ipcChannels.test.ts` 只映射 46/137 通道（39 invoke+2 send+5 on，全是 2026 年中之前的域）；文件头"adding a new channel should fail this test"承诺已失效——新增 TTS/agent/LAN/avatar 等 91 个通道不会触发任何失败〔高，通读该测试 + `grep -c ": 'rgbbox:" ipc.ts`=136+1〕。ADR-003 的"集成测试可穷举"名不副实。
7. **渲染层零日志、42 处静默吞错**：`.catch(()=>{})` 42 处（38 在 renderer，MiniGamesView 7、AiLabAi8Tab 6）；renderer 无 logger（console.* 仅 8 处、shared/logger 仅 main 侧 7 文件使用）；crashLog 只盖主进程（architecture.md §4 自认）〔高〕。
8. **持久化三范式并存**：`usePersistedState` 仅 7 个调用点 vs 112 处直接 `localStorage.*`（MiniGamesView 自带 read/write helper 152-337 行）vs 域模块注入 storage 参数；33 个 key 无清单〔高〕。
9. **CPU↔GLSL 双实现手工同步无对拍**：49 CPU 效果每个新增需同时写 `engine/effects.ts` switch case + `gl/effectGl.ts` GLSL（tokamak-plasma 足迹 11 文件证实），两端行为一致性纯靠人（architecture.md §14 自己也标了推断）〔高足迹/中风险〕。
10. **一次性 verify 脚本堆积**：68 个顶层 `.mjs` 共 7337 行，仅 14 个复用 `scripts/lib/cdp.mjs`；verify-r116↔r117 有 ~95 行复制；r94×3、r216-r219 多版本并存〔高〕。

---

## 2. 度量数据表

### 2.1 规模与复杂度（wc + 分支 token 启发式，非真圈复杂度〔中〕）

| 指标 | 值 |
|---|---|
| src TS/TSX 文件 / 总行 | 199 / 57,201 |
| renderer 占比 | 42,669 行（74.6%） |
| tests | 154 文件 / 1401 个 it/test |
| scripts | 68 顶层 .mjs + lib/cdp.mjs = 7,337 行 |
| 文档 | PRD-0002 3,908 行；architecture.md 505 行 |

行数 Top（括号=分支 token 复杂度启发式）：

| 行数 | cc~ | 文件 |
|---|---|---|
| 3598 | 30 | i18n/index.tsx（172 commits，全仓最高 churn） |
| 2997 | 338 | AudioStudioView.tsx |
| 2939 | **553** | MiniGamesView.tsx（复杂度全仓第一） |
| 2187 | 361 | VideoStudioView.tsx |
| 2123 | 299 | games/survival.ts |
| 1758 | 315 | **main/index.ts** |
| 1740 | 155 | engine/effects.ts（49 case 大 switch，但单 case 简单） |
| 1405 | 296 | AiLabAi8Tab.tsx |
| 1346 | 67 | gl/effectGl.ts |
| 822 | — | App.tsx |

Git churn：i18n 172 / main-index 86 / App 82 / MiniGamesView 64 / effects 23 commits〔高〕。

### 2.2 分层核验（CLAUDE.md 声称 vs 实测）

| 声称 | 实测 | 结论 |
|---|---|---|
| engine 纯 TS 无 DOM/WebGL/Electron | `document./window./navigator/OffscreenCanvas` token 全 0；外部 import 0（动态 import 亦核） | ✅ 成立〔高〕 |
| renderer 不直连 electron（R5.1） | `from 'electron'` 0 处；`ipcChannels.` 引用 0 处；`ipcRenderer` 0 处 | ✅ 成立〔高〕 |
| IPC 通道集中 shared/ipc.ts as const | 136+1 通道常量全在此文件；preload 150 处引用 | ✅ 成立〔高〕 |
| import 无环 | Tarjan SCC>1 = 0（正则解析静态 import；动态 import 逐一人工核对，均同层 lazy） | ✅ 成立〔中〕 |
| 层次逆向（engine→renderer 等） | 0 违例 | ✅ 成立〔中〕 |
| preload 340 行（arch.md） | **400 行** | 🔶 漂移 |

### 2.3 God object 清单

| 对象 | 规模 | 职责簇 |
|---|---|---|
| main/index.ts | 1758 行 | 单实例锁/窗口/托盘/协议/权限/104 个 IPC handler（registerIpc 一函数 1240 行）/生命周期 |
| MiniGamesView | 2939 行 | 4 游戏 hub + 每游戏 HUD/难度/教练/存档/输入/手柄/联机面板接线 |
| AudioStudioView | 2997 行（12 处 as-any 全仓第一） | 播放器/频谱/3D/playlist |
| i18n/index.tsx | 3598 行 | EN 1684 键 + ZH 1684 键 + Provider |

### 2.4 重复度〔中〕

- games/ 四游戏间共享块 ≥8 行仅 td↔tetris ~15 行——**hud/juice/sfx/scene/coach 确为共享模块而非复制**（推翻线索块预设）。
- studio views 间 0 个 ≥8 行相同块（结构相似但写法各异）。
- scripts：161 个文件对存在 ≥10 行共享；最重 verify-r116↔r117 ~95 行（CDP 样板）；仅 14/68 用 lib/cdp.mjs。

---

## 3. 分层与可测试性

**测试金字塔（静态推断）**：engine 单测(node) 10 文件 → shared 8 → main 模块级 33（overlayManager/snipManager/agent/tts/lan…）→ renderer 组件 happy-dom 36 + 域 11 + 游戏 14 + hooks 5 + gl 3（headless-gl）→ 集成 1（IPC↔preload）→ E2E 由 ui-snapshot(9 视图) + 68 个 verify 脚本充当。这是**宽底座、真集成薄、无 CI** 的金字塔。

按"被任一测试 import"的文件覆盖代理〔中〕：

| 层 | 覆盖 |
|---|---|
| engine | 10/10 (100%) |
| preload | 1/1 |
| shared | 13/14 |
| main | 28/38 (73%) |
| renderer | 85/135 (62%) |

**零覆盖高风险模块**（未被任何测试 import）：i18n/index.tsx 3598、**main/index.ts 1758**、AiLabAi8Tab 1405、WorkspaceView 1112、**lanService 394**（LAN 联机传输层，TODO 自认真双机不可测）、**useEngineLoop 250**（引擎心脏！仅被组件冒烟间接触达）、perfSelfTest 291。〔高〕

**main 1758 行为何无单测**：历史事实——覆盖率配置显式排除 `src/main/index.ts`（vitest.config.ts:52），装配层依赖真 Electron；但**拆分路径已被仓库自己验证过**：overlayManager/snipManager/screensaverManager/captureProviders 等 20+ 模块就是从 index.ts 提取的，且提取时全部跟进了 tests/main 用例（33 文件）。缺的只是把 registerIpc 内继续成簇的 handler 域搬出去。

**mock 基建**：tests/renderer/setup.ts 148 行（jest-dom + rgbbox 桥 stub）；integration 测试内联 electron mock。质量可用。

**electron-vite 三 target**：main（双入口 index+denoiseProcessor utility process）、preload（单入口）、renderer（三 HTML 入口 index/snip/visionHost + manualChunks vendor-three/vendor-splat）。入口设计与架构文档一致〔高〕。

---

## 4. 扩展性走查（a–h）

| # | 场景 | 实测改动面 | 霰弹度 | 评 |
|---|---|---|---|---|
| a | **新增 CPU 特效** | 11 文件：shared/types.ts(联合) → engine/effects.ts(case) → defaultProfile.ts(预设) → i18n ×2 语言 ×label/desc → EffectsView.tsx:313(分类清单) → domain/quickDimensions.ts:15 → domain/randomizer.ts:8 → **gl/effectGl.ts:91,1071,1214(GPU 直通 GLSL 镜像)** → 3 个测试文件。paramMeta 参数名泛化无需动。 | 🟡 8 处源码但有编译期护栏（联合类型+测试枚举）；**双实现(CPU+GLSL)是主要风险** | 中 |
| b | **新增 GPU 3D 特效** | 8 文件：types.ts EFFECT_3D_KINDS(6→7，注释要求与 Effect3DKind 手工同步) → gl/effect3dGl.ts → EffectsView → i18n ×2 → defaultProfile → 3 测试 | 🟢 同 a 但单实现 | 良 |
| c | **新增 IPC 通道** | 5 文件：shared/ipc.ts → preload/index.ts(方法，`RgbBoxApi=typeof api` 类型自动流到 renderer) → **main/index.ts registerIpc(104 handler 挤一处)** → (可选)shared/types 载荷 → 集成测试映射(手工列表，**不更新也不红**)。CLAUDE.md 还要求 PR-1 加 R-N。 | 🟡 机械但集中度差；**护栏已腐烂**（46/137） | 中下 |
| d | **新增主视图** | 6 文件：hooks/tabNavigation.ts MODULE_VIEWS → components/shellModules.ts CARD_VIEWS+MODULE_META（**`Record<CardView,…>` 漏配即编译错**，shellModules.ts:26-29 自述）→ App.tsx(lazy+渲染分支+可选 visited 门) → ModuleRail/DashboardView **自动**派生 → i18n ×2(nav.X+dash.desc.X) → **scripts/ui-snapshot.mjs:25 VIEWS 硬编码 9 视图需手动加** | 🟢 最佳实践范本；唯快照清单手工 | 优 |
| e | **新增迷你游戏** | games/<new>.ts(纯逻辑，可测) + **MiniGamesView.tsx 大改**：GameId 联合(gamesTelemetry.ts:11)、Screen/GameKey 联合(:140)、ONBOARD_STEPS、hub 卡片、状态/tick/draw 接线、难度/教练/成就/遥测挂点——**无注册表，非数据驱动**（推翻"GAMES 注册表机制"假设：不存在该机制） | 🔴 1 新文件 + 2939 行 God view 深度修改 | 差 |
| f | **新增语言** | i18n/index.tsx：`TranslationKey=keyof typeof EN`，`TranslationTable=Record<TranslationKey,string>`（:1786-1787）→ 新表**漏任一键即编译错**；Lang 联合 + translations Record + t() 的 `?? key` 兜底 + 切换 UI。成本=1684 键翻译（机械但量大） | 🟢 类型安全双表对齐是教科书级 | 优 |
| g | **新增设置项** | 6 文件：main/systemSettingsStore.ts SystemSettings(可选字段+浅合并，**无 schema 版本/迁移框架**，靠 optional 字段演进) → main/index.ts handler → preload → hooks/domains/useSettingsMirror(48 行) → SettingsView(169 行) → i18n ×2 | 🟡 机械、无护栏（忘改 mirror 不报错） | 中 |
| h | **新增 LED 硬件协议** | **当前不存在任何硬件协议层**：输出仅 overlay 浮窗（status.output='virtual-preview'）；全仓无 wled/serial/artnet/e131 命中。现成分发缝：domain/overlayDistribution.ts(147 行纯路由，已可测) + main/overlayManager(317 行窗口中继) + captureProviders 的 provider 抽象是同类先例。加协议=新 `ledSink` 抽象 + distributeFrameToOverlays 处插第二消费者 + 新 IPC 域 | 🔴 从 0 建（但这与"不做真实硬件集成"裁决一致，TODO D 段 R14.8 冲突待用户拍板） | 缺位(非缺陷) |

---

## 5. 横切一致性

| 维度 | 数据 | 评 |
|---|---|---|
| 错误处理 | try 块 340 vs 静默 `.catch(()=>{})` 42（renderer 38/main 4）；空 catch 0 | 🟡 吞错集中在 AI/游戏 UI 域，主进程反而干净 |
| 日志 | main：initLogger+7 模块 getLogger（shared/logger 236 行）；**renderer：0 logger、console 仅 8** | 🔴 渲染层错误对用户/诊断不可见（DiagnosticsView 只有主进程指标） |
| IPC 类型安全 | as const 通道+`typeof api` 推导；renderer 0 处直连；但 `as any/unknown as` 43 处（AudioStudioView 12、ttsService 8）；ts-ignore 0 | 🟢 总体好，43 处集中在两个大文件 |
| 状态管理 | usePersistedState 7 调用点 vs 112 处 localStorage 直写 vs 域模块 storage 注入（gamesTelemetry/swarmMeta 等，纯函数可测，是**好**范式）；33 个 key | 🟡 三范式并存；games view 内联 helper 16 处是杂草 |
| 魔数 | setTimeout/setInterval 字面量 36 处 21 个不同值（2600/3200/999/2400ms…）；热键白名单集中在 main（好） | 🟢 量级可接受 |
| Lint | **无 eslint 配置**；20 个 eslint-disable 死注释；tsconfig 双侧 strict+noUnused+noFallthrough ✅ | 🔴 唯一缺失的机器闸门 |

---

## 6. 构建 / 基建 / 仓库卫生

- **CI**：仅 `pages.yml`（docs→Pages）。typecheck/vitest/coverage/ui-snapshot/hex-audit 全部本地脚本。**606 commits 无一次机器化回归拦截**——所有"0 失败"证据均为本地人工运行〔高〕。
- **门禁资产**（亮点）：ui-snapshot.mjs 186 行——fresh-out 检查、localStorage 清洗、canvas+易变文本双掩码、0.1% 像素阈值、基线 git 戳（R160.5 教训固化）；ui-audit-hex 100 行、contrast 154 行。可维护性好（单文件、零产品代码挂钩、选择器侧置）〔高，通读〕。
- **版本戳副作用**：`predist: npm version patch` + dist:win 内联再 bump，yarn1 项目里用 npm version（混包管理器）；TODO 记录过"0.3.84 原位未 bump"的人工补偿——打包即改 package.json 是已知 footgun〔高，配置读毕〕。
- **打包体积〔低，静态推断〕**：node_modules 实测 onnxruntime-node 284MB、@huggingface/transformers 259MB、kokoro-js 30MB；5 个 runtime deps 中 4 个是重型 AI 原生/模型库。release zip 278MB 的主要构成推断为 asarUnpack 的 onnxruntime 原生二进制 + rapidocr extraResources + superres 28MB wasm（asarUnpack `out/renderer/models/**`/`vendor/**`）。`*.splat` 排除规则已核（package.json:88-91）✅。**未读 release/ 目录，未验证**。

---

## 7. 测试体系与文档漂移

### 文档漂移清单（逐条对码核验，12 处）

| # | 文档声称 | 实测 | 判 |
|---|---|---|---|
| 1 | CLAUDE.md "App.tsx ~700 行" | 822 | 🔶 +17% |
| 2 | arch.md §4 "App.tsx(795 行)" | 822 | 🔶 |
| 3 | arch.md "main/index.ts 1584 行" | 1758 | 🔶 |
| 4 | arch.md §8.5 "preload 340 行" | 400 | 🔶 |
| 5 | arch.md §3 "i18n 3033 行" | 3598（1684×2 键） | 🔶 |
| 6 | arch.md "domain/(13 模块)" | **18** 个 | 🔶 |
| 7 | arch.md/CLAUDE.md "9 个域 hook" | 9 | ✅ |
| 8 | "49 CPU 效果" | effects.ts 49 case | ✅ |
| 9 | "6 GPU 3D / Effect3DKind" | EFFECT_3D_KINDS=6 | ✅ |
| 10 | "GPU 直通 2D 28 种 / 55 预设" | GPU_DIRECT_EFFECTS=28 / defaultProfile label 55 | ✅ |
| 11 | 线索块 "67 mjs" | 68 顶层+lib/cdp | 🔶 微 |
| 12 | **ipcChannels.test.ts 头注释"两边同步即 fail"** | 只锁 46/137 通道 | ❌ 承诺失效 |

arch.md 基线 f82ef25(v0.3.82) vs HEAD 落后 2 个版本——文档自己声明增量刷新制，结构性描述（分层/数据流/ADR-001~017）抽查均与代码一致〔高〕，漂移集中在行数/模块数等"计数快照"。

### 被推翻的假设 / 已验证无问题

- 〔假设〕engine 有隐藏 DOM 依赖 → **证伪**（token 0 命中）。
- 〔假设〕四游戏 hud/juice/sfx 各自复制 → **证伪**（共享模块，重复 ~15 行）。
- 〔假设〕"GAMES 注册表数据驱动" → **证伪**（不存在注册表）。
- 〔假设〕集成测试穷举 IPC 双侧 → **证伪**（46/137）。
- 已验证无问题：renderer 零 electron 直连；import 零环；View/i18n 两套编译期完整性检查真实有效；分层覆盖率阈值设计（分层红线贴水面）自洽。

---

## 8. 值得保留的工程实践（重构时勿破坏）

1. 单 PRD + R-N 追加纪律与 `[PRD-0002]` 提交格式（606 commits 可追溯）。
2. ui-snapshot pixelmatch 硬门禁 + 基线 git 戳 + fresh-out 检查。
3. 纯 TS engine（0 DOM/0 依赖）与帧走 ref 的 R147 铁律。
4. 域 hook + 纯 domain 函数的 renderer 分解模式（tabNavigation/shellModules 的 Record 编译期完整性是范本）。
5. i18n `keyof typeof EN` 双表强制对齐。
6. captureProviders provider 抽象 + 永久回退（扩 LED sink 的先例）。
7. 分层覆盖率阈值（engine 90 / main 52 各自红线）。
8. worktree 五分支并行 + AI 审核闭环（R216 先例）。

---

## 9. 演进路线图（ROI 排序，均可按 R-N 独立成 commit）

| # | 项 | 做法 | 尺寸 | 风险 |
|---|---|---|---|---|
| R1 | **修 IPC 穷举门禁** | ipcChannels.test.ts 改为反向遍历：`Object.keys(api)` 按命名约定（invoke↔getXxx/xxx、on*↔push 通道）断言每个方法都有映射，且 `Object.values(ipcChannels)` 每个通道被 preload 引用 ≥1 次 | S | 极低；立刻恢复 ADR-003 |
| R2 | **最小 CI** | .github/workflows/ci.yml：checkout+node+`yarn typecheck`+`yarn test`（gl 用例条件跳过沿用现有 headless-gl 判断）。快照门禁因需真机 Electron 可二期 | S | 低；Windows runner 成本考虑可选 linux |
| R3 | **引入 ESLint** | typescript-eslint+react-hooks+react-refresh 最小集，清 20 个死 disable 注释 | S | 低 |
| R4 | **main/index.ts 第一刀** | 不动行为：把 registerIpc 内已成簇段落整体提取——TTS 域(818-1226)→`ipc/ttsIpc.ts`、模型下载(1227-1335)→`ipc/modelIpc.ts`、音视频持久化(1336-1425)→`ipc/studioIpc.ts`，签名 `register(deps)`；每提取一个域同步补 tests/main 用例（沿用 overlayManager 提取先例）。目标：index.ts 1758→~900，registerIpc 消失 | M（可分 3-5 个 R-N 增量） | 中；依赖注入面大，建议每刀后 `yarn test`+快照 |
| R5 | **游戏注册表** | 定义 `GameDef{id, create():S, tick, draw, hints, onboard}`；MiniGamesView 改查表，GameId/Screen 联合由注册表推导。2939 行拆为壳+4 个面板 | M | 中；分游戏逐个迁 |
| R6 | **WorkspaceView 87 props 收敛** | 域 hook 返回值装 2-3 个 context（profile/layer/sampling），App 只装 Provider | M | 中 |
| R7 | **renderer 日志/错误桥** | window.onerror+unhandledrejection → IPC → shared/logger；42 处静默 catch 至少换 `{reason}` 级记录 | S-M | 低 |
| R8 | **CPU↔GLSL 对拍** | 低分辨率 golden：同 (kind,t,params) 下 worker 帧 vs `readLEDs` 帧的容差比对，先覆盖 28 个直通效果 | L | 中 |
| R9 | **verify 脚本治理** | 历史脚本移 `scripts/attic/`（保留审计链），新 verify 强制走 lib/cdp.mjs | S | 低 |
| R10 | **i18n 拆分** | 按域拆 `i18n/en/<domain>.ts` 聚合合并，降低 3598 行/172-churn 单文件合并冲突 | L | 低（纯机械） |

**最快提升稳定性的一步**：R2（CI）——把仓库已有的全部本地门禁接上电；**最快提升可扩展性的一步**：R4 第一刀（TTS 域提取），它同时是 R5/R6 的模式示范。

---

## 10. 未验证项与局限

1. 未构建/未运行测试：所有覆盖率/水线/测试通过数为静态推断（分层阈值数字引自 vitest.config 注释）。
2. 复杂度为分支 token 启发式，非真 McCabe；行数含注释。
3. import 图为正则解析（静态 from 子句）+ 动态 import 人工核对；`export … from` 转发边未入图（低风险）。
4. 278MB release 构成仅从 electron-builder 配置与 node_modules 体积推断，未读 release/out。
5. LAN/gl/vision 真机行为、四游戏运行手感未验证。
6. 覆盖率"文件被测试 import"是粗代理，不等于行覆盖。
7. scripts 67 vs 68 计数差一处（lib 子目录口径）。

*评审人：架构角色（静态只读）；脚本与中间数据：`C:\Users\tjf\AppData\Local\Temp\rgbbox-review-20261001\exp\`*
