- [x] Verify that the copilot-instructions.md file in the .github directory is created.
- [x] Clarify Project Requirements
- [x] Scaffold the Project
- [x] Customize the Project
- [x] Install Required Extensions
- [x] Compile the Project
- [x] Create and Run Task
- [x] Launch the Project
- [x] Ensure Documentation is Complete

Project context:
- RGBBox is an Electron + Vite + React + TypeScript desktop RGB lighting client.
- MVP targets Windows and macOS, local-first usage, multi-display screen sampling, virtual preview, and preset effects.
- Keep renderer code isolated from Node APIs through preload IPC.
- Keep engine logic in pure TypeScript modules until native capture/output adapters are introduced.
- Prefer focused changes and verify with `npm run typecheck` and `npm run build`.

## Workflow / 工作流（单 PRD 模型）

This project uses a **single-PRD model**. The only active PRD is [`docs/prd/PRD-0002-rgbbox-project-catalog.md`](../docs/prd/PRD-0002-rgbbox-project-catalog.md). All new requirements, bug fixes, and refactors must be added as **R-N items** to that PRD — **do not create new PRDs**.

Full rules: [`docs/AI_WORKFLOW.md`](../docs/AI_WORKFLOW.md)

### Non-negotiable

1. **Append R-N to PRD-0002**, never create a new PRD file.
2. **No code change without an R-N item** with status ⏳ or 🔄.
3. **Commit format**: `[PRD-0002] <type>: <subject>`.
4. **After implementation**, update R-N status to ✅ with evidence.
5. **Behavior changes always require an R-N**. See skip-whitelist in `docs/AI_WORKFLOW.md §2`.

### 不可越界 / Do not cross the line

- 不要"顺手"修改 R-N 范围之外的代码；
- 不要在没有 R-N 的情况下 commit 行为变更；
- 不要把"修 bug"当成"重构"的借口——后者需要独立 R-N；
- 详细反例见 `docs/AI_WORKFLOW.md §6`。

### Auto 模式 / Auto mode (optional)

The user may opt into **auto mode** by saying `auto` / `信任模式` / `auto L0` / `auto L1`. In auto mode the AI may run the full R-N → implement → self-check loop without per-step approval. See `docs/AI_WORKFLOW.md §8` and `docs/prd/PRD-0002-rgbbox-project-catalog.md` R10 for risk levels L0/L1/L2 and exit conditions.

用户可以说 `auto` / `信任模式` 触发 auto 模式，让 AI 自主跑完 R-N → 实施 → 自检全流程。风险分级 L0 / L1 / L2 与退出条件见 `docs/AI_WORKFLOW.md §8` 和 PRD-0002 R10。
