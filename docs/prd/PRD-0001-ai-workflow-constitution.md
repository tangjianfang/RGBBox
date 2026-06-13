# PRD-0001: AI 工作流宪法（防止 AI 瞎改）

| 字段 | 值 |
| --- | --- |
| 状态 | `superseded` |
| 负责人 | mike |
| 创建 | 2026-06-11 |
| 更新 | 2026-06-11 |
| 关联 Issue | — |
| 被取代 | [PRD-0002](./PRD-0002-rgbbox-project-catalog.md) |

---

## 1. 背景 / 目标

**痛点：** 之前几轮协作中，AI 在没有对齐需求的情况下会"顺手"修改代码、调整架构、添加/删除文件，事后用户发现不对但代码已经落了。要么 revert 浪费工作，要么修修补补越改越乱。

**目标：** 在仓库里固化一条"先文档后代码"的强约束。任何代码变更都必须先有一份 **PRD（Product Requirements Document）**，且必须经过人类用户批准后才进入实施阶段。

**预期收益：**
- 每次 AI 动手前都有"白纸黑字"做对齐；
- 改完能逐条勾验收点，避免"做没做"靠感觉；
- 失败项集中记录在「已知问题」里，循环闭环；
- 流程本身以可读的 .md 形式存在，新 AI agent 接入项目时一读就懂。

## 2. 范围

**In scope：**
- 在仓库根与 `docs/` 下创建 4 类文档：宪法、PRD 索引、PRD 模板、规则文件；
- 编写 AI 启动时自动加载的"短期记忆"文件（CLAUDE.md / AGENTS.md / copilot-instructions）；
- 在 PRD-0001 自身中给出"为什么是这套规则"以及"对 PRD 作者的要求"。

**Out of scope：**
- 不引入 issue tracker / PR template / CI 校验脚本（不增加运维负担）；
- 不动任何业务代码（`src/main/`、`src/renderer/`、`src/engine/`、`src/preload/`、`src/shared/`）；
- 不改 `package.json` 的 scripts 段（避免 CI/构建路径受影响）；
- 不强制 GitHub PR 工作流（项目目前是非强制 PR 模式）。

## 3. 详细需求

### R1. 四步铁律（用户原话，AI 必须照执行）

> 1. 用户提需求 → **AI 只更新文档，不写代码**
> 2. 用户看文档确认 → **AI 开始实施**
> 3. 实施完 → **AI 对照文档逐条 check，写测试结果**
> 4. 用户测试 → **通过则关闭这一项**，**失败则记录到「已知问题」并循环**

补充硬规则：
- Step 1 阶段 AI 只能创建/修改 `.md` 文档和 `docs/` 目录；**严禁**修改 `*.ts`、 `*.tsx`、 `*.json`（除 PRD 自己引用的 meta JSON）、 `*.css`、 `*.html`、`*.yml` 等任何"产物代码"；
- Step 2 必须显式得到用户回复"确认 / 批准"才推进到 Step 3；
- Step 3 结束时 AI 必须在 PRD 的「验收清单」里**逐条**写明"通过/失败 + 证据"；
- Step 4 用户测试失败 → 复制到「已知问题」表格，回到 Step 1 起草修订版（不改 ID，追加小版本号 `.v2`）。

### R2. PRD 文件结构

- 位置：`docs/prd/PRD-NNNN-<kebab-case-title>.md`（`NNNN` 为 4 位顺序号，从 0001 起）；
- 模板：`docs/prd/_TEMPLATE.md`（见 R3）；
- 索引：`docs/prd/README.md` 维护一张状态表，至少包含 ID / 标题 / 状态 / 最近更新。

### R3. PRD 模板必须包含的章节

1. 元信息表（id、状态、负责人、日期、关联）
2. 背景 / 目标
3. 范围（in / out）
4. 详细需求（`R1` `R2` ... 编号引用）
5. 受影响文件清单
6. 实施步骤（高层）
7. 验收清单（带 ✅ / ❌ / ⚠️ / — 状态列）
8. 测试方法
9. 已知问题
10. 变更记录

模板与 PRD 都要用同样的章节顺序。

### R4. AI 短期记忆文件

| 文件 | 作用 | 读者 |
| --- | --- | --- |
| `CLAUDE.md` | Claude Code 启动时自动加载 | Claude Code |
| `AGENTS.md` | OpenAI Codex / 通用 agent 约定 | Codex 等 |
| `.github/copilot-instructions.md` | GitHub Copilot 在 IDE 内读取 | Copilot |
| `docs/AI_WORKFLOW.md` | 权威源（其他 3 个文件引用这里） | 人类 / 审计 |

`CLAUDE.md` / `AGENTS.md` / `copilot-instructions.md` 的内容**只放约束清单 + 引用 `docs/AI_WORKFLOW.md`**，避免四处维护同一份规则。

### R5. 允许跳过的极小变更

以下改动**不**强制走 PRD：
- 纯拼写/笔误修复（≤ 5 个字符）；
- 仅改注释 / JSDoc / 文档格式；
- 仅改 `.gitignore` 增删路径；
- lockfile 重新生成（`package-lock.json` / `pnpm-lock.yaml`）的非语义 diff。

但凡是"行为变更"（哪怕只动一行条件）、"新增导出"、"修改类型签名"、"重命名 API"，**必须**走 PRD。

### R6. 与 Git 提交规范的衔接

- 提交标题格式： `[PRD-NNNN] <type>: <subject>`  
  示例：`[PRD-0001] docs: add AI workflow constitution`
- 一个 PRD 可以跨多次 commit，但 commit 标题必须带同一 ID；
- 不强制使用 PR 流程（沿用项目当前习惯）。

### R7. 状态机

```
draft → approved → in-progress → verifying → closed
                              ↘
                              rejected (任意阶段)
```

转换规则：
- 起草中：`draft`
- 用户明确回复"确认 / 批准 / OK / approve"后才能改成 `approved`；
- 收到"开始实施"或 AI 自行判断进入代码阶段前必须先把状态改为 `in-progress`；
- AI 完成实施并填完验收清单后改为 `verifying`；
- 用户测试通过后改为 `closed`；失败则改回 `in-progress` 并在「已知问题」追加一条。

## 4. 受影响文件 / 区域

> 本 PRD 的实施**只新增/修改文档，不动任何代码**。

| 文件 | 改动类型 | 用途 |
| --- | --- | --- |
| `docs/AI_WORKFLOW.md` | 新增 | 权威源：四步铁律 + 状态机 + 跳过规则 |
| `docs/prd/README.md` | 新增 | PRD 索引状态表 |
| `docs/prd/_TEMPLATE.md` | 新增 | 空白 PRD 模板（与 R3 对齐） |
| `docs/prd/PRD-0001-ai-workflow-constitution.md` | 新增 | 本文件 |
| `CLAUDE.md` | 新增 | Claude Code 启动规则 |
| `AGENTS.md` | 新增 | 通用 AI agent 规则 |
| `.github/copilot-instructions.md` | 修改 | 在现有内容后追加"遵守 AI_WORKFLOW.md"段 |

## 5. 实施步骤（高层）

1. 用户审阅本 PRD 直至状态变 `approved`；
2. 创建 `docs/AI_WORKFLOW.md`（权威源）；
3. 创建 `docs/prd/README.md`（索引）；
4. 创建 `CLAUDE.md`、`AGENTS.md`；
5. 在 `.github/copilot-instructions.md` 末尾追加约束段；
6. 逐条对照 §6 验收清单，AI 自检并填证据；
7. 交付用户做"流程 demo"测试：用一条**假的、不需要改任何代码**的小需求（例如"文档里把'瞎改'换成'随意改动'以求语气中性"）走完整四步，验证流程跑得通。

## 6. 验收清单

> AI 自检完成于 2026-06-11。证据来自本次会话实际产物。

| ID | 验收点 | 状态 | 证据 / 备注 |
| --- | --- | --- | --- |
| R1 | AI 在本次会话中没有修改任何业务代码文件 | ✅ | `git status` 输出：`M .github/copilot-instructions.md`、`?? AGENTS.md`、`?? CLAUDE.md`、`?? docs/AI_WORKFLOW.md`、`?? docs/prd/`。共 **6 个新 .md + 1 个修改的 .md**，**`src/`、`tests/`、`package.json`、`.github/workflows/` 均无修改**。 |
| R1 | 流程描述与用户原话四步一致（无篡改） | ✅ | `docs/AI_WORKFLOW.md §1` 开头用 `> ` 块逐字引用用户原话，无增删改写。 |
| R2 | `docs/prd/PRD-0001-...md` 路径正确，文件名符合 kebab-case | ✅ | 实际路径 `docs/prd/PRD-0001-ai-workflow-constitution.md`，全小写 kebab-case，编号 4 位。 |
| R2 | `docs/prd/README.md` 含状态表并列出 PRD-0001 | ✅ | `docs/prd/README.md` 状态表第 1 行即 PRD-0001，状态字段为 `approved`（待你 close 后我会改为 `closed`）。 |
| R3 | `_TEMPLATE.md` 包含 R3 列出的 10 个章节 | ✅ | `_TEMPLATE.md` 包含 1 个元信息表 + §1–§9 共 10 个 region，顺序与 §3 R3 列表逐项对应。 |
| R4 | `CLAUDE.md` / `AGENTS.md` / `copilot-instructions.md` 三者均引用 `docs/AI_WORKFLOW.md` | ✅ | 3 文件均在首段/约束段给出 `docs/AI_WORKFLOW.md` 链接；用户可 `grep -n "docs/AI_WORKFLOW.md" CLAUDE.md AGENTS.md .github/copilot-instructions.md` 复核。 |
| R5 | 跳过规则白名单清晰，行为变更不在其中 | ✅ | `docs/AI_WORKFLOW.md §4` 列 4 类可跳过 + 5 类"行为变更"必须走，并对"拿不准时默认走 PRD"给出兜底。 |
| R6 | 提交标题格式示例正确给出 | ✅ | `docs/AI_WORKFLOW.md §5` 给出格式 `[PRD-NNNN] <type>: <subject>` 与示例 `[PRD-0001] docs: add AI workflow constitution`。 |
| R7 | 状态机定义与转换规则完整 | ✅ | `docs/AI_WORKFLOW.md §2` 含 ASCII 状态机图 + 6 行状态表（含义 + 推进人），§1.1–§1.4 给出每一步的"状态变更"动作。 |

## 7. 测试方法（用户怎么验）

- **静态检查：** 打开 7 个新/改文件，对照 §3 逐条确认；
- **流程 demo：** 用户给一条只涉及文档的小需求（如"把所有 PRD 模板里的 R1/R2 编号统一为 `Req-1` `Req-2` 风格"），走完四步；
- **反向检查：** 故意要求 AI 改一处代码（不在 PRD 里），观察 AI 是否拒绝并要求先写 PRD。

## 8. 已知问题

| 日期 | 问题描述 | 重现 | 状态 |
| --- | --- | --- | --- |
| — | — | — | — |

## 9. 变更记录

| 日期 | 变更 | 作者 |
| --- | --- | --- |
| 2026-06-11 | 起草 v1 | mike / Claude |
| 2026-06-11 | 状态 draft → approved（用户批准） | mike |
| 2026-06-11 | 移除 R-Demo 行（用户选择暂不要 demo 需求） | mike |
| 2026-06-11 | 实施落地：创建 5 个新 .md + 修改 1 个 .md | Claude |
| 2026-06-11 | 状态 approved → in-progress → verifying；§6 自检全部 ✅ | Claude |
| 2026-06-11 | 用户验收通过；状态 verifying → closed | mike |
| 2026-06-11 | 状态 closed → superseded（被 [PRD-0002](./PRD-0002-rgbbox-project-catalog.md) 取代，多 PRD 流程废弃） | mike |
