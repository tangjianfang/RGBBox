# R89 AI 实验室优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修连接测试 parse 判据；AiLabView 改三 Tab；多配置档案（自动命名/自动保存/按档案测试/全局 active）。

**Architecture:** `chatCompletion` 加 probe 模式 → main 抽 `aiProfileStore` 纯函数（normalize/迁移/镜像）+ 4 新 handler → preload 白名单 +4 → AiLabView 重构为 Tab + 档案管理。

**Spec:** `docs/superpowers/specs/2026-09-13-ai-lab-profiles-design.md`

## Global Constraints

- `aiCleanupText/aiTranslateText/aiChat` 及 OCR 面板零改动（吃 active 档案）。
- 提交标题 `[PRD-0002] <type>: <subject>`；zh+en 同步；命令只用 yarn test/typecheck/build。
- 现状锚点：`aiCleanupService.chatCompletion`（opts: maxTokens/temperature/timeoutMs）、`parseCleanupResponse` 空串→null；`index.ts` safeStorageCodec/asAiSettings/aiGetSettings/aiSetSettings/aiTestConnection/aiChat handler；`AiLabView.tsx` 四折叠组（R88 review 修复版）；mock 在 `tests/renderer/_helpers.tsx`。

## Tasks

### T1 shared：AiProfile 类型 + 通道
- `shared/types.ts`：`export interface AiProfile { id: string; name: string; baseUrl: string; apiKey: string; model: string }`
- `shared/ipc.ts`：+`aiGetProfiles/aiSaveProfile/aiDeleteProfile/aiSetActiveProfile`（`rgbbox:ai:get-profiles` 等）

### T2 main：probe 判据（先测后码）
- 测试追加（tests/main/aiCleanupService.test.ts）：
  - probe：200 + `choices:[{message:{content:''}}]` → ok（text ''）；200 + `{nope:1}` → parse；`testConnection` 捕获 body.max_tokens === 16
- 实现：`chatCompletion` opts 增 `probe?: boolean`——解析处 `parsed = parseCleanupResponse(json); if (parsed === null) { if (opts?.probe && Array.isArray((json as any)?.choices)) return { ok:true, text: contentOf(json) ?? '', latencyMs } ; return parse }`；`testConnection` → `{ maxTokens: 16, probe: true }`

### T3 main：aiProfileStore + 4 handler（先测后码）
- 新 `src/main/aiProfileStore.ts`（纯函数）：
  - `autoProfileName(baseUrl, model)`：`${preset.label || 'Custom'} · ${model || 'default'}`
  - `normalizeAiStore(ai): { profiles, activeId }`：合法 profiles 数组（id/name/baseUrl/model 字符串、apiKey 可空）→ active 校验兜底首项；无 profiles 有旧 baseUrl/apiKey/model → `p_legacy` 单档案；全无 → 空
  - `mirrorLegacy(activeProfile)`：`{ baseUrl, apiKey, model }` 对象（写旧字段用）
- 测试（tests/main/aiProfileStore.test.ts）：迁移三态/active 兜底/自动命名/非法项过滤
- `index.ts`：
  - `persistAi(profiles, activeId)`：apiKey 逐档案 encode；active 镜像写旧字段；`saveSystemSettings({ ai: {...} })`
  - handler `aiGetProfiles`：normalize → decode 全档案 → `{ profiles, activeId, unreadableIds, encryptionAvailable }`
  - `aiSaveProfile(p)`：normalize → id 空则 `p_${Date.now().toString(36)}`、name 空则 autoProfileName → upsert → persist → 返回明文档案（不改 active）
  - `aiDeleteProfile(id)`：过滤 → active 命中则落余下首项（空则 ''）→ persist
  - `aiSetActiveProfile(id)`：normalize → 校验存在 → active=id + 镜像 → persist
  - `aiTestConnection(profile?)`：有 profile 参（三字符串字段校验）→ `testConnection(profile)`；否则 active 档案
  - 旧 `aiGetSettings/aiSetSettings` 改走 normalize（读=active 或空默认；写=upsert active）

### T4 preload + mock
- preload：+4 方法（类型含 `unreadableIds?`/`encryptionAvailable?`）；`aiTestConnection` 增可选 profile 参
- `_helpers.tsx` mock：+`aiGetProfiles/aiSaveProfile/aiDeleteProfile/aiSetActiveProfile`（返回两档案的默认态）

### T5 i18n + 样式
- key：`ai.lab.tab.config/chat/ocr`、`ai.lab.profile/profileNew/profileDelete/setActive/activeNow/name`（zh+en）
- styles.css：`.ai-tabs`（胶囊，active = accent 实心 + accent-contrast 字）、`.ai-tab`；`.ai-profile-row`（档案选择行）

### T6 AiLabView 重构（测试先行，改写 AiLabView.test.tsx）
- 状态：`tab`、`profiles/activeId/editId/cfg/dirty` + R88 的 chat/ocr/conn 状态
- mount：`aiGetProfiles` 载入（edit=active）；conn 测试改带 profile 参（测编辑中档案）
- 配置 Tab：档案下拉（+新建/删除）→ 切换时自动 `aiSaveProfile`（name/baseUrl/model 有效才存）→ 编辑器（name/provider/baseUrl/model/key + 隐私行 + keyUnreadable 警告（按 unreadableIds））→ [测试连接][保存][设为当前]
- 对话/OCR Tab：顶行「当前配置：{active.name} ▾」→ `aiSetActiveProfile`
- 折叠组样式退役（.dash-group 用法移除，仅 Tab 内容）
- 测试改写：三 Tab 渲染切换；档案下拉载入与切换自动保存；测试按钮调 `aiTestConnection` 带 profile；设为当前调 `aiSetActiveProfile`；对话 Tab 显示 active 名；R88 既有行为用例（key 掩码/隐私行/对话多轮/OCR/nokey）保留迁移

### T7 回归 + 清理
- 死引用：`ai.lab.group.*`（如不再用则删 key）、旧四组结构残留
- `yarn typecheck && yarn test && yarn build` 全绿

### T8 PRD R89.6 ✅ + code-review → 修复 → 提交

## Self-Review
- Spec 覆盖：§1→T2；§2→T5/T6；§3→T1/T3/T4/T6；§4→T5；§5→各任务；§6 非目标未越界。
- 类型一致：`AiProfile`（T1 定义，T3/T4/T6 消费）；probe opts（T2）；normalize 返回形状（T3 内外一致）。
