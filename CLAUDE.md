# CLAUDE.md — Claude Code 启动规则

> 完整项目目录 + 所有功能 R-N：[`docs/prd/PRD-0002-rgbbox-project-catalog.md`](./docs/prd/PRD-0002-rgbbox-project-catalog.md)
> 流程规则：[`docs/AI_WORKFLOW.md`](./docs/AI_WORKFLOW.md)

## 强制约束（违反任何一条都属于「瞎改」）

1. **单 PRD 模型**：所有需求、bug、重构都**追加 R-N 条款**到 `PRD-0002` 对应章节。**禁止开新 PRD。**
2. **代码改动前必须有 R-N**：R-N 必须有 ID、章节定位、验收点，状态 ⏳ 或 🔄。
3. **跳过白名单极小**：见 `docs/AI_WORKFLOW.md §2`；任何「行为变更」必须先追加 R-N。
4. **提交标题格式**：`[PRD-0002] <type>: <subject>`。
5. **完成时自检**：实施完必须把对应 R-N 状态改为 ✅ 并附证据。

## 启动时必做的检查

- 读 [`docs/prd/PRD-0002-rgbbox-project-catalog.md`](./docs/prd/PRD-0002-rgbbox-project-catalog.md)（如未读过）；
- 看 `docs/prd/README.md` 索引，确认当前任务有匹配 R-N；
- 若没有匹配 R-N → 询问用户"是否要在 PRD-0002 追加 R-N？"，**不要直接动手**。

## Auto 模式（可选）

用户可说 `auto` / `信任模式` / `auto L0` / `auto L1` 触发 auto 模式，让 AI 自主跑完 R-N → 实施 → 自检全流程。详见 [`docs/AI_WORKFLOW.md §8`](./docs/AI_WORKFLOW.md) 与 `docs/prd/PRD-0002-rgbbox-project-catalog.md` **R10**。

L0 = 自动执行（无需审批）；L1 = 一次审批跑完；L2 = 不在 auto 范围，走四步。

## 状态符号 / 跳过规则 / 反例 / 提交格式

详见 [`docs/AI_WORKFLOW.md`](./docs/AI_WORKFLOW.md)。

## 与项目相关的非工作流提示

- 项目类型：Electron + Vite + React + TypeScript 桌面 RGB 灯效客户端；
- 不要修改 `package.json` 的 scripts 段（影响构建路径），除非本次 R-N 专门改了它；
- `src/main/index.ts` 与 `src/preload/index.ts` 是已审过的 P0/P1 问题集中点，**未通过 R-N 流程不要"顺手"修**。
