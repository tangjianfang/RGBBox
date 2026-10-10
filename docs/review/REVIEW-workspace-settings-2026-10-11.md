# 深度 Review — 工作区 + 设置（2026-10-11）

范围：`WorkspaceView.tsx` / DisplayMap / VideoWallEditor 装配、`domain/profileUtils.ts`、`domain/overlayDistribution.ts`、profile 持久化链路（renderer→preload→main）、`SettingsView.tsx` + 设置约定、相关测试。
方法：只读代码 + grep 差距审计；未跑测试/构建。`src/main/index.ts` 历史问题不计入新发现。

## 1. 模块概览

| 层 | 职责 | 数据流 |
|---|---|---|
| WorkspaceView（1112 行，75 props） | 工作区编排视图：FX 侧栏（profile 栏/层栈/快速调校/高级抽屉）+ 预览 + 拓扑图 + 采样面板 | 纯 props 驱动，状态全在 App + 域 hook |
| DisplayMap / VideoWallEditor | 拓扑图 overlay 开关/区域拖选；视频墙矩阵编辑 | 经 `handleToggleOverlay`/`handleOverlayConfigChange`/`updateVideoWall` 回写 overlay 域 / scene |
| 域 hook | useProfileManager（自动保存 400ms 防抖 + 命名槽 CRUD + 层包）、useOverlayTopology、useSamplingDomain、useSettingsMirror、useLayerActions、useRandomizerDomain | 全部经 `window.rgbbox.*` 白名单桥 |
| 持久化（main） | profileStore：`config/profile.json`（工作档）+ `config/profiles/<id>.json`（命名槽），R221.1 原子写；systemSettingsStore：`config/system.json`（powerSave/screensaver/snip） | renderer setProfile → 防抖 → saveProfile/saveProfileAs IPC |
| 设置生效链 | 开机自启=OS login item（`setAutoLaunch`，不落 system.json）；屏保/热键=system.json + main 持有 watcher；主题/字号/语言=localStorage（`rgbbox:theme`/`uiFontScale`/`lang`）+ 单向通知 main（`setTitleBarTheme`/`setUiLocale` 重建托盘） | SettingsView props ← App 装配 |

**R5.1 审计结果：干净。** 全 renderer 源内无 `from 'electron'` / `require('electron')` / 直接 `ipcRenderer`（仅注释与文案字符串命中），所有 Node 能力走 `window.rgbbox.*`。

## 2. 发现清单（25 条）

严重度：P0 阻断 / P1 严重 / P2 应修 / P3 待办。

### U — bug / 正确性（6）

| # | 严重度 | 位置 | 证据（一句话） |
|---|---|---|---|
| U1 | **P1** | `src/main/index.ts:1236`、`src/main/profileStore.ts:59-66`、`src/renderer/src/domain/profileUtils.ts:12-15` | import 与 loadProfileById 均为裸 `JSON.parse(raw) as Profile`，零校验零默认合并：合法 JSON 但 `scenes:[]`/缺 `scenes` 的文件经 `setProfile` 进入后 `activeLayer()` 的 `scene.layers` 直接 TypeError，整个 App 崩到 ErrorBoundary（`main.tsx:52`）；旧命名槽缺非可选 `usePerformanceGuard/showGap`（`src/shared/types.ts` SamplingSettings）时 `WorkspaceView.tsx:1097` `checked={undefined}` 受控/非受控失配。启动路径只迁移 `saturationBoost`（`App.tsx:371-378`），下拉载入路径（`WorkspaceView.tsx:331`）完全无迁移——与 `loadProfile()` 的合并语义（`profileStore.ts:18-26`）不一致 |
| U2 | P2 | `src/renderer/src/hooks/domains/useOverlayTopology.ts:35-44` | `openOverlay/closeOverlay` 返回 `Promise<boolean>` 被忽略：main 打开/关闭失败时渲染层仍把 displayId 记为 overlay-active → DisplayMap 显示已激活、tick loop 持续向不存在窗口推帧，直到重启才恢复 |
| U3 | P2 | `src/main/index.ts:1228-1239` + `src/renderer/src/hooks/domains/useProfileManager.ts:61-65` | 导入保留文件内原 id，400ms 自动保存即用同 id `saveProfileAs` 覆盖既有同名槽——「导入」静默替换现有命名 profile，而非新增 |
| U4 | P3 | `src/renderer/src/domain/profileUtils.ts:6-10` | `nextLayerId()` 模块级计数器从 100 递增、不查现有 id：导入含 `layer-1xx` id 的层包后继续加层会撞 id，`updateLayer` 一次补丁两层 |
| U5 | P3 | `src/renderer/src/domain/overlayDistribution.ts:30-33` | `extractSubFrame` 逐像素 clamp 了 x 却没 clamp y：四舍五入使 `offsetY+dispRows` 超出虚拟行数时越界读→`Uint8ClampedArray` 存 0，混合 DPI/竖屏布局底行变黑 |
| U6 | P3 | `src/renderer/src/App.tsx:359-398` | boot `Promise.all` 无 `.catch`：任一 IPC reject 则 App 永远停在 `RGBBox` boot 屏，无错误出口 |

### B — 行为断言（5）

| # | 严重度 | 位置 | 证据 |
|---|---|---|---|
| B1 | P3 | `src/renderer/src/components/WorkspaceView.tsx:279` | `max={meta?.max ?? 2}` 兜底：经 diff 验证当前 49 个 preset 无未登记数值参数命中该分支（custom/image-paint 参数走专用编辑器），纯潜伏雷 |
| B2 | P3 | `src/renderer/src/hooks/domains/useSamplingDomain.ts:151-164` | `toggleAspectLock` 在 `setAspectLocked` updater 内部再调 `setProfile` 读值写 ref——updater 内做副作用，StrictMode 双调用下靠幂等性兜底 |
| B3 | P3 | `src/renderer/src/App.tsx:625,627` | `setPowerSaveBlock/setAutoLaunch(...).then(mirror)` 无 `.catch`：IPC 失败→unhandled rejection + 镜像与真实态失同步 |
| B4 | P2 | `src/renderer/src/components/WorkspaceView.tsx:331-339` | profile 下拉 `loadProfileById` 返回 null（槽文件损坏）时 `if (loaded)` 静默吞掉，select 弹回原值，用户无任何反馈 |
| B5 | P3 | `src/renderer/src/components/SettingsView.tsx`（全文件） | 设置页无「语言」组：语言切换只在顶栏 `onToggleLang`（`App.tsx:574-575`），设置项归类不完整（落盘链路本身健康：`i18n/index.tsx` localStorage + `setUiLocale` 通知托盘） |

### V — 视觉 / 表现（5）

| # | 严重度 | 位置 | 证据 |
|---|---|---|---|
| V1 | P2 | `src/renderer/src/domain/paramMeta.ts:5-35` + `WorkspaceView.tsx:239-240` | 37 个参数元数据里约 30 个 `labelKey` 是裸英文串（'Speed'/'Base Light'/'Rings'…，不含 `.` 即不走 `t()`）——中文 UI 的高级抽屉长尾参数整片英文 |
| V2 | P2 | `src/renderer/src/components/WorkspaceView.tsx:578` | 全效果网格 tooltip `title={preset.description}` 绕过了 22 行之前（`:556`）同视图使用的 `presetDescription(preset, t)`；每个 preset 都有自动生成的 `descKey`（`src/shared/defaultProfile.ts:362`）却未使用 |
| V3 | P3 | `src/renderer/src/components/VideoWallEditor.tsx:234` + `src/engine/videoWall.ts:202-206` | `summarizeLayout()` 返回硬编码英文（'matrix · panels · bezel-corrected · fit='）原样上屏 |
| V4 | P3 | `src/renderer/src/components/WorkspaceView.tsx:47-86` | SceneCard 6 张卡各自跑不节流 rAF（每帧 renderPreviewFrame + 144 次 fillRect），无可见性门控/帧率上限，滚出视口仍全速跑 |
| V5 | P3 | `src/renderer/src/components/DisplayMap.tsx:115-122` | `overlay-toggle-btn` 缺 `type="button"`（同视图其余按钮都有；当前无 form 上下文，一致性隐患） |

### T — 测试盲区（5）

| # | 严重度 | 位置 | 证据 |
|---|---|---|---|
| T1 | P2 | `tests/renderer/components/`（无 WorkspaceView.test.tsx） | 1112 行最大视图零直接测试：profile 下拉载入+selectedLayer 重置、层栈 CRUD 守卫、快速调校、排程/自动化面板、zone mask/display slot、采样三 tab 全裸奔；App 侧仅 smoke（`App.test.tsx:8` 类型形状、`App.smoke.test.tsx:29` 初始视图） |
| T2 | P2 | `tests/renderer/hooks/` | useProfileManager（自动保存防抖/导入导出/重命名删除）、useOverlayTopology（开关结果/配置持久化/热插拔）、useSamplingDomain（密度/纵横比数学）、useSettingsMirror 均无测试 |
| T3 | P3 | `tests/renderer/domain/overlayDistribution.test.ts` | 未覆盖 `distributeFrameToOverlays` 的 videoWall-panel 分支（全文件无 videoWall 引用）与 `extractSubFrame` 舍入边界（对应 U5） |
| T4 | P3 | `tests/profileStore.test.ts` / `tests/main/` | 无 importProfileDialog 校验行为测试（与 U1 互为因果：先修 U1 再补） |
| T5 | P3 | `tests/renderer/components/ProfileManager.test.tsx` | 5 条用例测的是死组件（见 X1），真正在用的内联 profile 栏零覆盖 |

### X — 架构债（4）

| # | 严重度 | 位置 | 证据 |
|---|---|---|---|
| X1 | P3 | `src/renderer/src/components/ProfileManager.tsx` | 死代码：全仓库无 import 方（已被 WorkspaceView 内联 profile 栏 + useProfileManager 取代），仍带测试维护 |
| X2 | P3 | `src/renderer/src/components/WorkspaceView.tsx:102-230` | 75-prop 宽接口 + `void refreshProfiles` 死 prop（`:230`）——R147 自认的过渡债，域 hook 二次收窄未做 |
| X3 | P3 | `src/main/index.ts:1204-1214` + `src/main/profileStore.ts:61,70,81` | renderer 传入的 id 未消毒直接 `join(profilesDir, `${id}.json`)`：`../` 可越出 profiles 目录（R5.1 白名单模型下的纵深防御缺口） |
| X4 | P3 | `src/renderer/src/hooks/domains/useOverlayTopology.ts:21-33` | overlayConfigs 按物理 displayId 存 localStorage：display id 跨会话/热插拔不稳定，陈旧条目累积、换 id 后套错区域配置 |

## 3. 价值任务建议（均过三关：砍掉用户可感知 / 独立可交付可验收 / 文件所有权独立）

| # | 任务 | 修掉 | 所有权 | 验收点 |
|---|---|---|---|---|
| A1 | **Profile 载入/导入校验 + 迁移统一**：main 侧新增 `normalizeProfile(raw)`（默认值深合并 + 结构校验，坏结构返回 null），`loadProfileById`/`importProfileDialog` 统一走它；导入撞既有 id 时生成新 id（或提示覆盖）；顺带 `nextLayerId` 改为扫描现有 id 取 max | U1/U3/U4/B4/T4 | `src/main/profileStore.ts` + `src/main/index.ts` handler + `tests/profileStore.test.ts` | 坏样本（`scenes:[]`、缺字段、合法 JSON 错形状）导入不崩且得到迁移补齐的 profile；旧槽载入后 `usePerformanceGuard` 有布尔值；同 id 导入不再静默覆盖 |
| A2 | **Overlay 开关结果回读**：`handleToggleOverlay` 检查 `openOverlay/closeOverlay` 的 boolean，失败不更新本地态（必要时回滚 + 顶部提示） | U2 | `src/renderer/src/hooks/domains/useOverlayTopology.ts` + 新 hook 测试 | mock `openOverlay→false` 时 DisplayMap 不进入 overlay-active、tick loop 不推帧 |
| A3 | **参数抽屉/效果 tooltip i18n 补齐**：paramMeta 裸英文 labelKey 全部换 `param.*` 真键并补 zh/en 词条；`WorkspaceView.tsx:578` 改用 `presetDescription()` | V1/V2 | `src/renderer/src/domain/paramMeta.ts` + `src/renderer/src/i18n/index.tsx` + WorkspaceView 一行 | zh UI 高级抽屉与全效果 tooltip 无英文残留（i18nShellKeys 类键位完整性测试可复用） |
| A4 | **设置页补「语言」组**：appearance 组加语言 select（复用 `setLang`，含托盘联动），顶栏快捷切换保留 | B5 | `SettingsView.tsx` + `i18n/index.tsx` 词条 + `SettingsView.test.tsx` | 设置页切换语言后 UI + 托盘菜单同步，localStorage 持久化 |
| A5 | **videoWall 分发分支测试 + 竖屏边界修复**：补 `distributeFrameToOverlays` wall-panel 分支用例；`extractSubFrame` 对 y 做 clamp（或收缩 dispRows） | T3/U5 | `src/renderer/src/domain/overlayDistribution.ts` + 既有测试文件 | 混合 DPI 拓扑下子帧无黑边行；wall 分支每面板收到 `extractWallPanelFrame` 结果 |
| A6 | **WorkspaceView/useProfileManager 装配测试**（A1/A2 的护栏扩展）：用现成 `tests/renderer/_helpers.tsx` 装配，覆盖下拉载入重置 selectedLayer、层栈 CRUD、层包导入导出、自动保存防抖 | T1/T2/T5 | 新 `tests/renderer/components/WorkspaceView.test.tsx` 等 | 上述路径各有断言；删 X1 死组件后 ProfileManager.test 一并移除 |

## 4. 优先级排序

**A1（P1，数据损坏级）→ A2（P2，状态幻影）→ A3（P2，中文产品里的英文面）→ A4（P3，补全）→ A5（P3，边界+盲区）→ A6（P3，护栏，随 A1/A2 落地）**
可并行性：A1/A2/A3/A4 四者文件所有权互不相交，可四路并行；A5、A6 依赖各自前置合入后做回归。

---
*统计：U6 / B5 / V5 / T5 / X4，共 25 条 —— P0×0，P1×1，P2×7，P3×17。R5.1（渲染层禁直连 electron）全量 grep：无违规。*


---

## 主审复核（2026-10-11，主会话对码核对）

子代理幻报率审计：本报告 Top 结论逐条对码核对结果如下（幻觉/表述偏差已标注）。


**A1（Profile 导入裸 parse）**：✅ 确认——`main/index.ts:1239` `JSON.parse(raw) as Profile` 零校验零默认合并实锤。A2/A3 未复核。


### P2 池抽验（2026-10-11 主审）
- **A2 overlay 回读**：✅ 实锤——`useOverlayTopology.ts:36-43` `await openOverlay/closeOverlay` 返回值丢弃，乐观更新本地态。
