# AI 实验室优化（R89）设计文档

- 日期：2026-09-13；PRD：[PRD-0002 §R89](../../prd/PRD-0002-rgbbox-project-catalog.md)；分支：`feat/synapse-ui-redesign`
- 状态：设计要点已在对话中确认（测试入配置区、三 Tab、档案即选即测）

## 1. Bug 修复：连接测试 (parse)

根因：`testConnection` 发 `max_tokens:8`；glm-5.3 为思考型模型，token 预算被 reasoning 耗尽 → `choices[0].message.content` 为空串 → `parseCleanupResponse`（要求非空）返回 null → `hint:'parse'`。对话无 max_tokens 上限故正常。

修复：`chatCompletion` 增 `opts.probe?: boolean`——probe 时成功判据 = HTTP 200 + 响应 JSON 含 `choices` 数组（content 可空，`text` 取 `content ?? ''`）；`testConnection` 改为 `{ maxTokens: 16, probe: true }`。其余判据不变。

## 2. 内部 Tab 化

```text
┌────────────────────────────────────────────────────────┐
│ ● 配置 │ 对话 │ OCR·翻译                （.ai-tabs 胶囊） │
├────────────────────────────────────────────────────────┤
│ 当前 Tab 内容                                            │
└────────────────────────────────────────────────────────┘
```

- 组件内 `useState<'config' | 'chat' | 'ocr'>`；`.ai-tabs`/`.ai-tab(.active)` 样式沿用 R39.2 胶囊语言（accent 实心胶囊 + 深色字）
- 未来实验模块 = 往 union 加成员 + 一个面板块

## 3. 多配置档案（profiles）

```ts
// shared/types.ts
export interface AiProfile {
  id: string          // `p_${Date.now().toString(36)}`
  name: string        // 自动「服务商 · 模型」，可编辑
  baseUrl: string
  apiKey: string
  model: string
}
```

### 存储（main，systemSettingsStore 结构扩展）

```jsonc
"ai": {
  // 旧字段（baseUrl/apiKey/model）保留为「active 档案的镜像」——旧读者零改动
  "profiles": [ { id, name, baseUrl, apiKey(enc), model } ],
  "activeProfileId": "p_xxx"
}
```

迁移：读侧发现无 `profiles` 但有旧 `ai.baseUrl` → 视为单档案（id `p_legacy`，name=「服务商 · 模型」按 baseUrl 反查预设），下次 aiSaveProfile/aiSetActiveProfile 写入时落盘 `profiles` 数组。apiKey 每档案独立 `enc:v1:` 加密（复用 aiSecretCodec）。

### IPC

| 通道 | 签名 | 说明 |
| --- | --- | --- |
| `aiGetProfiles` | `() => { profiles: AiProfile[]; activeId: string }` | 名称/Key 均明文返回（渲染层显示用） |
| `aiSaveProfile` | `(p: AiProfile) => AiProfile` | id 空则新建；name 空则自动「服务商 · 模型」；持久化全部档案；**不改变 active** |
| `aiDeleteProfile` | `(id: string) => void` | 删除；若删的是 active → active 落到余下首个（无档案则清空 active） |
| `aiSetActiveProfile` | `(id: string) => void` | 切换 active + 同步旧字段镜像 |
| `aiTestConnection` | `(profile?: {baseUrl;apiKey;model}) => AiChatOutcome` | 传 profile 则直接测该档案（不落盘不切 active）；否则测 active |

旧 `aiGetSettings`/`aiSetSettings`：读=active 档案（无档案返回默认空配）；写=写 active 档案（无档案则新建）——OCR 截图面板（AnnotateOverlay 用 aiCleanupText，不碰 settings）与任何旧调用零改动。

### UI（配置 Tab）

```text
档案 [智谱 GLM · glm-5.3-flash ▾]（＋新建 / 🗑 删除）     ← 选择即编辑该档案
名称 […………]  服务商 [智谱 GLM ▾]  BaseURL [……]  模型 [glm-5.3 ▾]  Key [••• 👁]
隐私说明行 / keyUnreadable 警告（沿用 R88）
[测试连接]（测当前编辑档案，probe 判据） [保存] [设为当前 ●]
```

- 对话 / OCR Tab 顶部一行「当前配置：name ▾」（下拉 = aiSetActiveProfile，全局生效——OCR 面板跟随）
- 自动保存：档案字段失焦或切档案时自动 `aiSaveProfile`（名字非空时）；「保存」按钮保留作显式确认

## 4. i18n 增量（zh+en）

`ai.lab.tab.config/chat/ocr`、`ai.lab.profile`（配置档案）、`ai.lab.profileNew`（新建配置）、`ai.lab.profileDelete`（删除）、`ai.lab.setActive`（设为当前）、`ai.lab.activeNow`（当前配置：）、`ai.lab.name`（名称）。

## 5. 测试

- node：chatCompletion probe 矩阵（200+choices 空 content 成功 / 200 无 choices 仍 parse）；profiles 存取/迁移/删除-active 兜底/自动命名（main 层抽 `normalizeAiStore` 纯函数）；aiTestConnection 带 profile 参数不落盘
- happy-dom：三 Tab 渲染与切换；档案下拉选择→编辑器载入；测试按钮 → `aiTestConnection(profile)`；「设为当前」→ `aiSetActiveProfile`；对话/OCR Tab 显示 active 档案名并可切换
- 回归：AnnotateOverlay / aiCleanupText / aiTranslateText 既有用例不动全绿

## 6. 非目标

- 不做档案导入导出、用量统计、按档案的模型参数（temperature 等）
- 不做对话历史跨档案隔离（会话本就不持久化）
