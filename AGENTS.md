# AGENTS.md — 通用 AI Agent 规则

> 适用于 OpenAI Codex、Cursor、Continue.dev 等不读取 `CLAUDE.md` 的 agent。
> 完整项目目录 + R-N：[`docs/prd/PRD-0002-rgbbox-project-catalog.md`](./docs/prd/PRD-0002-rgbbox-project-catalog.md)
> 流程规则：[`docs/AI_WORKFLOW.md`](./docs/AI_WORKFLOW.md)

## 强制约束

1. **单 PRD 模型**：所有需求、bug、重构都**追加 R-N 条款**到 `PRD-0002` 对应章节。**禁止开新 PRD。**
2. **代码改动前必须有 R-N**：R-N 必须有 ID、章节定位、验收点，状态 ⏳ 或 🔄。
3. **跳过白名单极小**：见 `docs/AI_WORKFLOW.md §2`；任何「行为变更」必须先追加 R-N。
4. **提交标题格式**：`[PRD-0002] <type>: <subject>`。
5. **完成时自检**：实施完必须把对应 R-N 状态改为 ✅ 并附证据。

## 启动流程

1. Read `docs/AI_WORKFLOW.md`（如未读）；
2. Read `docs/prd/PRD-0002-rgbbox-project-catalog.md` 目录；
3. 找到与当前任务匹配的 R-N；
4. 若无 → 告诉用户"需要先在 PRD-0002 追加 R-N"，等用户确认；
5. 有 → 按 R-N 实施，完成后更新 R-N 状态为 ✅ + 证据。

## Auto 模式（可选）

用户可说 `auto` / `信任模式` / `auto L0` / `auto L1` 触发 auto 模式，让 AI 自主跑完 R-N → 实施 → 自检全流程。详见 [`docs/AI_WORKFLOW.md §8`](./docs/AI_WORKFLOW.md) 与 `docs/prd/PRD-0002-rgbbox-project-catalog.md` **R10**。

L0 = 自动执行（无需审批）；L1 = 一次审批跑完；L2 = 不在 auto 范围，走四步。

## 状态符号 / 跳过规则 / 反例 / 提交格式

详见 [`docs/AI_WORKFLOW.md`](./docs/AI_WORKFLOW.md)。
