# 技术方案:pi coding agent 集成 AI 实验室 / AI8 模块

**日期**:2026-09-25　**输入**:用户指令「将最近比较火的 pi coding agent 集成到 AI 实验室中的 AI8 模块,借助当前的 AI 模型能力实现 agent 功能」
**性质**:只读评估 + 方案设计,`src/` 0 diff　**决策**:三方案对比待拍板后立项实施(PR R172)

---

## 1. pi coding agent 事实链(2026-09-25 官方仓库/文档核实)

| 维度 | 事实 |
|---|---|
| 作者/热度 | Mario Zechner(badlogic,libGDX 作者);定位「极简可拼装」的终端编码 agent,社区视为 Claude Code 的 bare-bones 替代 |
| 许可/语言 | MIT;TypeScript 单仓多包( scope `@earendil-works/`,曾用 `@mariozechner/`,**有 scope 迁移史**) |
| 核心包 | `pi-coding-agent`(CLI+SDK)· `pi-agent-core`(运行时/工具调用/状态)· `pi-ai`(多供应商统一 API)· `pi-tui` · `pi-durable` · `pi-telemetry` |
| 哲学 | 极简 4 工具内核(read/write/edit/bash),靠扩展拼装 |
| 嵌入 | **一等公民**:TS SDK(`createAgentSession()` → `session.prompt/subscribe/abort/dispose`,流式事件 `text_delta`/`message_end`/`agent_settled`,JSONL 会话持久化/分支/压缩,`customTools`/`excludeTools` 可整组替换内置工具);另有 JSON 事件流/RPC/print 三种 headless 模式 |
| 供应商 | 内置 30+:OpenAI/Anthropic/Google/DeepSeek/**ZAI(Global/China,即智谱 GLM)**/Kimi/Qwen/MiniMax… 云:Azure(显式自定义 baseUrl)/**Amazon Bedrock**(IAM/bearer)/Vertex;⚠ **通用 OpenAI 兼容自定义 baseUrl 未在文档承诺**(仅 Azure 显式);⚠ 本地 ollama 未列出 |
| 权限/安全 | **无内置权限系统**——以启动者权限运行,官方仅给容器化建议(Gondolin 微 VM/Docker/OpenShell);supply-chain 硬化良好(精确 pin/shrinkwrap/--ignore-scripts) |

## 2. RGBBox 现状能力面(代码核实)

| 组件 | 现状 | 对 agent 的意义 |
|---|---|---|
| 供应商体系(`aiProviders.ts`) | zhipu/deepseek/openai/kimi/qwen(全 OpenAI 兼容)+ **ai8(`ai8://chat` 伪协议)** + bedrock(`bedrock://openai` 伪协议)+ ollama + custom | 「当前的 AI 模型能力」的入口;GLM 为默认档位 |
| `chatCompletion` 管线(`aiCleanupService.ts`) | 纯 chat completions,**不支持 `tools`/`tool_calls` 透传** | 原生 function-calling 循环需扩管线;AI8/Bedrock 走各自 provider 适配 |
| AI8(`ai8Client.ts`,607 行) | 站点逆向协议:会话制 `buildChatBody(sessionId, text, opts)`,凭据 safeStorage + 自动登录;绘画/视频独立 API | **无 function-calling 语义**——agent over AI8 必须文本协议(ReAct)桥接 |
| utilityProcess 先例 | `denoiseService`(fork + postMessage 中继) | agent 运行时的进程承载模式可直接复用 |
| 安全设施 | safeStorage 加密、`media://` 防穿越、权限白名单、崩溃日志、零遥测铁律 | agent 权限层必须对齐这一纪律 |

## 3. 三方案对比

| | **A:引 pi SDK**(主进程/utilityProcess 内嵌 `pi-coding-agent`) | **B:自研极简内核**(pi 理念原生实现,不引包) | C:pi CLI RPC 子进程 |
|---|---|---|---|
| agent 循环健壮性 | ✅ 现成(重试/流式/压缩/JSONL 会话/思考等级) | ⚠ 自建(约 500-800 行 + 自己扛 bug) | ✅ 现成 |
| GLM(智谱)直驱 | ✅ pi-ai 内置 ZAI 供应商(⚠ 覆盖 open.bigmodel.cn 与否需 spike 实证) | ✅ 扩展现有 chatCompletion 加 `tools` 透传即可(GLM 系原生支持 function calling) | ✅ 同 A |
| Bedrock | ✅ pi-ai 原生 | ⚠ 复用现有 SigV4 管线加 tools 透传 | ✅ |
| **AI8** | ❌ 无原生路径 → 只能走「本地 OpenAI 兼容代理 + ReAct 桥」(S3) | ⚠ 同样需 ReAct 桥,但**协议在自己手里**,无需适配外部包的模型层 | ❌ 同 A |
| 权限/审批层 | 两案相同:pi 无权限系统,`excludeTools` + `customTools` 整组替换为审批门禁版 | 自带设计自由度 | 同 |
| 依赖/供应链 | +2 包(MIT,估 2-5MB);⚠ scope 已迁移过一次,存在演进/断版风险 | +0 依赖,符合 RGBBox 极简纪律(ADR-002 同风格) | 需随包发行 CLI,最差 |
| 工程量 | S1-S3 约 4-6 会话 | S1-S3 约 6-9 会话 | 3-5 会话 |
| 判定 | **推荐(以 spike 为门)** | **后备(若 spike 证实 pi-ai 无法覆盖 bigmodel.cn)** | 不推荐 |

**推荐结论:A 起步、B 兜底,S0 spike 定生死。** 两案共享同一安全层与 UI,Spike 失败仅换内核,S1-S4 计划不变。ReAct 文本桥(AI8 专用)在两案中都是独立组件。

## 4. 推荐方案架构(A 案)

```mermaid
sequenceDiagram
    participant U as Agent 工作台(AI8 Tab 内)
    participant M as Main:agentService
    participant P as pi SDK(UtilityProcess)
    participant T as 审批门禁工具组
    participant FS as 工作区文件系统 / Shell

    U->>M: agentPrompt(text)(invoke)
    M->>P: createAgentSession(model=当前AI档位, customTools=门禁组)
    P->>U: 流式事件推送(text_delta / tool_call)(webContents.send)
    P->>T: 工具调用(read / write / edit / bash / list)
    T->>U: 审批请求(写/命令;含 diff 预览)
    U-->>T: 允许一次 / 本会话总是允许 / 拒绝
    T->>FS: 路径钳制在工作区内后执行
    FS-->>P: 工具结果(截断至 64KB)
    P-->>U: agent_settled(回合结束)
```

| 组件 | 负责 | 不负责 |
|---|---|---|
| `agentService`(main) | 会话生命周期、模型档位映射、事件→IPC 推送、审计日志 | 工具实现细节(在门禁组)、UI 状态 |
| 审批门禁工具组 | 路径钳制(规范化+工作区前缀校验)、审批回路、命令 denylist+超时+输出截断、原子写 | 模型调用、UI 渲染 |
| Agent 工作台(renderer) | 会话列表/流式渲染/工具卡片(diff)/审批条/工作区选择器 | 直接触 fs/shell(仅经 IPC) |
| AI8 ReAct 桥(S3) | ai8Client 会话 ↔ 无状态 completions 适配、工具调用文本协议编码/解析 | 权限决策(复用门禁组) |

**模型接入映射**:GLM/DeepSeek/OpenAI/Kimi/Qwen → pi-ai 对应供应商(或 B 案:现有管线 + tools 透传);Bedrock → 现有 SigV4 档位;**AI8 → S3 ReAct 桥(界面标注「实验」)**。ollama 档位 v1 不承诺(A 案 pi-ai 未列出)。

**UI 落位**(按用户指令在 AI8 模块内):AI8 Tab 顶部双模式切换「AI8 工作台 / Agent 工作台」;若与 AI8 内嵌站点布局冲突,备选为独立第 8 Tab `agent`——拍板时定。

## 5. 安全与权限设计(对齐零遥测纪律)

| 机制 | 设计 |
|---|---|
| 工作区钳制 | 用户选定项目目录;所有工具路径规范化后必须位于其内,越界一律拒绝(read 同样受限) |
| 审批三档 | **计划**(只读自动,写/命令全审批)· **标准**(默认)· **信任**(yolo,显式开启+每次会话警示);「本会话总是允许」按命令前缀记忆,仅会话级 |
| 命令防线 | denylist(`rm -rf /`、format、reg delete、shutdown、`curl \| sh` 等)+ 默认超时 120s + 输出截断 64KB + 禁止交互式命令;Windows 无容器级隔离,**残余风险明示**,不承诺沙箱等价 |
| 注入缓解 | 工具结果标记为不可信数据;写盘/执行**不分来源一律过审批**;系统提示声明工具边界 |
| 审计 | 全部工具调用+审批决定追加写 `userData/logs/agent-audit.jsonl` |
| 遥测 | pi-telemetry 不引入不启用(A 案只装 agent+ai 两包或按需 vendor) |

## 6. 分期路线(每期独立 R-N 带 ui:snapshot 门禁)

| 期 | 内容 | 退出判据 | 估量 |
|---|---|---|---|
| **S0 spike** | utilityProcess 内 `createAgentSession` + ZAI 供应商驱动 open.bigmodel.cn GLM + `customTools` 审批回路跑通 | go:no-go;失败→切 B 案内核,S1-S4 不变 | 0.5 会话 |
| **S1 内核接入** | agentService + 门禁工具组 6 件(read/write/edit/bash/list/glob)+ 事件 IPC + 审计 | 命令行级可用:GLM 档位完成「在工作区内建一个文件并运行其测试」 | 1-2 会话 |
| **S2 Agent 工作台** | AI8 Tab 双模式 UI:流式/工具卡片(diff)/审批条/会话列表(JSONL 恢复)/工作区选择/i18n | 端到端人工验收 + 9 view 快照绿 | 2-3 会话 |
| **S3 AI8 ReAct 桥** | 本地 OpenAI 兼容代理(127.0.0.1 随机端口+token)包 ai8Client;文本协议工具循环;界面标注「实验」 | AI8 档位完成 S1 同款任务 | 1-2 会话 |
| **S4 加固** | denylist 补全/超时上限/打包体积核查/基线重拍/文档 | 验收清单全绿 + 发版 | 1 会话 |

## 7. 风险与待确认

| ID | 事项 | 处置 |
|---|---|---|
| R-1 | pi-ai 对 `open.bigmodel.cn` 的覆盖未实证(文档仅列 ZAI) | S0 spike 首验;失败切 B 案 |
| R-2 | AI8 会话协议无 function-calling,ReAct 依赖模型遵循度 | 界面「实验」标注;GLM-5/AI8 内模型实测;失败仅影响 AI8 档位 |
| R-3 | pi scope 迁移史(@mariozechner→@earendil-works)= 演进断版风险 | 精确 pin + vendor 评估;B 案兜底 |
| R-4 | prompt injection(工作区文件内容诱导) | 审批层不分来源兜底;文档明示残余风险 |
| R-5 | Windows 命令执行无容器隔离 | denylist+审批+工作区钳制;容器化不立项(后续可选 WSL) |
| R-6 | agent 循环放大 token 消耗 | 会话轮数/上下文上限 + 成本提示行 |
| R-7 | 中断时半成品写入 | edit 原子写(临时文件+rename);「写前备份 .bak」列为待拍板项 |
| R-8 | 新依赖进入 main 包的体积与 electron-builder files 核查 | S4 验收项(现网 onnxruntime 剪枝先例) |

## 8. 决策请求(拍板清单)

1. 方案:A(pi SDK,推荐)还是 B(自研内核)?
2. UI 落位:AI8 Tab 内双模式(符合原始指令)还是独立第 8 Tab?
3. R-7 写前备份策略:要 `.bak` 还是纯原子写?
4. AI8 档位以「实验」标识进入,是否接受?

---

*关联:R88/R89(AI 实验室)· R110-R129(AI8)· R145(Bedrock)· [pi 仓库](https://github.com/badlogic/pi-mono) · [pi 文档](https://pi.dev/docs/latest) · PR R172*
