# 深度 Review — 共享层 + i18n 词表 + 纯函数域层 + 域 hooks（2026-10-11）

范围：`src/shared/`（types/ipc/logger/modelsManifest/titleBarTheme/systemSettingsStore）、`src/renderer/src/i18n/index.tsx`（工程健康，键集平价 R240 不重提）、`src/renderer/src/domain/`（19 文件）、`src/renderer/src/hooks/` + `hooks/domains/`（9 域 hook）、`src/engine/` 剩余件（textRenderer / videoWall / videoWallFrame）+ 上述各层测试覆盖盘点。
方法：只读代码 + grep + node 脚本静态扫描（键提取/死键/动态前缀），未跑测试/构建。

**与 B 线 REVIEW-workspace-settings 的边界**：该报告已提 profile import 零校验崩溃链（其 U1）、`extractSubFrame` y 向不 clamp（其 U5）、paramMeta 30/37 裸英文（其 V1）、WorkspaceView 绕过 presetDescription（其 V2）、domain hooks 测试大盘（其 T2）、videoWall 分支测试缺口（其 T3）——本文引用不重复，只补**增量发现**。

## 1. 模块概览

| 层 | 规模 | 职责与健康度 |
|---|---|---|
| `src/shared/` | 15 文件 | 跨进程纯数据 + 文件 logger。types/ipc 的 `as const` + `IpcChannel` 联合 + 双向契约测试（ipcChannels/ipcContract）是全仓类型安全最扎实的一段；systemSettingsStore 有 R221.1 坏文件保护，健康 |
| `i18n/index.tsx` | 3856 行，EN 1804 键 + ZH 1804 键 | `EN as const → TranslationKey → TranslationTable` 映射类型使 **静态键 EN/ZH 编译期平价**（实测 0 重复、0 单侧缺失）；弱在动态键（50 处 cast 绕过检查）与插值（38 处 ad-hoc replace） |
| `domain/` | 19 文件 ~1100 行 | 纯函数层整体质量高（parse* 白名单校验、presetI18n 回退语义清晰）；12/19 有直接测试 |
| `hooks/domains/` + `hooks/` | 9 域 hook + 8 其余 | R147 拆分后全部走 ref 桥/`window.rgbbox` 白名单，模式一致；`useEngineLoop` 是全 runtime 最关键件但零直接测试 |
| `engine/` 剩余件 | textRenderer 150 / videoWall 206 / videoWallFrame 87 | videoWall 数学两侧 clamp 对称、19+9 用例覆盖良好；textRenderer 的 5×7 bitmap 与 canvasTextMask（CJK）双轨并存 |

## 2. 发现清单（18 条：U4 / B3 / V5 / T3 / X3）

严重度：P0 阻断 / P1 严重 / P2 应修 / P3 待办。B 线已提项不计入。

### U — bug / 正确性（4）

| # | 严重度 | 位置 | 证据（一句话） |
|---|---|---|---|
| U1 | **P2** | `src/renderer/src/workers/previewEngineWorker.ts:36-137` + `hooks/useEngineLoop.ts:148,215,228` | worker 的 `self.onmessage` 全程无 try/catch：`renderPreviewFrame`/`computeTextMask` 一旦抛异常（现网可触发：经 B 线 U1 的未校验 import 把 `sampling.columns` 写成非数 → NaN 网格 → OffscreenCanvas 0×0 → `getImageData` IndexSizeError）就**永不回复**，主循环 `tickPending` 卡 true、`error` 事件只 console.warn——引擎**静默永久冻结**，无任何用户可见错误，切 running 才能救 |
| U2 | **P2** | `src/engine/textRenderer.ts:90,148` + `src/renderer/src/canvasTextMask.ts:12-18` | 两套文本 mask 缓存均无上限、无淘汰：key 含自由文本，用户每敲一个字符就新增一条 `cols×rows` boolean 数组（960×540 高级网格 ≈4MB/条），长会话打字 + 拖位置可泄漏数百 MB，且换网格后旧条目永久滞留 |
| U3 | P3 | `hooks/domains/useProfileManager.ts:171,174` | 层包 import 的 `kind: (src.kind as EffectKind) ?? 'rainbow'`、`blendMode as BlendMode` 是裸 cast 零白名单——外部 JSON 可把非法 kind 写进持久 profile（渲染落 effects.ts default 分支看不出错，但 paramMeta/primaryParams/`effect.${kind}` 键全部失配）；`domain/randomizer.ts:34` 已有 effectPresets 白名单范式未复用 |
| U4 | P3 | `hooks/useEngineLoop.ts:187` + `domain/profileUtils.ts:12-15` | `onTick` 里 `activeLayer(cfg.profile).kind` 无空层守卫：空 `scene.layers` 会在 setTimeout 回调里同步抛 TypeError，异常逸出后 `scheduleNext()`（:236-239）不再执行——引擎循环**当场断链**。与 B 线 U1（App 渲染层白屏）同根因不同表现（这条是无白屏的静默死亡），修 B 线 U1 时应一并加守卫 |

### B — 行为断言（3）

| # | 严重度 | 位置 | 证据 |
|---|---|---|---|
| B1 | P3 | `src/shared/logger.ts:108-132` | `flushPending` 在 `await appendFile` **之前**清零：连续两次微任务 flush 会并发发起 appendFile，fs 线程池不保证先发先写 → 日志行可能乱序；且 `message` 含换行未消毒（多行注入可伪造日志条目） |
| B2 | P3 | `hooks/useAudioAnalyzer.ts:109-111 vs :121` | 停视频轨道逻辑写了两遍（`getStream` 内 `stripVideoTracks(stream)` + then 回调里又 `getVideoTracks().forEach(stop/remove)`）——纯冗余；另 `deviceId` 切换时 `prevBassRef`/`smoothedBandsRef` 不重置，前 ~300ms 沿用旧设备的包络 |
| B3 | P3 | `hooks/useRecentEffects.ts:17` | `readStored` 只 `filter(typeof === 'string')` 不验 EffectKind 白名单（对比 `randomizer.parseStoredEffectKinds:34`）：localStorage 被旧版本/手工污染后，非法 kind 进 recents → curated strip → `t(\`effect.${kind}\`)` 运行时回退**显示键名原文** |

### V — 可维护性 / 表现（5）

| # | 严重度 | 位置 | 证据 |
|---|---|---|---|
| V1 | **P2** | 全 renderer（38 处，如 `MiniGamesView.tsx:2592-2593`、`App.tsx:552`、`Model3DView.tsx:62`） | i18n 插值全靠 ad-hoc `t(k).replace('{n}',…)`：占位符名（{n}/{m}/{e}/{count}/{name}/{value}/{current}/{max}/{seconds}/{bonus}/{bass}/{i}…）两侧无任何校验，任一侧拼错即把 `{n}` 原文渲染给用户；复数也是手写双键（`model3d.models`/`modelsPlural`）；`useVisionInput.ts:66` 已有局部 `interpolate()` 证明需求存在 |
| V2 | **P2** | `i18n/index.tsx`（词表内 ~45 键 ×2 locale） | 已逐一验证的死键（literal + 动态前缀双重排除）：`nav.profiles`、`shutdown.label/unsupported`、`layer.disabled`、`effects.noFavorites`、`customPaint.fillSolid/Gradient/Rainbow/Random`、`imagePaint.transition`、`games.title/featured/description/libraryTitle/ruleChoose/ruleLocal/ruleRestart/ariaTower/lan.spectate/swarm.coopToggle/scene.station`、`ambient.title`、`diag.title`、`profile.new/confirmDelete`、`audio.title/tab.player/tab.scenes/tab.export`、`audio.gen.pan/reverb`、`audio.lyrics.noLrc`、`audio.gen.configTitle`、`audio.eq.on/off/resetBand`、`audio.tooltip.on/off`、`audio.sequential`、`video.player.exitFullscreen/zoom.hint/title/save/lastShot`、`model3d.eyebrow`、`arch.eyebrow/title`、`ai.label/hint/save/saved`、`snip.failed`（多为已删视图/被替换控件残留；`games.swarm.coopToggle` 被 `games.duel.coopToggle` 取代） |
| V3 | P3 | 50 处动态键 cast（`grep as TranslationKey\|as Parameters<typeof t>[0]` = 50） | 动态键族全靠 cast 绕过编译检查，其中 3 处直接 `as any`（`AudioStudioView.tsx:1053,2095,2343`）、2 处把 `t` 宽化成 `(key: string) => string`（`MiniGamesView.tsx:1913,1945` 的 R262 label 注入）——键名打错只能靠运行时回退暴露 |
| V4 | P3 | `games/survival.ts:78` vs `MiniGamesView.tsx:283` | 引擎缺省 `SURVIVAL_LABELS` 里混着一个中文串 `'⚠ BOSS 逼近'`，与 view 侧注释「引擎缺省英文,view 覆盖为 zh」契约相悖（:1286 注释自认"R259 zh 默认"）；R262 的 16 键注入当前两处调用点完整，但未来新入口漏注入时 EN 用户会看到中文 |
| V5 | P3 | `components/WorkspaceView.tsx:240,704` | `labelKey.includes('.') ? t(labelKey) : labelKey` 点号 duck-type 启发式在两处重复——B 线 V1 修 paramMeta 裸英文时应顺手收敛成 `domain/presetI18n.ts` 风格的单一 helper（回退语义已在那里验证过），否则第三个消费点还会复制这段脆弱判断 |

### T — 测试盲区（3）

| # | 严重度 | 位置 | 证据 |
|---|---|---|---|
| T1 | **P2** | `tests/renderer/`（无 i18n 动态键族不变量测试） | 本次脚本验证 55 个 EffectKind 的 `effect.<kind>` + `effects.preset.<kind>.label/.desc` 在 EN 表**当前全部存在**（missing=NONE），但没有任何测试锁定——新增 EffectKind 忘配键只会运行时显示键名原文（t() 回退）；现有测试只盖 `games.onboard/recap`（gamesI18nKeys）与 R85 壳层清单（i18nShellKeys） |
| T2 | P3 | `tests/renderer/hooks/`（无 useEngineLoop 测试） | 全 runtime 最关键件（tickPending 门控、单飞 worker、3D 旁路、R42/R43 可见性门、droppedTicks）零直接测试——U1/U4 的冻结路径正落在这里；B 线 T2 已提 domain hooks 大盘，此处补 useEngineLoop 具体盲区 |
| T3 | P3 | `tests/renderer/domain/`（12/19 有测试） | 无测试的 7 个里有真实逻辑的 3 个：`curatedEffects.ts`（选中规则 + newest-first 语义）、`primaryParams.ts`（覆盖表 + 数值回退）、`presetI18n.ts`（label 缺键回退英文）；其余 4 个（paramMeta/ambientPresets/previewOverride/uiFontScale）为纯数据/浅函数 |

### X — 清理 / 卫生（3）

| # | 严重度 | 位置 | 证据 |
|---|---|---|---|
| X1 | P3 | `src/shared/ipc.ts:52` | `overlayFrame: 'overlay:frame'` 是 130+ 通道里唯一不带 `rgbbox:` 前缀的（历史遗留；改名是行为变更需 R-N，先记录） |
| X2 | P3 | `src/shared/types.ts:390` | `CaptureSource` 的 doc 注释漂到了 `CaptureEntry` 的 R77 注释上方，成孤立注释 |
| X3 | P3 | `domain/automation.ts:42-43,48-49` | `randomInRange(lo, lo, step)` 用"随机函数 + 相等区间"表达确定值——只靠 `Math.random()*0=0` 隐式成立，且 `snapToStep` 可把结果推离 min/max 半步；应改语义化的 clamp+snap |

### 测试覆盖盘点（本层全量）

| 层 | 测试 | 缺口 |
|---|---|---|
| shared | logger（轮转/清理 16 例）、types、modelsManifest 不变量（预算 ≤100MB 锁定）、titleBarTheme、timeFormat、aiChatValidation、aiProviders、dtlnDsp、lanProtocol | 基本无缺口；snipHotkeys/kokoroVoices 纯数据不测可接受 |
| IPC 契约 | `tests/integration/ipcChannels.test.ts`（preload↔通道同步）+ `tests/main/ipcContract.test.ts` | 无 |
| i18n | i18nShellKeys（R85 子集）、gamesI18nKeys（onboard/recap） | 动态键族不变量（T1）、死键 lint（V2） |
| domain | 12/19（automation/gamesTelemetry/inputConfig/mediaError/overlayDistribution/profileUtils/quickDimensions/randomizer/schedule/uiTheme/visionErrors/voiceScribe） | T3 的 3 个逻辑件 + 4 个数据件 |
| hooks/domains | 仅 useGestureLightingDomain 直接测试 | 其余 8 个靠组件测试间接覆盖（B 线 T2 已提） |
| hooks 其余 | useAudioAnalyzer（9 例含零重渲染断言）、useVisionInput、useModelStore、tabNavigation、viewPersistence | **useEngineLoop 零直接测试（T2）**、usePersistedState/useRecentEffects/useAiAudioStream |
| engine 剩余件 | textRenderer（形状/锚点/缩放 12 例）、videoWall（19 例）、videoWallFrame（9 例） | extractSubFrame 舍入边界（B 线 U5/T3 已提，不重复）；textRenderer 缓存行为无测试（U2） |

## 3. 价值任务建议（过三关：真实用户价值 / 成本 / 风险）

| # | 任务 | 三关评估 |
|---|---|---|
| 1 | **worker 异常兜底（U1+U4）**：onmessage 包 try/catch 并回一条 error 帧或经 `error` 事件重置 `tickPending`；onTick 给 `activeLayer()` 加空层守卫 | 价值：消灭「引擎静默冻结」整类故障（用户现状是灯效停摆且零提示，只能重启）；成本 ~30 行 + 1 个假 worker 测试；风险低（纯加固不改正常路径）。可与 B 线 U1（import 校验）合并为一个 R-N 两道防线 |
| 2 | **文本 mask 缓存上限（U2）**：两处 cache 改 LRU（容量 32）或「网格尺寸变化即清空」 | 价值：长会话内存不再随打字无界增长（高级网格 4MB/键入）；成本 ~20 行；风险≈0 |
| 3 | **i18n 健康测试 + 死键清理（T1+V2）**：a) 不变量测试锁定 55 kind × 3 键族 × 双语；b) 删 ~45 已验证死键（先与 i18nShellKeys/SHELL_KEYS 交叉核对，同步改测试） | 价值：1804×2 键的资产恢复可维护性，新效果忘键从「运行时键名原文」变「CI 红灯」；成本低；风险低（测试先行、删除可回滚） |
| 4 | **t(key, params) 插值 helper + 38 处迁移（V1）**：以 `useVisionInput.interpolate` 为范式提到 i18n 模块，占位符双侧集中校验；可按视图分批 | 价值：杜绝 `{n}` 原文上屏缺陷类；成本中（机械替换）；风险低（行为等价，测试兜底） |
| 5 | **导入/存储白名单收敛（U3+B3）**：层包 kind/blendMode 与 useRecentEffects 读侧统一走 effectPresets 白名单（randomizer.ts:34 范式抽成共享小函数） | 价值：外部 JSON/localStorage 不再能注入非法 kind 触发键名原文与元数据失配；成本 ~15 行；风险低 |
| 6 | **automation 确定值语义化（X3）**：`randomInRange(lo,lo)` 换 clamp+snap helper，2 行调用点 | 价值：消除"随机函数表达常量"的认知陷阱（后续维护者易误改）；成本极低；风险无 |

## 4. 优先级排序

1. **#1 worker 异常兜底**（U1 P2 + U4：唯一能造成用户可见功能死亡的路径，且现网可触发）
2. **#2 mask 缓存上限**（U2 P2：确定性资源泄漏，修法无争议）
3. **#3 i18n 健康测试 + 死键清理**（T1+V2：一次性把词表资产锁进 CI）
4. **#5 导入白名单收敛**（U3+B3：小而实，配合 B 线 U1 形成 import 完整防线）
5. **#4 插值 helper 迁移**（V1：价值确定但可分批，先新代码后存量）
6. **#6 automation 语义化**（X3：顺手项）

未列入任务的发现（B1 logger 乱序/换行消毒、B2 useAudioAnalyzer 冗余、V3 cast 收敛、V4 SURVIVAL_LABELS 中英混默认、V5 启发式收敛随 B 线 V1、X1/X2 记录在案）：均 P3，待对应模块下次 R-N 顺手处理。

---
*Review by Claude Code · 只读审计，未改任何产品代码 · 键集/死键结论来自脚本扫描（literal + 动态前缀双重排除）+ 抽样人工复核*


---

## 主审复核（2026-10-11，对码核实）

- **worker 异常兜底**：✅ 实锤——`previewEngineWorker.ts` 全文零 try/catch；`useEngineLoop.ts:61-66` tickPending 门闩由 worker 回消息清除，worker 抛错=引擎永久冻结。与 REVIEW-shell-loop TA6 汇聚为一个修复项（worker 兜底+门闩复位）。
- **mask 双缓存**：✅ textRenderer 3 处 cache 命中；canvasTextMask 侧 REVIEW-engine TA3 已覆盖——合并为缓存治理一项。
- i18n 静态键平价正向断言采纳（R240 延续）。
