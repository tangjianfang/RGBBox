# AI 实验室独立模块（R88）设计文档

- 日期：2026-09-13
- PRD 条款：[PRD-0002 §R88](../../prd/PRD-0002-rgbbox-project-catalog.md)
- 分支：`feat/synapse-ui-redesign`（延续当前工作分支）
- 状态：设计已获用户确认（三节评审）

## 1. 需求与已确认决策

用户需求：把 AI 能力拆成独立模块——「小而美」的模型验证、demo、LLM 测试/配置中心。

| 决策点 | 结论 |
| --- | --- |
| 模块内容 | 四区全做：连接测试 + 配置管理 + 会话式多轮 demo + OCR·翻译试玩 |
| 配置归属 | 设置页 AI 组**整体迁走**（四组→三组），AI 模块是唯一配置入口 |
| demo 形态 | 会话式多轮；历史为组件本地 state，**不持久化**（切走卸载即清） |
| 实现路线 | 方案 A：最小 IPC 扩展（2 条）+ AiLabView；Node 能力全走 main |
| Key 保密性 | 掩码输入 + 可见性切换 + 隐私说明行 + **safeStorage 加密落盘**（含旧明文迁移） |

## 2. 现状锚点

- IPC 族：`rgbbox:ai:get-settings` / `set-settings` / `cleanup-text` / `translate-text`（`shared/ipc.ts:139-143`，handler 于 `main/index.ts:335-356`）
- 服务层：`main/aiCleanupService.ts`——`AiCleanupSettings{baseUrl,apiKey,model}`、`buildCleanupRequest`/`buildTranslateRequest`、`cleanupOcrText`/`translateOcrText`、`CleanupOutcome{ok,text,hint}`
- 存储：`systemSettingsStore.ts` 明文 JSON 落盘 userData（**apiKey 当前明文**）
- 渲染层：App.tsx 持有 `aiCfg/setAiCfg/saveAiCfg/aiSaved`，仅喂 SettingsView AI 组

## 3. 架构

### 3.1 View 接入（渲染层）

```text
MODULE_VIEWS += 'ai'（尾部 settings 之前）
CARD_VIEWS   += 'ai'；MODULE_META += { ai: { labelKey:'nav.ai', descKey:'dash.desc.ai', icon: Bot } }
App.tsx：删 aiCfg 系 state；{activeView === 'ai' && <AiLabView />}（条件渲染，卸载即清会话）
SettingsView：删 AI 组与相关 props（四组→三组）
```

图标用 `Bot`（lucide 已有，与灯效 Sparkles 区分；测试图标桩名单需补 `Bot`）。

### 3.2 IPC 协议（新增 2 条）

```ts
// shared/ipc.ts
aiTestConnection: 'rgbbox:ai:test-connection'   // 无参
aiChat:           'rgbbox:ai:chat'              // { messages: AiChatMessage[] }

export interface AiChatMessage { role: 'user' | 'assistant' | 'system'; content: string }
export interface AiChatOutcome {
  ok: boolean
  text: string        // 失败为空串
  hint?: 'nokey' | 'auth' | 'http' | 'parse' | 'network'
  latencyMs: number
}

// preload（白名单 +2，带校验）
aiTestConnection(): Promise<AiChatOutcome>
aiChat(messages: AiChatMessage[]): Promise<AiChatOutcome>
```

类型 `AiChatMessage`/`AiChatOutcome` 定义于 `src/shared/types.ts`（跨进程类型之家，main/renderer/preload 三方引用）。

preload 校验（违规 → `{ok:false, text:'', hint:'parse', latencyMs:0}`，不抛异常）：数组、每项 role ∈ {user,assistant,system}、content 为 string、条数 ≤ 40、单条 ≤ 32000 字符。校验逻辑抽纯函数 `validateChatMessages()`，放 `src/shared/aiChatValidation.ts`（preload 与单测共同 import，preload 模块本身不进测试）。

### 3.3 主进程服务

```text
aiCleanupService.ts
  ├─ chatCompletion(messages, settings): Promise<AiChatOutcome>   // 通用管线：fetch + 计时 + hint 分类 + choices[0].message.content 解析
  ├─ buildTestRequest(): { messages, maxTokens: 8 }               // "ping"
  ├─ cleanupOcrText / translateOcrText → 改为包 system prompt 复用 chatCompletion（对外签名/行为零改动）
```

### 3.4 Key 保密性

**输入侧（AiLabView）**：`type="password"` + 👁 切换（`ai.lab.showKey/hideKey`）、`autocomplete="new-password"`、`spellcheck={false}`；输入框下隐私说明行（`ai.privacyNote`）：

- zh：`密钥仅加密保存在本机配置文件，不会上传到 RGBBox 云端（本项目无云端）；仅在你自己配置的 API 地址上用作请求认证`
- en：`Your key is stored encrypted on this machine only — never uploaded to any RGBBox cloud. It is only sent to the API endpoint you configure, as request authentication.`

**落盘侧（main）**：

```text
aiSecretCodec.ts（新，纯函数 + 注入 codec）
  encodeApiKey(plain, enc): string        // 'enc:v1:' + base64(enc(plain))
  decodeApiKey(stored, dec): string       // 有 'enc:v1:' 前缀 → dec(base64)；无前缀 → 原样返回（旧明文兼容）
  codec 接口 { encrypt(s):Buffer/string, decrypt(v):string }，main 侧用 Electron safeStorage 实现
接线：aiSetSettings 保存前 encode；aiGetSettings 读出后 decode；isEncryptionAvailable()=false → 明文直存 + console.warn
迁移：读到旧明文 → 正常返回使用；下一次 set 时自然写为密文（无感一次性升级）
```

## 4. AiLabView 四区（自上而下，Synapse 折叠分组）

```text
▼ 连接状态    [● 已连接 glm-4-flash · 412ms] / [○ 未测试] / [✕ 失败:hint文案]   [测试连接]
▼ 模型配置    Base URL / 模型 / API Key(掩码+👁) / 隐私说明行 / [恢复默认][保存]（保存后自动跑连接测试）
▼ 对话试玩    历史气泡（每轮标 latencyMs）；输入框 + [发送] + [清空会话]；未配 key → nokey 提示行
▼ OCR·翻译试玩 文本输入区 + [AI 整理][中英互译] + 结果区（方向检测沿用 R84 detectTranslateDirection，主进程内）
```

状态自管：mount 时 `aiGetSettings` 载入；请求中按钮 loading 防重入；所有失败走 hint 文案（复用 `ai.hint` 系）。

## 5. 错误处理

- 五类 hint（nokey/auth/http/parse/network）与现有 OCR 面板提示一致，AiLabView 各区直接复用渲染。
- preload 校验失败、网络失败、非 200、解析失败 → `{ok:false,...}`，UI 显示 hint 文案，永不抛未捕获异常。
- safeStorage 不可用 → 回退明文 + warn（功能可用，隐私说明行措辞为「加密保存」的前提在 Windows/macOS 默认成立；若明确检测到回退，说明行保持不变但 console 记录——不向用户撒谎：文案主体承诺的是「不上传到 RGBBox 云端」，仍为真）。

## 6. i18n 增量（zh+en 同步）

新增：`nav.ai`（AI 实验室 / AI Lab）、`dash.desc.ai`（LLM 验证与会话试玩 / LLM validation & chat playground）、`ai.privacyNote`、`ai.lab.status.connected/disconnected/failed`、`ai.lab.test/showKey/hideKey`、`ai.lab.chat.placeholder/send/clear`、`ai.lab.ocr.title/cleanup/translate/input/result`。
删除：`settings.group.ai`。

## 7. 测试

- node 纯函数：`chatCompletion`（mock fetch：成功/各 hint/latency>0）、`buildTestRequest`、`encodeApiKey/decodeApiKey`（往返、旧明文直读、前缀识别、codec 抛错回退）、`validateChatMessages`（合法/超限/坏 role/坏类型）。
- happy-dom 组件：AiLabView 四区渲染、key 掩码与切换、保存触发自动连接测试（mock rgbbox）、对话多轮追加+耗时、清空会话、OCR/翻译回调与结果渲染、nokey 提示、SettingsView 三组（AI 组消失）。
- 回归：typecheck/test/build 全绿；`aiCleanupText/aiTranslateText` 既有行为零改动。

## 8. 验收点（对应 R88.7）

1. rail/磁贴出现 AI 入口；设置页三组、无 AI 组
2. 连接测试显示状态与延迟
3. 会话多轮 + 每轮耗时；切走再回为空
4. OCR 整理 / 中英互译试玩可用
5. key 掩码输入 + 隐私说明行可见
6. 落盘密文 `enc:v1:`；旧明文首读可用、再存自动迁移
7. zh/en 无缺 key
8. 全量回归 0 失败 + typecheck/build 0 error；实机复测待用户

## 9. 非目标

- 不做多 provider 预设管理/多 profile
- 不做流式（SSE）输出——逐轮完整返回即可
- 不做会话持久化/导出
- 不做 token 用量计费统计
- 不改 OCR 截图工具面板的现有交互
