# R79 OCR 修复 + 框选识别 + 打磨 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans（当前会话内联执行）。Checkbox 跟踪。

**Goal:** PRD-0002 R79——① ocrService 脚本修复（实证：OpenAsync(Read)+反射直调 CreateAsync）+ CJK 空格合并；② OCR 按钮改框选识别（松手即识别所选区域，面板留「整图」）；③ 深色滚动条；④ 胶片栏缩略图双击进编辑；⑤ hover 手势光标。

## Global Constraints
- 提交 `[PRD-0002] <type>: <subject>` + Co-Authored-By；只 add 本任务文件。
- 命令：`yarn typecheck` / `yarn vitest run <path>` / 全量 `--maxWorkers=4` / `yarn build`。
- 零新 IPC / 依赖；R78 交互语义与既有测试零回归。

---

### Task 1: ocrService 修复（TDD）
**Files:** `src/main/ocrService.ts`、`tests/main/ocrService.test.ts`
- [ ] 测试更新：`buildOcrScript` 断言含 `OpenAsync` 与 `$createMethod`（反射直调）；`parseOcrOutput` 新用例——`'会 议 记 录 2026'` → `'会议记录 2026'`（CJK 单字间空格合并，中英边界保留），`'Chinese Test'` 不变
- [ ] 实现：脚本 `$decoder` 段替换为实证方案（流式 + 反射）；`mergeCjkSpaces(text)` 纯函数导出并在 parseOcrOutput 应用
- [ ] 绿 + typecheck + Commit `[PRD-0002] fix: R79.1 ocr script decoder via stream+reflection (proven), cjk space merge`

### Task 2: AnnotateOverlay 框选识别 + 手势光标
**Files:** `AnnotateOverlay.tsx`、`i18n/index.tsx`、`styles.css`、`AnnotateOverlay.test.tsx`
- [ ] `ocrRegion` 状态 `{active, start, end}`：OCR 按钮 → 进入框选（遮罩挖洞 div + 十字光标，ESC 退出）；画布 pointerdown/move/up 更新；松手 ≥8px → 裁剪 `exportDataUrl()` 结果到该区域（图像坐标）→ 识别；<8px 取消
- [ ] 面板头部「整图」按钮 → `runOcr()`（现有整图导出）
- [ ] hover 光标：pointermove 空闲态计算（旋转柄→grab；手柄→按角度桶 nwse/nesw/ns/ew；hitTest→move；绘制工具→crosshair；z>1→grab），写入 `canvas.style.cursor`
- [ ] i18n：`video.annotate.ocrRegion / ocrFullImage / ocrRegionHint`；CSS：`.video-ocr-region-mask/-rect`、深色滚动条
- [ ] 用例 +2：框选流程（pointer 序列 → ocrRecognize 调用且面板出结果）；整图按钮调用 ocrRecognize
- [ ] Commit `[PRD-0002] feat: R79.2/R79.5 region-OCR + hover gesture cursors`

### Task 3: 滚动条 + 双击 + 收尾
**Files:** `styles.css`、`CaptureFilmstrip.tsx`、`CaptureFilmstrip.test.tsx`
- [ ] 深色 webkit 滚动条：`.video-annotate-ocr-text`、`.video-filmstrip`（已有，统一变量）、`.video-annotate-toolbar*` 无滚动不需要——作用于 OCR textarea + OCR 面板溢出
- [ ] 缩略图 `onDoubleClick={() => onEdit(it)}`；用例 +1（双击触发 onEdit）
- [ ] Commit `[PRD-0002] feat: R79.3/R79.4 dark scrollbars + thumbnail dblclick-to-edit`

### Task 4: 全量验证 + code review + PRD 收尾
- [ ] `yarn typecheck && yarn vitest run --maxWorkers=4 && yarn build`
- [ ] code-review `47f9420~1..HEAD` → 修复确认项
- [ ] PRD R79.8 勾选 + R79.9 ✅ + §9 两行 + 交付报告

## Self-Review
覆盖 R79.1→T1、R79.2→T2、R79.3→T3、R79.4→T3、R79.5→T2、R79.8→T4。无占位符。
