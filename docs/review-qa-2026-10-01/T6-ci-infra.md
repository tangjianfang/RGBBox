# T6 — CI 与测试基础设施审计（自动化测试专项）

审计人角色：CI/测试基础设施工程师。审计日期：2026-10-01。对象仓库：`C:\tjf\github\RGBBox`（branch `feat/app-review-fixes`）。
只读审计：未修改仓库文件、未启动应用、未运行 scripts/。

---

## 0. 摘要（三句话版）

1. **现有 CI（仅 typecheck 档）从未在 GitHub 上绿过**——两次运行全部死在 `yarn install`：devDep `@earendil-works/pi-coding-agent@0.87.1` 声明 `engines.node>=22.19.0`，而 ci.yml 钉的是 node 20（run 36804929215 日志实证）。R221.6⑥ 验收证据「typecheck 双绿」是本地跑的，远端红灯被漏报。
2. **「test 上 CI」的最大假设风险（headless-gl Linux 编译）实际不存在**：`gl@8.1.6` 在 GitHub Releases 挂有 node-v115（node20）与 node-v127（node22）的 linux-x64/linuxmusl/win32-x64 prebuilt（API 实查）；本地 Windows 之所以源码编译，只因开发机 node v23.11.1（ABI 131）无 prebuilt。且 `tests/renderer/gl/glHarness.ts:17-32` 本身就是「载入失败→it.skip」的降级设计，双保险。
3. 单测门禁（155 文件/1493 用例）与覆盖率阈值（R163.2）**完全没有任何远端承载**，分支保护为零（main 无 protection，API 实查）。建议按 v1（node22 修复 + ubuntu 全量 test 直上，预计 5-8min）→ v1.5（main 档 coverage 执行化 + 分支保护）→ v2（nightly windows 快照 + CDP 冒烟）三步走，全部需先追加 R-N。

---

## 1. 差距矩阵：各门禁「在哪跑 / 没跑」

| 门禁 | 本地承载 | CI（ci.yml） | pages.yml | 结论 |
|---|---|---|---|---|
| typecheck | `yarn typecheck`（package.json:15-17，node+web 双 tsconfig） | 有 job（ci.yml:14-23）但**红**（install 阶段挂） | — | 存在但从未绿 |
| 单元测试 | `yarn test`（package.json:25，本地 155 文件/1493 用例 ≈70s） | **无** | — | 全靠本地自觉（06 评审结论成立） |
| 覆盖率阈值 | `yarn test:coverage`（package.json:27；阈值 vitest.config.ts:78-93，R163.2 分层线） | **无** | — | 阈值只在开发者手动跑时生效，无强制 |
| 构建（out/） | `yarn build` = typecheck + electron-vite build（package.json:13） | **无** | — | 构建破损只能本地发现 |
| 打包（electron-builder） | `yarn dist:win/mac/dir`（package.json:20-23） | 无（合理，release 是本地动作） | — | 可接受 |
| UI 快照（pixelmatch 硬门禁） | `yarn ui:snapshot`（package.json:30；scripts/ui-snapshot.mjs:1-34，CDP+9 视图+0.1% diff 线） | **无** | — | R148/R163.3 的硬门禁零远端执行 |
| ESLint | **无**（devDeps 无 eslint，package.json:40-70） | 无 | — | 静态检查面只有 tsc |
| 许可证扫描 | 无 | 无 | — | 依赖含 MIT/BSD-2（gl）等，未见 license-check 工具 |
| 部署 | — | pages.yml 仅 docs/** 变更时发 Pages（pages.yml:3-7） | 有 | 与测试门禁无关 |

另：ci.yml:3-5 注释自认「test/snapshot 依赖 electron/headless-gl 原生模块，待 runner 预热后按平台矩阵补(P2)」——本审计结论是**该风险被高估**（见 §2），P2 可以提前。

---

## 2. 原生依赖 Linux CI 可行性判定

### 2.1 全量依赖中的原生模块清单（package.json:33-70）

| 包 | 版本 | 原生形态 | ubuntu runner + node20/22 可行性 | 依据与置信度 |
|---|---|---|---|---|
| `electron` | 41.4.0 | postinstall 下载平台二进制（测试**从不真启动** electron：全部 10 个 main/preload/integration 测试文件 `vi.mock('electron')`，grep 实证） | **Likely 直接过** | electron 官方每版发布 linux-x64 zip；下载仅是网络动作 |
| `gl`（headless-gl） | ^8.1.6 | `prebuild-install \|\| node-gyp rebuild`（node_modules/gl/package.json scripts.install） | **Likely**（node20=ABI115、node22=ABI127 均有 linux-x64 prebuilt） | GitHub API 实查 stackgl/headless-gl v8.1.6 release assets：`gl-v8.1.6-node-v115-linux-x64.tar.gz`、`node-v127-linux-x64.tar.gz`、linuxmusl、win32-x64、darwin-arm64 均在 |
| `onnxruntime-node` | 1.29.0（嵌套 1.21.0） | tarball 自带三平台 `bin/napi-v6/{darwin,linux,win32}`（本地实查，283MB），N-API v6 | **Likely**（无需编译无需下载） | 本地 node_modules 实查目录结构；napi_versions[6] 兼容 node20/22 |
| `piper-phonemize` | 1.4.12 | **纯 WASM**（`piper-phonemize-wasm-nodejs.wasm`，无 .node 文件，本地实查） | **Verified（本地）** 无原生风险 | — |
| `rcedit` | 2 | win32 exe，仅 win 打包期用 | 测试 CI 不触及 | — |
| `electron-builder` | 26.8.1 | 打包期才下载工具链 | 测试 CI 不触及 | — |
| `@earendil-works/pi-coding-agent` | 0.87.1 | 纯 JS，但 `engines.node>=22.19.0` | **Verified：这就是当前 CI 唯一红因** | run 36804929215 日志 + 包 package.json 实查；55MB，且是 AI 编码代理混进应用 devDeps（另线问题） |
| 其余（react/three/happy-dom/vitest/transformers/kokoro-js/pinyin-pro/pixelmatch/playwright-core…） | — | 纯 JS | 过 | — |

**测试的平台耦合面**：仅 3 个测试文件触碰 `process.platform`，且全部防御式处理——`tests/main/agentTools.test.ts:92,114`（非 win32 早退）、`tests/main/ocrService.test.ts:55-82`（defineProperty 覆写平台模拟）、`tests/main/crashLog.test.ts:47`（动态断言）。Linux 上跑预期行为一致（机制 Verified，Linux 实际运行为未验证项）。

**gl 的双保险**：`tests/renderer/gl/glHarness.ts:19-32` 顶层 await import，失败则 `itGl = it.skip`——即使 gl prebuilt 意外失效，测试套件也只会跳过 GL 用例而不会挂（设计意图注释明说「CI image without the native build」）。

### 2.2 三档方案

**a) 全量直上（推荐 v1 采用）**
- 前提：ci.yml `node-version: 20 → 22`（同时满足 pi-agent engines 与 electron 41 内嵌 node 22.x 对齐；或干脆移除该 devDep）。
- gl 在 node22 走 `node-v127-linux-x64` prebuilt，零编译。
- 风险残留：CI 冷启动 transform 无缓存、慢（见 §4）；个别测试对时序敏感（本地 0 失败，CI 首跑需观察）。风险评级：低。

**b) `--exclude` 排除 gl/3d 的矩阵**
- vitest 4.1.7 CLI 实证支持 `--exclude`（node_modules/vitest/dist/chunks/cac.BuBILSID.js:1080-1081「Additional file globs to be excluded from test」，追加而非替换）：
  ```bash
  yarn vitest run --exclude 'tests/renderer/gl/**' --exclude 'tests/renderer/3d/**'
  ```
- 但鉴于 glHarness 的降级设计 + prebuilt 存在，此档是**冗余保险**，仅在 a) 首跑翻车时启用；3d 测试本就是 happy-dom import-shape（`tests/renderer/3d/*.test.tsx:1` 声明 happy-dom），并不需要 gl。

**c) windows-latest runner**
- 原生面与开发机最接近（win32-x64 prebuilt v115/v127 均有），且可跑 headed electron（nightly 快照不需要 xvfb）。
- 成本：仓库 public（gh api 实查 `private:false`）→ 标准 runner 免费额度内，无账单代价；代价是 windows runner 排队+provision 慢 2-3min、磁盘 IO 慢（yarn install 预计 4-7min）。
- 定位：不作为 PR/main 常规档（慢），作为 nightly 快照档首选平台。

---

## 3. CI 分级设计（yml 骨架）

### 3.1 PR 档（目标 ≤5min）

```yaml
name: CI
on:
  push: { branches: [main] }
  pull_request: { branches: [main] }

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true      # 同 PR 旧跑取消，省时

jobs:
  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: yarn }   # ← 关键修复：20→22
      - run: yarn install --frozen-lockfile
      - run: yarn typecheck

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: yarn }
      - run: yarn install --frozen-lockfile
      - uses: actions/cache@v4
        with:
          path: node_modules/.vite/vitest    # vitest 4 transform 缓存（见 §4.2）
          key: vitest-${{ runner.os }}-${{ hashFiles('yarn.lock') }}
      - run: yarn test                       # v1 先全量；超 5min 再降级为子集：
      # - run: yarn vitest run tests/engine tests/shared tests/main tests/preload tests/integration tests/vision
```

预估：install ≈2-3min（冷）/1.5min（热，electron+onnxruntime 共 ~400MB 网络拉取）+ test 2-4min（4 核 runner 对 70s 本地全量的放大系数，Speculative）→ 首跑 5-7min，缓存热后 4-5min。node-env 子集（66/155 文件）可再省约四成。

### 3.2 main 档（push main 时追加 coverage + build）

```yaml
  coverage:                                # 与 test 二选一，勿并行双跑 vitest
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: yarn }
      - run: yarn install --frozen-lockfile
      - run: yarn test:coverage            # R163.2 阈值内置于 vitest.config.ts:78-93，
                                           # 回归即 exit≠0——「执行化」零额外配置
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: coverage-${{ github.run_id }}
          path: |
            coverage/coverage-summary.json  # json-summary 已配（vitest.config.ts:20）
            coverage/html
          retention-days: 90

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: yarn }
      - run: yarn install --frozen-lockfile
      - run: yarn build                    # typecheck+electron-vite build，防 out/ 构建破损
```

预估：coverage 档 = test 档 +1-2min；build 档 ≈3-5min。合并进 `test` job 串行亦可省一次 install。

### 3.3 nightly 档（快照 + CDP 冒烟）

首选 **windows-latest**（免 xvfb、免 apt 依赖、快照与开发机渲染栈同族）；ubuntu+xvfb 备选（见未验证项）。

```yaml
name: Nightly
on:
  schedule: [{ cron: '0 18 * * *' }]       # UTC 18:00 = 北京 02:00
  workflow_dispatch:

jobs:
  snapshot:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: yarn }
      - run: yarn install --frozen-lockfile
      - run: yarn build                    # ui-snapshot 的 assertFreshOut 要求新鲜 out/
      - run: yarn ui:snapshot              # = --compare，超 0.1% diff exit 1
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: ui-snapshot-diff, path: docs/ui-baseline/diff }
```

关键前置（v2 才做）：**CI 侧基线引导**——现基线 `docs/ui-baseline/`（scripts/ui-snapshot.mjs:22）是在开发机 GPU/DirectWrite 上采的，runner 渲染差异（字体光栅、GPU vs 软光栅）大概率超 0.1% 线。方案：首次 nightly 先 `--update-baseline` 由 runner 自采基线并提交（或存 artifact 作为比较源），之后 nightly 之间互比——「同机比同机」才能把 0.1% 的门禁语义保住（Speculative，需一次实验定夺）。

---

## 4. 提速

### 4.1 Setup 76s：setupFiles 全局 taxing（结构性问题，可修）

`vitest.config.ts:17` 把 `setupFiles: ['./tests/renderer/setup.ts']` 挂在**所有 155 个测试文件**上——包括 66 个 node 环境的 engine/main/shared/vision 文件。而 setup.ts 的全部内容都是渲染侧专用：jest-dom matchers（setup.ts:10）、i18n mock（:34）、**约 200 个图标的 lucide-react mock**（:42-89）、三个 GL 类 mock（:91-148）。每个 node-env 文件都在白付这笔 setup 税。

修法（需 R-N）：vitest 4 的 `test.projects` 拆两项目（CLI `--project`/`--project=!pattern` 过滤已实证存在，cac.BuBILSID.js:1115）：
- `node` 项目：`tests/{engine,main,shared,preload,integration,vision}/**`，**无 setupFiles**；
- `dom` 项目：`tests/renderer/**`，保留现 setup.ts（happy-dom）。
预计砍掉约 66 文件 × 全量 mock 注册 + 文件级 fork 成本。收益量级 Speculative（估 setup 76s → 40-55s），机制确定。次选轻改：setup.ts 顶部 `if (typeof document === 'undefined') return` 快速通道——但 vi.mock 的注册语义需实测确认不影响 dom 项目（低风险实验先行）。

### 4.2 Transform 25s

- vitest 4 默认就是 esbuild transform，无「换 esbuild」空间；有效手段是**缓存 transform 产物**：缓存目录实证为 `node_modules/.vite/vitest/<hash(projectName)>`（node_modules/vitest/dist/chunks/cli-api.C6CiCDM3.js:597；本地该目录存在）。CI 加 `actions/cache`（§3.1 已含）。注意 vitest 4 已弃用 `--cache.dir`（cac.BuBILSID.js:1132-1133），不要走自定义 cacheDir 路线。
- 本地侧：66 个 node-env 文件也因 4.1 的项目拆分减少 happy-dom 环境实例化开销。

### 4.3 Pool 与分片

- vitest 4 默认 pool = `forks`（cac.BuBILSID.js:913「default: forks」；coverage.DM_a_rWm.js:180 `resolved.pool ??= "forks"`）。本地无需改；CI 4 核默认并行即够。
- 分片：`--shard=index/count` 已实证（cli-api.C6CiCDM3.js:3605；coverage.DM_a_rWm.js:208-213）。但 coverage 跨分片需 `--coverage.merge` 合并（coverage.DM_a_rWm.js:221,953 存在 mergeReports）——v1/v1.5 全量单 job（预计 <8min）不值得引入分片复杂度；单 job 超 10min 再上。

---

## 5. 覆盖率执行化（R163.2 从「本地手动」到「远端门禁」）

现状：阈值已完整配置（vitest.config.ts:78-93：全局 58/46/48/56 + 七层分层线），reporter 已含 json-summary（:20），`yarn test:coverage` 就绪（package.json:27）——**缺的只是远端有东西去跑它**。

落地方案（即 §3.2 main 档）：
1. **阈值即门禁**：vitest 原生行为——任一层低于线 exit≠0，job 红。零新配置。
2. **趋势留存**：每次 main push 上传 `coverage/coverage-summary.json` + html 为 artifact（retention 90 天，`if: always()` 保证红时也留尸检数据）。
3. **趋势对比**（v1.5 可选）：后续 run 用 `actions/download-artifact` 拉上一run 的 summary，job summary 里打「本次 vs 上次」逐层 delta 表；再往后可接 Codecov 徽章——PRD R13.3.2（PRD:425）与 R16.5.1（PRD:1516）本就预留了这一步。
4. PRD 验收证据可引用 job URL，替代现在「本地自证」（R221.6⑥ 的教训：本地双绿≠远端绿）。

---

## 6. 防呆（本地门禁 vs 远端门禁双保险）

- **本地现状**：`yarn build` 含 typecheck（package.json:13），`dist:win/mac/dir` 链 build（:20-23）——所以**打包前置门禁只有 typecheck，不含任何测试**。打一个红灯测试全挂的 release 完全可能。
- **建议（需 R-N，CLAUDE.md 禁止顺改 package.json scripts）**：R-N 在 `predist` 链（package.json:18-23）加 `yarn test`（全量 70s，成本可接受；或至少 node-env 子集）——「本地打包出物=测试绿过」。
- **远端**：main 分支保护现状 = **零**（gh api `branches/main/protection` → 404 "Branch not protected"，实测）。单人仓库的现实平衡建议：
  - Require status checks：`typecheck` + `test`（+ main 档 `coverage`/`build`）过才可合并；
  - **不开** required reviews（单人无意义）；开启 "Do not bypass"（admin 不豁免）防自己手滑直推；
  - PR 工作流已是既定习惯（feat/* → main squash merge，git log 实证），加保护成本为零。
- 快照/nightly 属观测档，**不进** required checks（渲染差异易红，红了看报告而不是挡合并）。

---

## 7. CI 路线图

| 档 | 内容 | 预估时长 | 前置 |
|---|---|---|---|
| **v1（最小可行，本周可落）** | ci.yml：node 20→22（或移除 pi-coding-agent devDep）+ 新增 `test` job（ubuntu 全量 `yarn test`）+ concurrency 取消旧跑 | typecheck 2-3min；test 4-7min（冷）→ 3-5min（缓存热） | R-N 一条；首次跑通即验证 gl prebuilt 假设 |
| **v1.5（执行化）** | main push 加 coverage job（阈值门禁 + summary/html artifact）+ build job + main 分支保护（require typecheck+test）+ vitest transform 缓存 | +2-4min（与 test 档并行不增关键路径） | R-N；v1 绿为前提 |
| **v2（观测）** | nightly windows-latest：build + `ui:snapshot`（CI 自采基线引导）+ diff artifact；可选 `test.projects` 拆分提速与 license scan | 10-20min（windows runner 慢） | R-N + 一次基线引导实验（Speculative 项） |

---

## 8. 已验证（本审计直接证据）

1. CI 两次运行均失败于 `yarn install --frozen-lockfile`：`@earendil-works/pi-coding-agent@0.87.1` engines 要求 node>=22.19.0，runner 为 20.20.2 —— `gh run view 36804929215 --log-failed`；该包 engines 字段本地 node_modules 实查一致。ci.yml 仅有 typecheck job（ci.yml:13-23）。
2. CI 从未绿过：`gh run list --workflow=CI` 仅 2 条记录，均 failure。
3. main 无分支保护（gh api branches/main/protection → 404）；仓库 public。
4. gl@8.1.6 prebuilt 矩阵：GitHub API 实查 v8.1.6 release assets 含 node-v115/v127 × linux-x64/linuxmusl-x64/win32-x64/darwin-arm64，**无 v131**；本地 node v23.11.1（`node --version`）→ 解释本地为何有 MSVC 源码编译产物（node_modules/gl/build/binding.sln 等）。
5. onnxruntime-node@1.29.0 tarball 自带 darwin/linux/win32 三平台 napi-v6 二进制（本地目录实查，283MB）；piper-phonemize@1.4.12 纯 WASM 无 .node。
6. 测试不真启动 electron：10 个文件 `vi.mock('electron')`（grep 实证：tests/main/* 8 个 + preload + integration）；平台耦合测试仅 3 文件且防御式（agentTools.test.ts:92,114 / ocrService.test.ts:55-82 / crashLog.test.ts:47）。
7. glHarness 降级设计：tests/renderer/gl/glHarness.ts:19-32，gl 载入失败 → itGl=it.skip。
8. vitest 4.1.7 能力（node_modules/dist 实查）：`--exclude`（cac.BuBILSID.js:1080）、`--project=!pattern`（:1115）、默认 pool=forks（:913）、`--shard`（coverage.DM_a_rWm.js:208-213）、`coverage.merge/mergeReports`（:221,953）、transform 缓存目录 node_modules/.vite/vitest（cli-api.C6CiCDM3.js:597，本地存在）、`--cache.dir` 已弃用（cac.BuBILSID.js:1132）。
9. setupFiles 全局挂载（vitest.config.ts:17）且内容全为渲染侧 mock（tests/renderer/setup.ts:10,34,42-89,91-148）；测试分布：node-env 66 文件（engine10+main37+shared8+integration1+preload1+vision9）vs renderer 87 文件。
10. 覆盖率阈值/报告器配置完备（vitest.config.ts:18-21,78-93）但无任何远端执行体；package.json 无 eslint；`build` 仅链 typecheck（package.json:13）。
11. ui:snapshot 门禁语义：CDP 启动真 electron + pixelmatch + 0.1% 默认线 + git 基线 + assertFreshOut（scripts/ui-snapshot.mjs:14-34、scripts/lib/cdp.mjs:16,66）。

## 9. 未验证项（诚实清单）

1. **Linux 上全量 `yarn test` 实际通过性**：静态分析全绿（mock 全、平台防御、gl 降级），但从未在任何 Linux 环境跑过——v1 首跑即验证。时序敏感用例（agentTools 的 20s timeout 集成用例在 win32 guard 内，Linux 会跳过）预期无碍但未实证。
2. **CI 时长预估**均为 Speculative（无实测数据，只有本地 70s 与失败 run 的 36s fetch 阶段作锚点）。
3. gl prebuilt 在 ubuntu 的实际下载成功率（prebuild-install 对 GitHub release 的网络可达性）未实测；若翻车，node-gyp 源码编译需 python3+make+g++（ubuntu-latest 预装）+X11 头文件（`libxi-dev`/`libgl1-mesa-dev` 不预装，需 apt）——但 glHarness 降级意味着这只影响安装步骤而非测试步骤。
4. windows runner 上 ui-snapshot 与开发机基线的像素差量未实验（§3.3 基线引导方案是设计，未跑通）。
5. ubuntu+xvfb 跑 headed electron 的依赖清单（libgtk-3/libnss3/libasound2 等）未实验，故 nightly 首选 windows。
6. pi-coding-agent 移除的可行性（是否被 scripts/ 或工具链引用）未审计（属其它 lane）。
7. PRD R13.3.1（PRD:424）原设想的 matrix CI 与本方案的关系需 R-N 归并（本方案是其裁剪实施版）。
