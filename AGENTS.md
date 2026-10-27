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
6. **清理冗余 UI 元素，布局不清就重构**：「冗余」= 无引用 / 不可达 / 重复的组件、样式、文案、i18n 键，发现即清；「布局不清」必须有证据（用户反馈 / UI review 截图），不得凭 agent 主观感觉发起重构。清理与重构都是行为变更，一律走 R-N，**禁止顺手大改**；重构验收 = 全量测试门禁 + 真机/截图视觉复核。
7. **迭代时兼顾用户、开发、AI Agent 三者体验，不破坏现有功能**：用户 = 视觉/交互/i18n/性能不退化；开发者 = 模块边界（编排层+域 hook、engine 纯 TS）、可测性、类型安全不劣化；AI Agent = 文档与代码不漂移、命令确定性、测试即规格、R-N 可追溯。「不破坏现有功能」是硬约束：行为变更必须 R-N，收尾 `yarn typecheck` + 全量 `yarn test` 全绿 + R-N 置 ✅ 附证据，回归即 ❌ 入 §8 循环修。

## 启动流程

1. Read `docs/AI_WORKFLOW.md`（如未读）；
2. Read `docs/prd/PRD-0002-rgbbox-project-catalog.md` 目录；
3. 找到与当前任务匹配的 R-N；
4. 若无 → 告诉用户"需要先在 PRD-0002 追加 R-N"，等用户确认；
5. 有 → 按 R-N 实施，完成后更新 R-N 状态为 ✅ + 证据。

## CC Switch / Claude Code 启动注意事项

- 如果通过 CC Switch 使用 GitHub Copilot 供应商，务必在**已完成 Active 切换的同一个终端**里启动 Claude Code。
- 若新终端提示 `Not logged in · Please run /login`，通常表示该终端没有继承 CC Switch 会话；请先重新激活 CC Switch，再启动 Claude Code。

## Auto 模式（可选）

用户可说 `auto` / `信任模式` / `auto L0` / `auto L1` 触发 auto 模式，让 AI 自主跑完 R-N → 实施 → 自检全流程。详见 [`docs/AI_WORKFLOW.md §8`](./docs/AI_WORKFLOW.md) 与 `docs/prd/PRD-0002-rgbbox-project-catalog.md` **R10**。

L0 = 自动执行（无需审批）；L1 = 一次审批跑完；L2 = 不在 auto 范围，走四步。

## 状态符号 / 跳过规则 / 反例 / 提交格式

详见 [`docs/AI_WORKFLOW.md`](./docs/AI_WORKFLOW.md)。
