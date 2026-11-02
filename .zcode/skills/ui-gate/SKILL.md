---
name: ui-gate
description: RGBBox UI 改动收尾门禁（R332 立项）。在本仓库完成任何渲染层 UI 改动（组件 / CSS / i18n / 布局）准备收尾时、发版或 dist 前验证视觉门禁时、或用户提到 视觉门禁 / 快照 / ui:snapshot / 基线 / 溢出 / 布局回归 / UI 收尾 时使用。固化 R-N 立项 → typecheck/test/build → 10 视图快照 compare（含面板级溢出探针）→ 基线协议 → 守卫登记 → 证据回填的完整流程，防止 R331 类「内容溢出卡片」缺陷再次漏网。
---

# RGBBox UI 收尾门禁（ui-gate）

> 来源：R331（系统设置手势宏 8 列表格溢出卡片边界 279px）+ R332（视觉门禁补洞）。
> 当时的教训：像素 diff 只能拦「相对基线的变化」，**首日就带病上线且不在 VIEWS 清单里的视图没有任何防线**。
> 收尾 = 下面 5 步全绿，缺一不可。跳步 = R331 重演。

## 0. 前置（AGENTS.md 硬约束）

- 改 UI 代码前，PRD-0002 已有对应 R-N 条款（⏳/🔄）。没有 → 先立项，不动代码。
- 行为变更永远需要 R-N；拿不准就追加。

## 1. 命令序列（按序执行，全部 exit 0）

```bash
yarn typecheck          # node + web 双绿
yarn test               # 全量 vitest，0 失败
yarn build              # 快照/探针的 fresh-out 守卫要求 out/ 比 src/ 新
node scripts/ui-snapshot.mjs --compare   # 10 视图像素门禁 + 面板级溢出探针
node scripts/verify-r160-scale.mjs       # 布局/字号/缩放相关改动必跑；5 档 × 10 视图
```

- `ui-snapshot --compare` 每视图做两件事：①pixelmatch 像素 diff（限额见脚本 `DIFF_LIMITS`，diagnostics 0.35% 是活数据余量，其余 0.1%）；②**面板级溢出探针**（R332）：页面 + 全部 `.panel` 卡片断言 `scrollWidth ≤ clientWidth+1`，`overflow-x` 为 auto/scroll/hidden/clip 的元素豁免（那是刻意裁切/滚动）。
- 探针红 = `FAIL <view>: content escapes its container — …`，该视图被作废（不截图、不计数、exit 1）。**任何模式（含 --update-baseline）都拦**——不允许把溢出布局拍成基线。
- 探针误报（确属刻意溢出）→ 脚本内 `OVERFLOW_ALLOWLIST` 加条目并**注明理由**，别删探针。

## 2. 基线协议（改视觉域时）

1. compare 红 ≠ 自动重拍基线。先逐视图归因：diff 图在 `docs/ui-baseline/diff/`。
2. 只有差异**全部可归因于本次有意的视觉变更**时才允许 `--update-baseline`。
3. update 后立即复跑 `--compare`，必须 10/10 GATE PASS。
4. `git status docs/ui-baseline/` 应只出现预期视图的文件；既有视图字节变但像素 0.0000% 时，`git checkout --` 还原旧基线再复跑 compare 验证等价（最小 diff 原则，R332.3③ 先例）。
5. 触碰 src/ 之后必须重新 `yarn build` 再 update（fresh-out 守卫 + 基线戳的是当时 HEAD）。
6. 新视图/新页面入列：`ui-snapshot.mjs` 与 `verify-r160-scale.mjs` 的 `VIEWS` **两处同步追加**（按 rail 运行时顺序，索引点击），并补拍基线。R332 之前的教训就是两处清单都漏了 settings。

## 3. 守卫登记（防「上线没样式/没规则」）

- 新功能 UI 组件 → `tests/renderer/uiStylesCoverage.test.ts` 登记册追加家族条目（组件依赖的每个 class 必须在 app.css 有基础规则）。
- 注意匹配器边界：元素限定复合选择器（`select.foo`）不计入 `.foo`，登记时写裸 class 规则或注明豁免（R331 的 macro-cell 先例）。
- i18n 新键必须 zh/en 平价（ZH TranslationTable 类型使 typecheck 即证明）。

## 4. 证据回填（R-N → ✅）

- PRD 对应 R-N 附：命令输出摘要（通过数/失败数/diff 率）、红→绿演练（若有）、`git diff` 范围。
- 真机目视项如实标注「待用户」，不代用户宣布视觉通过。
- 完成后按用户常设指令自动 `[PRD-0002] <type>: <subject>` commit + push（除非用户说先别提交）。

## 5. 常见坑

- `MISSING BASELINE` → 该视图没基线（新入列视图），走 §2.6 补拍。
- `NO boxes.json` → 基线目录缺遮罩清单，重拍该视图基线。
- 快照偶发超时 → 脚本自带 3 次重试 + 完整 Playwright 调用日志（R322），看日志别盲跑。
- 快照前必须 `yarn build`；改一行 CSS 也一样（fresh-out 守卫会拒绝 stale out/）。
