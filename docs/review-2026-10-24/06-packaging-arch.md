# 06 — 打包分发与构建环境兼容性专项评审（RGBBox）

- 评审日期：2026-10-24 · 评审人：资深软件架构师（静态评审）
- 范围：`package.json` build 段、scripts/ 打包验证链、CI workflows、模型资产引用链、版本与产物卫生、文档一致性、R-N 合规
- 约束遵守：仓库只读；未构建、未跑测试、未启动应用（相关结论均为静态推断，逐条标注置信度）
- 证据基线：git HEAD 0fa0f0a（HEAD 中 package.json version=0.3.86，工作区 0.3.90）；本机既有产物 `release/RGBBox-0.3.90-win.zip`（2026-10-24 00:39）与 `release/builder-effective-config.yaml`

---

## 0. 摘要

**健康度：打包产物链路本身设计成熟（门禁/剪除/白名单/原子写均有 R-N 背书），但「构建环境」这一层是系统性盲区：环境类故障（electron zip 缓存损坏、GitHub 直连失败、跨机差异）无任何自动化防线，相关知识只存在于私有 memory 与 PRD 证据段落，导致同一类故障在多台机器反复发生。** 打包自验证（verify-packaged-app）与 CI 均不覆盖 packaging 阶段；afterPack 存在一处从未生效的剪除 bug（每包多带 19MB 死重）；splat 模型下载 URL 全部 404；文档与配置漂移 ≥10 处。

### Top 10 问题（按严重度）

| # | 问题 | 位置 | 置信度 |
|---|---|---|---|
| 1 | electron zip 缓存损坏 → app-builder `unpack-electron` 静默产出缺 electron.exe 的 win-unpacked → rename ENOENT（本次跨机故障的机制）；`node_modules/electron/dist` 缺失是**同根共症状**而非直接原因；全链路无任何检查/自愈 | node_modules/app-builder-lib/out/electron/ElectronFramework.js:51-54（rename 点）+ PRD R216.6 先例 | 机制 Confirmed（二进制字符串级证据）；故障机归因 Likely |
| 2 | afterPack 的 @img/sharp 剪除路径拼接 bug：`join(...,'node_modules', 'node_modules/@img')` 双重 node_modules → `existsSync` 永假 → R176.3 的"drop image stack"**从未生效**，每包带 19MB sharp/libvips 死重；产物实证 `release/win-unpacked/resources/app.asar.unpacked/node_modules/@img`（19MB）仍在 | scripts/afterPack.mjs:77-83（引入 commit 54faa46，2026-09-26） | Confirmed |
| 3 | verify-packaged-app.mjs **未接线**：package.json scripts 无入口、predist:* 钩子不含、CI 无档——打包产物验证纯手动（R95 时手动跑过一次 4/4 PASS） | package.json:10-49；scripts/verify-packaged-app.mjs | Confirmed |
| 4 | CI 无打包档：ci.yml 三档（typecheck/test/build，ubuntu）+ nightly.yml（windows 快照+soak）均不运行 electron-builder——packaging 阶段回归（含 #2 这类静默缺陷）在 CI 不可见 | .github/workflows/ci.yml:14-60、nightly.yml:24-48 | Confirmed |
| 5 | 5 个 splat 模型的下载 URL 全部指向死链 release `models-v1`（R279 已双证 404 但 URL 未换）：打包版「下载模型」按钮必失败；新机 `yarn download-models` 也必失败；且 `scripts/models-manifest.json` 与 `src/shared/modelsManifest.ts` 两份清单重复维护、已漂移 | src/shared/modelsManifest.ts:47-87；scripts/models-manifest.json:8-34 | Confirmed |
| 6 | `dist:win` 的 `npm version patch` 在链路体首执行：packaging 阶段失败也烧版本号——本机 HEAD 0.3.86 → 工作区 0.3.90 四连 bump 未提交；另 `yarn dist`（不带 :win）无门禁钩子（predist 只有 bump） | package.json:18-23,46-48 | Confirmed |
| 7 | 无镜像固化：无 .yarnrc/.npmrc，ELECTRON_MIRROR 未固化——GitHub 直连脆弱环境重复踩坑（PRD R1159/R1239 两次记录手工 npmmirror 恢复） | 仓库根目录（无该文件） | Confirmed |
| 8 | verify-env.mjs（恰好是本故障类的检查器）引入时**无 R-N 条款**（commit bc7d243，2026-10-10，PRD 全文搜不到 verify:env/环境健康），且不在任何自动链路——工具存在但防线未部署 | git bc7d243；PRD-0002 全文检索 | Confirmed |
| 9 | 文档漂移 ≥10 处（详见 §4）：CLAUDE.md 称 icon/模型资产"排除出 release 包"（实际 icon.ico/png + rapidocr 15MB 经 extraResources **进包**）、README 称 dist:win 产出 "installer"（实为 zip）、download-models 注释称 postinstall 自动调用（实际无 postinstall）、engines 缺失（verify-env L0 查 ≥20 而 CI/devDep 要求 ≥22.19） | CLAUDE.md:50-64；README.md:66,178；scripts/download-models.mjs:11；package.json（无 engines） | Confirmed |
| 10 | 产物归属卫生：dist-archive7z.mjs 不产哈希、无 git SHA 侧车；release zip 版本绑定工作区 bump 但 bump 不随发版提交；7-Zip 路径写死 `C:\Program Files\7-Zip\7z.exe`（跨机即挂） | scripts/dist-archive7z.mjs:16,29 | Confirmed |

---

## 1. 配置自洽性审计

### 1a. files 排除的模型资产 vs 全部引用点

打包事实（`package.json:105-112` + `release/builder-effective-config.yaml` 一致）：`out/renderer/assets/models/*.{splat,ksplat,spz,ply}` 被排除；同目录 `*.led-map.json` **随包**；`out/renderer/models/**`（landmarker .task，12MB）与 `out/renderer/vendor/**`（mediapipe/ort wasm，51MB）随包且 asarUnpack。

逐引用点：

| 引用点 | 打包版上指向什么 | 缺失时行为 | 与声明一致性 |
|---|---|---|---|
| `src/renderer/src/3d/useModelStore.ts:86-99`（splatUrl） | 未下载→空串 `''`，UI 状态 `remote` 可点下载 | 不渲染 splat，无崩溃（降级） | ✅ 与"模型不随包"一致 |
| `useModelStore.ts:55-67` fetchLedMap `/assets/models/<ledMapFile>` | `media://app` → `out/renderer/<path>`（src/main/index.ts:1694-1696，traversal-guarded；asar 内 fs 可读） | `!res.ok` → 返回 null，LEDMapper 无 LED 图层 | ✅ led-map.json 确实随包（本机 out/ 与产物均有 2 份） |
| `src/main/index.ts:1517,1540`（modelGetCachedPaths / modelDownload） | `userData/models/` 缓存 + `MODELS_MANIFEST` URL 下载 | URL 404 → 下载 error 状态（**功能坏但不崩**） | ⚠️ R279 已证 404 未修 URL（见 Top#5） |
| `LEDMapper.tsx:134,185` / `SplatViewer.tsx:320-338`（addSplatScene） | file://（已缓存）或 blob:（导入） | 空 URL 不调用 | ✅ |
| `Model3DView.tsx:90`（accept=".splat,.ply,.ksplat,.spz" 导入） | 用户本地文件，blob: | 与包无关 | ✅ |
| `src/shared/led-positions/*.led-map.json`（第二份 led-map 源） | 随包（out/ 由 public 拷贝） | — | ⚠️ 与 `src/renderer/public/assets/models/` 重复存放同名文件（数据双源，未单源化） |
| `scripts/download-models.mjs` + `scripts/models-manifest.json`（outputDir=`src/renderer/public/assets/models`） | 仅 dev 预下载；**5 个 URL 全死链**，失败只 warn（:143-148 非 strict） | 本机该目录仅 2 个 led-map.json，无任何 .splat——排除规则在本机实为"空调用" | ⚠️ 注释 `:11` 称"postinstall 自动调用"，package.json **无 postinstall**（漂移） |
| `CLAUDE.md:53`「拉取 5 个高斯泼溅模型到 renderer assets」 | 同上，实际拉不动 | — | ⚠️ 漂移 |

结论：排除规则本身自洽（splat 二进制不进包、led-map 进包、landmarker/wasm 进包并 unpack），渲染层降级路径正确；**但运行时下载链路是坏的（URL 404）**，CLAUDE.md"仅本地 dev 用"的说法反而掩盖了"打包版下载功能已死"这一事实。

### 1b. node_modules 打包链路与 asarUnpack 完整性

electron-builder 决定 node_modules 的方式：`files` 未列 node_modules 时，自动纳入**生产 dependencies**（devDeps 排除；R95.1 正是利用此机制把 renderer 依赖移 devDeps）。生产 deps：`@huggingface/transformers`、`fix-webm-duration`、`kokoro-js`、`onnxruntime-node`、`pinyin-pro`、`piper-phonemize`。

含原生/真实路径需求资产的包与 asarUnpack 覆盖：

| 包 | 原生/资产 | asarUnpack 显式 | 实际落位（产物实证） | 结论 |
|---|---|---|---|---|
| onnxruntime-node | `.node`（bin/napi-v6/…） | ✅ `**/node_modules/onnxruntime-node/bin/**`（顶层+嵌套 glob 双覆盖） | 65MB（afterPack 剪到 win32/x64） | ✅ |
| @huggingface/transformers 嵌套 onnxruntime-node | `.node` | ✅ 同上（`**` 前缀） | afterPack 第二段剪除生效（:56-76） | ✅ |
| piper-phonemize | `piper-phonemize-wasm-nodejs.wasm`（19MB，无 .node） | ❌ 未列 | **smartUnpack 自动落 app.asar.unpacked**（产物实证在位） | ✅（靠默认兜底，建议显式化） |
| @img/sharp-win32-x64（经 transformers 可选依赖进包） | `libvips-42.dll` + `.node`（19MB） | ❌ | smartUnpack 落盘；afterPack 想删但**路径 bug 删不掉**（Top#2） | ❌ 死重 |
| kokoro-js / transformers JS | 纯 JS | — | asar 内（app.asar 189.8MB 主要构成） | ✅ |

对 afterPack/verify 脚本的断言核查：
- afterPack.mjs 对 ort 剪除**无产物断言**（只 console.log）；对 @img 剪除（:77-83）因 bug 从未执行且无验证。
- verify-packaged-app.mjs 断言了 ort 原生可用（DTLN round-trip :33-56），**未断言** @img 不存在、平台目录唯一性、asar 体积。
- 结论：`asarUnpack` 清单对已知原生依赖完整；缺口在"想删的死重没删掉且没人看"。

### 1c. afterPack.mjs 全文审计（scripts/afterPack.mjs，108 行）

做了三件事：
1. R95 ort 平台剪除（:28-50）：遍历 `bin/napi-v6/<platform>/<arch>`，非当前 platform/arch 删除；arch 枚举用 `Arch[archRaw]` 反查（对 26.x 数字值序免疫，R95 踩坑①修复在位）。**生效**（产物 bin 只剩 `win32/x64`）。
2. R176.3 嵌套 ort 剪除 + @img/sharp 移除（:52-83）：嵌套剪除路径手拼完整、**生效**；@img/sharp 移除路径**双重 node_modules 拼接 bug、从未生效**（`join(appOutDir,'resources','app.asar.unpacked','node_modules', 'node_modules/@img')`，:78）。
3. Windows 图标嵌入（:85-107）：`signAndEditExecutable=false` 规避 winCodeSign/开发者模式问题，改用 rcedit 手嵌——设计合理。

失败是否被吞：
- 剪除段：readdirSync/rmSync 异常会 reject → electron-builder fail（不吞）。但 `existsSync` 守卫使 bug 路径**静默跳过**（本例）。
- 图标段：exe 不存在（:91-94）与 icon 不存在（:98-101）只 `console.warn` 后 return——**静默降级**：exe 缺失本不该到此步（rename 已在框架层先跑），但 icon 缺失时产物将无自定义图标且构建绿。
- rcedit 失败：await reject → fail（不吞）。

跨机路径假设：`resolve(packager.projectDir,'build','icon.ico')` 项目相对（OK）；无盘符/绝对路径假设；唯一硬编码绝对路径在 dist-archive7z.mjs:16（7-Zip）。

---

## 2. 打包版自验证体系覆盖度

| 脚本 | 断言内容 | 接线 | 覆盖缺口 |
|---|---|---|---|
| verify-packaged-app.mjs | 打包 exe CDP 启动、视频工作台 UI、**打包内 ort 原生 DTLN 真推理**（batches≥4 且 meanAbs>1e-4）、存活 | ❌ 无 script/钩子/CI（仅 R95 手动记录 + T4 文档 NAV-06 引用） | 不查 @img/平台剪除/asar 体积；DTLN 需联网下模型（hf-mirror）——**离线/首装场景未覆盖**；硬编码 `release/win-unpacked/RGBBox.exe`（:10，仅 win）；不覆盖 3D 模型 404、rapidocr 内置缺失、软件 GL 渲染 |
| verify-release.mjs（predist:win/mac/dir 钩子，--quick） | L0 typecheck→L1 全量单测→L2 build→L3 ui:snapshot→L4a smoke-app→L4b smoke-games（首败即停；R223.5 删掉 mtime 跳过优化） | ✅ dist:win/mac/dir 前置 | 全部跑在 **dev electron**（cdp.mjs:109 spawn `node_modules/electron/dist/electron.exe` + out/）——packaging 阶段（electron zip 缓存、asar、afterPack、extraResources）零覆盖；无 verify:env 层（electron dist/缓存健康不在门禁内） |
| smoke-app.mjs | 9 视图可达、设置弹层、5 项 IPC 往返、media://app 服务 + media://local 白名单 403 | ✅ 经 verify-release L4a | dev 版专属；离线行为未模拟 |
| verify-env.mjs | L0 node≥20 / L1 vitest / L2 typecheck / **L3 electron.exe 存在 + path.txt 无尾换行 + spawn --version** / L4 build / L5 smoke | ❌ 纯手动（无 pre-hook/CI/门禁引用） | **不查 electron zip 缓存**（packaging 真正消费的东西）；L0 阈值 ≥20 过松（devDep 要求 ≥22.19，CI 用 22） |
| CI（ci.yml + nightly.yml + pages.yml） | typecheck/test/build（ubuntu，含三入口 CSP 断言）；nightly windows typecheck+build+L3 快照+soak×4；pages 部署 docs | ✅ | **无任何 electron-builder 打包档**；R306.5 T12/T13/T14 的 ✓ 回填（bd5fd57）属实但 T 档不含 packaging；nightly 首跑红分诊（windows 软件 GL 阈值，0fa0f0a 前序）与本专项正交 |

结论：验证体系对"dev 产物质量"覆盖厚实，对"packaging 阶段"与"构建环境"两层是空白；「无本地模型资产、离线、软件 GL 渲染」的非开发机场景仅有 nightly windows 软件 GL 快照一条间接覆盖。

---

## 3. 构建环境脆弱性防护现状与建议（ROI 排序）

### 3a. 已知记录清单

- `docs/lessons.md`：**只有 L1-L3**（vitest TTY/瞬态计数/abort 超时）——**无 electron dist 清空、无网络下载失败、无 node_modules 脆弱性记录**。任务书线索"docs/lessons.md 应有记录"→ **不成立**。
- 该知识实际存放处（分散、部分私有）：
  - 私有 memory `electron-dist-restore.md`（yarn add 清空 dist；zip 缓存解压三步恢复）——**协作者/其他机器不可见**；
  - PRD R216.6 证据段（3865 行）："本机 electron zip 缓存残缺致 unpack-electron 缺 electron.exe 的环境坑以 `-c.electronDist=node_modules/electron/dist` 绕过"——**与本次故障机症状同构的先例**；
  - PRD R123（1239 行）/R136 前（1159 行）证据段：electron 二进制丢失、npmmirror 重拉、node 被外部卸载——均为"插曲记录"，无防护条款。
- 结论：同一故障家族已在本仓出现 ≥4 次（含本次），零工程化沉淀。

### 3b. 现有防护盘点

| 防护 | 状态 |
|---|---|
| verify-env.mjs L3（electron.exe + path.txt + spawn） | ✅ 存在但**手动触发**；不查 zip 缓存 |
| dist-clean.mjs（Defender/句柄 EPERM/EBUSY/ENOTEMPTY 12×4s 重试 + cmd rd 快路径） | ✅ 成熟（注释详实） |
| predist:win/mac/dir 门禁先于 npm version patch（R222.1） | ✅ 生效（gate 失败不烧号；但 packaging 失败仍烧，见 3c） |
| .yarnrc/.npmrc 镜像固化、ELECTRON_MIRROR、postinstall 校验、electron 缓存完整性检查 | ❌ 全部缺失 |
| engines 字段 | ❌ 缺失（node 版本约束只在 ci.yml 注释与 verify-env L0 里各说各话） |

### 3c. npm version patch 副作用与改法草案

现状：`dist:win = npm version patch && predist:clean && build && electron-builder --win`（package.json:21）——bump 在最前，electron-builder 失败（本次 ENOENT 即此类）版本号已烧；本机 4 连 bump 未提交即证据。`yarn dist`（:20）另带 `predist` 钩子 bump（:18）且**无门禁**（R95 踩坑②早有记录）。

草案（低风险渐进）：
1. 把 `npm version patch` 移到 electron-builder 成功之后：`dist:win = predist:clean && build && electron-builder --win && npm version patch --no-git-tag-version && yarn dist:7z && yarn verify:packaged`（失败链上任何一步红都不烧号）；
2. 或保守版：保留现序，但发版时以 `git add package.json && git commit` 随发版提交 bump（T15 已有"外科式暂存"先例可复用）；
3. 删除 `dist` 裸脚本或给它补 `predist` 门禁（`verify-release --quick`），消灭无门禁打包入口。

### 3d. 防护建议清单（ROI 排序）

| 优先 | 建议 | 成本 | 消灭的故障类 |
|---|---|---|---|
| R1 | **dist 前置环境层 fail-fast**：verify-release 增 L-1（或 predist:win 首步调 verify-env）：`node_modules/electron/dist/electron.exe` 存在 + path.txt 无尾换行 + **`%LOCALAPPDATA%/electron/Cache/electron-v41.4.0-win32-x64.zip` 存在且 size>100MB（或可解中央目录）**；红时打印恢复命令（删缓存 zip→ELECTRON_MIRROR=npmmirror 重装/重打包） | 半天（verify-env 已有 L3，扩一条缓存检查） | 本次故障类（缓存损坏/dist 缺失/path.txt 污染） |
| R2 | **镜像固化**：仓库 `.npmrc`/`.yarnrc` 写 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`（或 dist 脚本注入）+ `engines: {node: ">=22.19"}` | 1 小时 | GitHub 直连 ECONNRESET/超时家族（PRD 已两遇） |
| R3 | **修 afterPack @img bug（一行）+ verify-packaged-app 增三断言**（@img/sharp 不存在、ort bin 平台目录唯一、打包 exe 存在） | 1 小时 | 19MB/包死重 + 剪除回归不可见 |
| R4 | **verify-packaged-app 接线**：`verify:packaged` script + 打包成功后自动执行（进 R1 的新链序尾部）；P2 再议 CI windows 打包档（736MB 产物 runner 缓存/时长成本） | 半天 | packaging 产物回归（afterPack/asar/extraResources 类） |
| R5 | **版本 bump 后置**（3c 草案 1）+ `dist` 裸脚本收口 | 1 小时 | 版本号烧毁/归属漂移 |
| R6 | **lessons.md 增 L4-L6**：electron dist 清空三症状与恢复、zip 缓存损坏、npmmirror 镜像——把私有 memory 入库 | 30 分钟 | 跨机/协作者知识不可达 |
| R7 | **模型清单单源 + splat URL 修复**（hf-mirror 可用源或 UI 明示不可用）；download-models 默认 strict（或 CI 档用 strict） | 半天 | 新机 dev 初始化静默缺模型 + 打包版死链按钮 |
| R8 | **产物哈希归档**：dist:7z 产 `.sha256` + 写 git SHA/electron-builder effective config 侧车；7-Zip 路径改 `where 7z` 探测 | 1 小时 | 产物归属/审计 |

---

## 4. 文档漂移清单（≥10 处，逐条核对）

| # | 文档说法 | 代码/配置事实 | 性质 |
|---|---|---|---|
| 1 | CLAUDE.md:64「模型资产（`build/icon.ico/png`、`*.splat`…）由 files 排除出 release 包」 | icon.ico/icon.png 经 **extraResources 进包**（resources/icon.ico、icon.png，main 进程 5 处 `process.resourcesPath/icon.ico` 消费：src/main/index.ts:270,1579、overlayManager.ts:63、screensaverManager.ts:101）；build/rapidocr 15MB 同样进包（rapidOcrService.ts:63） | Confirmed 错误 |
| 2 | CLAUDE.md:50-52 dist 命令注释只提"patch 版本号+dist-clean+build+electron-builder" | 漏 `predist:win` 六层门禁（R222.1 后链路第一步） | Confirmed 不全 |
| 3 | README.md:66/178「dist:win # build + package Windows **installer**」 | win.target 仅 zip（package.json:128-135）——portable zip 非 installer（nsis 配置存在但不构建） | Confirmed 错误 |
| 4 | scripts/download-models.mjs:11「Called automatically by the postinstall npm hook」 | package.json 无 postinstall | Confirmed 过时 |
| 5 | scripts/models-manifest.json:3「Run `npm run download-models` (or `npm install`) to fetch them」 | npm install 不触发；npm run（非 yarn）口径也不同 | Confirmed 过时 |
| 6 | CLAUDE.md:53「yarn download-models # 拉取 5 个高斯泼溅模型」 | 5 个 URL 全 404（R279 双证），新机必然 0/5 且非 strict 只 warn | Confirmed 名不副实 |
| 7 | package.json 无 engines；verify-env.mjs:52 L0 查 node≥20 | ci.yml:20 注释与 devDep 实际要求 ≥22.19、CI 统一 node22 | Confirmed 不一致 |
| 8 | RELEASE-SIGNING.md:26「当前 electron-builder.yml（或 package.json build 段）」 | 仅 package.json build 段（无独立 yml）——措辞含糊但非错误；:30「.splat 已由 files 排除」✅ 准确 | 基本一致 |
| 9 | RELEASE-SIGNING.md「未启用签名」 | win.signAndEditExecutable=false ✅ 一致（afterPack 用 rcedit 补图标的因果链注释在 afterPack.mjs:3-7） | ✅ 一致 |
| 10 | PRD R95 证据「asar 5.4MB」 | 现 app.asar 189.8MB（kokoro/transformers 进包，R176.3/R216.6 有条款背书）——历史数字未在目录页标注口径变化 | 轻微（有后继条款解释） |
| 11 | PRD R176.3「drop the optional image stack」 | 从未生效（Top#2），PRD 无更正 | Confirmed 条款-实现背离 |
| 12 | docs/prd/README.md 索引「当前活跃 R-N 仅列 R13-R16」 | 实际活跃 R-N 远不止（R95-R310 均在 PRD 内追加）——索引页更新滞后 | 轻微 |

---

## 5. 版本与产物归属卫生

- **本地 M package.json**：HEAD=0.3.86 → 工作区 0.3.90（4 次 dist 尝试 bump；R306 T15 记录过"工作树保留用户预存版本号 0.3.89"的操作先例）。建议：走 3c 草案后此类未提交 bump 不再产生；当前 0.3.90 已对应 `release/RGBBox-0.3.90-win.zip`，应随下一次发版 commit 一并入库（或 revert 回 HEAD 号重打）。
- **release/ 卫生**：`.gitignore` 已含 `release/`、`release-v*/`、`out/`、`dist/` ✅；产物不入库 ✅。
- **dist-archive7z.mjs**：从 win-unpacked 产 `RGBBox-<version>-win.7z`（LZMA2 -mx=9）；**无 sha256**、无 git SHA 侧车、7-Zip 路径硬编码（:16）。建议 R8。
- 体积事实（本机 0.3.90 产物静态测量）：win-unpacked 736MB / zip 281MB / app.asar 189.8MB / asar.unpacked 196MB（ort 65 + out 62 + HF 嵌套 34 + @img 19 + piper 19）/ locales 47MB。增量构成与 R216.6 的条款背书一致，唯 @img 19MB 无背书（Top#2）。

---

## 6. R-N 合规检查与建议追加条款草案

现状检索（PRD-0002 全文）：**无任何"构建环境/跨机/兼容/分发防护"类 R-N**。相关既有条款：R95（打包瘦身，✅）、R176.3（体积核查，✅ 但 @img 项未生效）、R216.6（发版记录含 electronDist 绕过，仅证据）、R221.6/R222（CI+门禁，✅）、R223.5（dist-hook mtime 修复，✅）、R236.4（签名评估，✅ 评估文档）、R279（splat bytes 校验，✅ 但 URL 死链未修）、R306.5 W3（CI 三档，✅ 无打包档）。另发现 **verify-env.mjs 引入（bc7d243）无 R-N 条款**——建议补登。

建议追加（编号以追加时最新顺延，当前最高 R310；均追加到 PRD-0002 §3 对应小节，遵守"禁开新 PRD"）：

| 建议 ID | 归入章节 | 标题 | 验收点草案 |
|---|---|---|---|
| R311 | §3 → R222 发布门禁体系小节（R95/R222 线） | 构建环境自愈门禁（dist 前置环境层） | ① verify-release 增 L-1 环境层：electron dist exe 存在 + path.txt 无尾换行 + electron zip 缓存存在且 >100MB，任一红即停并打印恢复命令；② dist:win/mac/dir 首步必经 L-1；③ lessons.md 增 L4（dist 清空/缓存损坏/镜像恢复三条）；④ 补登 verify-env 的 R-N 溯源（bc7d243） |
| R312 | §3 → R176 打包体积核查后续 | afterPack @img 剪除根修 + 打包产物断言 | ① afterPack.mjs:77-83 路径修复（去掉双重 node_modules）；② verify-packaged-app 增断言：@img/sharp 不存在、onnxruntime bin 仅当前 platform/arch、打包 exe 存在；③ PRD R176.3 补更正记录（原剪除从未生效）；④ 打包前后体积差回归记录 |
| R313 | §3 → R95.4 产物线 | 打包产物验证接线（verify:packaged） | ① package.json 增 `verify:packaged`；② dist:win 成功后自动执行（接 R311 新链序）；③ 覆盖离线首装：--no-network 或模型预置一档；④ windows 以外平台 skip 语义明确 |
| R314 | §3 → R95.4 产物线 | 版本 bump 后置与产物哈希归档 | ① npm version patch 移至 electron-builder 成功后；② dist:7z 产 .sha256 + git SHA/effective-config 侧车；③ `dist` 裸脚本补门禁或删除；④ 发版提交模板含 version bump |
| R315 | §3 → R279 后续 / R13 文档线 | 模型清单单一源 + 死链修复 + 文档漂移收敛 | ① scripts/models-manifest.json 与 src/shared/modelsManifest.ts 单一源（生成或一致性测试）；② splat URL 切可用源（hf-mirror 上游）或 UI 明示不可用；③ download-models 默认 strict；④ §4 漂移清单 12 项逐条修正（CLAUDE.md:64/50-53、README installer、engines ≥22.19、postinstall 注释等） |

---

## 7. 被推翻的假设 / 已验证无问题

### 被推翻/修正的假设

1. **「electron-builder 26.8.1 打包时直接用 node_modules/electron/dist 的内容，而不重新下载」——半证伪**：
   - ❌ 不读 node_modules/electron/dist：`app-builder.exe`（x64）二进制字符串无 `node_modules/electron`、无 `electron/dist`（`unpack-electron`/`Cache` 字符串均在，rodata 可 grep 已验证）；ElectronFramework.js:134-204 仅 custom `electronDist` 分支才复制目录，默认分支 `downloadUsingAdjustedConfig` 走 app-builder。
   - ✅ 「缓存命中时不重新下载」为真：默认从共享 electron zip 缓存解压；且 **R216.6 本机先例实证"缓存残缺 → unpack-electron 产出的 win-unpacked 缺 electron.exe"**，随后的 rename ENOENT（ElectronFramework.js:51-54 正是报错点 `rename(electron.exe → RGBBox.exe)`）与故障机症状完全同构。
   - 修正后的根因表述：**electron zip 缓存损坏（或缺失+网络不可达）是根因**；`node_modules/electron/dist` 缺 electron.exe 是同一缓存/网络下的共症状（electron npm 包 postinstall 也从该 zip 解压），主审"dist 缺失导致打包失败"的定性是症状相关、机制归因不准确。
2. **「docs/lessons.md 应有 electron dist 清空记录」——证伪**：lessons.md 仅 L1-L3，无此记录；知识在私有 memory + PRD 证据段（§3a）。
3. **「打包版模型资产引用缺失会致功能崩坏」——部分证伪**：splat 引用降级正确（空串/remote 状态、ledMap null 容错）；坏的是下载 URL（404），表现为功能不可用而非崩溃。

### 已验证无问题

- 本机 electron dist 完好（electron.exe 存在；path.txt 内容 `electron.exe` 无尾换行，od 验证）；
- asarUnpack 覆盖完整：ort 顶层+嵌套 glob 均命中；piper wasm 靠 smartUnpack 自动落 unpacked（产物实证）；
- afterPack ort 平台剪除生效（bin 仅 win32/x64，65MB）；
- predist:win/mac/dir 门禁先于 bump（R222.1 结构性修复在工作区生效）；
- release/、out/、*.splat 等忽略规则齐全；
- dist-clean.mjs 对 Windows 文件锁的重试策略成熟；
- media://app 白名单 + traversal guard、media://local 403 白名单（R221.5/R268）与打包版一致；
- CI 三档与近 3 个 CI commit（bd5fd57/73a7083 等分诊记录）描述一致；RELEASE-SIGNING.md 与 win 签名配置一致。

## 8. 未验证 / 局限

- 未构建、未运行任何命令链（约束）；产物结论基于本机既有 release/ 静态检视（2026-10-24 00:39 产物）。
- 故障机（D:\Github\RGBBox，Windows Server 2022）不可直接访问：其"zip 缓存损坏"归因基于 R216.6 同构先例 + 症状匹配，标 **Likely**；app-builder 对坏 zip 的确切行为（静默部分解压 vs 其他）未实证，标 **Speculative**。
- app.asar 189.8MB 的逐项构成未展开（kokoro/transformers JS 体量）——不影响任何结论。
- Yarn 1 pre-script 执行语义以 R222.1 PRD 实证描述为准，未在本机复跑验证。
- GitHub runner 上 electron-builder 打包档的成本（时长/缓存）未实测，R4 的 P2 分级是估计。
