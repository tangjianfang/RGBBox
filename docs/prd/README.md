# PRD 索引

> 本项目采用**单 PRD 模型**：所有需求、功能、bug、重构都在 [PRD-0002](./PRD-0002-rgbbox-project-catalog.md) 中以 R-N 条款形式维护。
> 工作流规则：[`../AI_WORKFLOW.md`](../AI_WORKFLOW.md)。
> 旧版多 PRD 流程（PRD-0001）已 `superseded`，保留作历史。

## 状态表

| ID | 标题 | 状态 | 类型 | 最近更新 |
| --- | --- | --- | --- | --- |
| [PRD-0002](./PRD-0002-rgbbox-project-catalog.md) | RGBBox 项目功能目录 | `closed` | 长期活的 feature catalog（**唯一活跃**） | 2026-06-22 |
| [PRD-0001](./PRD-0001-ai-workflow-constitution.md) | AI 工作流宪法 | `superseded` | 历史（多 PRD 模型被 PRD-0002 取代） | 2026-06-11 |

## 当前活跃 R-N（高质量化路线）

> 2026-06-22 四轮评审追加 R13–R16（全部 ⏳ 待实施），配套执行清单见下表。

| R-N | 赛道 / 维度 | 目标 | 定义位置 |
| --- | --- | --- | --- |
| R13 | 赛道 A — 开源推广就绪度 | 62 → 100 | [PRD-0002 §R13](./PRD-0002-rgbbox-project-catalog.md) |
| R14 | 赛道 B — 产品功能竞争力 | 88 → 100 | [PRD-0002 §R14](./PRD-0002-rgbbox-project-catalog.md) |
| R15 | 赛道 C — 产品视觉竞争力 | 82 → 100 | [PRD-0002 §R15](./PRD-0002-rgbbox-project-catalog.md) |
| R16 | 维度 D–L — 竞争力 & 影响力扩展 | 平台/性能/插件/可达性/安全/文档/数据/商业/社区 | [PRD-0002 §R16](./PRD-0002-rgbbox-project-catalog.md) |

**执行入口**：[`TASKS-claude-execution.md`](./TASKS-claude-execution.md) —— 把 R13–R16 拆成颗粒度更小的 P0→P3 任务（T-A* / T-B* / T-C* / T-D*），供 Claude 逐条拾取。该文件只做索引/排序，**不重新定义需求**。

## 命名 / 编号

- 文件名：`PRD-NNNN-<kebab-case-title>.md`
- **当前唯一活跃 PRD：** PRD-0002。新需求不再开新 PRD 文件，全部追加为 R-N 条款到 PRD-0002 对应章节。
- 已 `superseded` / `closed` 的 PRD 保留作历史，不删除。

## R-N 增量追加

见 [`_TEMPLATE.md`](./_TEMPLATE.md)。
