# R78 文本系统 + 手势编辑 + OCR + 胶片栏约束 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans（当前会话内联执行）. Steps use checkbox (`- [ ]`) syntax.

**Goal:** PRD-0002 R78——① 标注器文本 IME 修复 + 对齐/字号/粗体 + 图层排序 + Ctrl+C/V 双向纯文本；② 形状同工具点选编辑 + 角等比/边拉伸 + 旋转柄；③ Windows 原生 OCR（WinRT/PowerShell）+ 识别面板；④ 胶片栏限宽修复 + 滚动条/‹›/滚轮三交互。

**Architecture:** 模型层加 `rotation/align/bold` 字段与 `rotatePt/reorderShape/等比缩放`（纯函数，单测）；渲染层加旋转包装与 align/bold（mock-ctx 测试）；OCR 全在主进程（PS 脚本组装/输出解析纯函数 + execFile 包装）；+3 IPC；胶片栏修 `min-width:0` 约束链 + `computeCanNav` 纯函数 + 导航按钮。

**Tech Stack:** 无新增 npm 依赖；PowerShell（WinRT OCR）。

## Global Constraints

- 提交 `[PRD-0002] <type>: <subject>` + Co-Authored-By；只 add 本任务文件。
- 命令：`yarn typecheck` / `yarn vitest run <path>` / 全量 `yarn vitest run --maxWorkers=4` / `yarn build`。
- 无水印铁律（R75.2）；不动清单见 R78.5；既有测试零回归（公共类名/回调不破坏）。
- happy-dom 无真 canvas/IME——IME 修复以行为守卫代码 + 组件测试断言 keydown 处理函数不因 Enter 提交（通过 `nativeEvent.isComposing` 模拟困难，改为抽出 `shouldCommitText(e): boolean` 纯函数并单测）。

---

### Task 1: annotationModel 扩展（rotation/align/bold/reorder/旋转数学/等比缩放）TDD

**Files:** Modify `src/renderer/src/components/video/annotationModel.ts`、`tests/renderer/components/annotationModel.test.ts`

**Interfaces（Produces）:**

```ts
// Shape 新增可选字段
rotation?: number        // 度，绕 bbox 中心，顺时针
align?: 'left' | 'center' | 'right'
bold?: boolean
export type ReorderDir = 'front' | 'back' | 'forward' | 'backward'
export function reorderShape(shapes: Shape[], id: string, dir: ReorderDir): Shape[]
export function rotatePt(p: Pt, center: Pt, deg: number): Pt
export function hitTestRotated(shapes: Shape[], p: Pt): Shape | null   // 有 rotation 的形状先逆旋转再 hitShape
// resizeShape 扩展：opts?: { proportional?: boolean }——角手柄等比（含 pen/mosaic 点列按 bbox 比例映射、text 同步缩放字号 width）
```

用例（+6）：reorder 四方向；rotatePt 90°；hitTestRotated 旋转矩形命中/未命中；proportional 角缩放（rect 等比、pen 点列映射、text 字号同比）；edge 拉伸 pen 点列单轴映射；makeShape 透传新字段。

- [ ] 失败测试 → 实现 → 绿 → typecheck → Commit `[PRD-0002] feat: R78.1/R78.2 annotation model extensions (rotation/align/bold/reorder/proportional resize)`

---

### Task 2: annotationRender 旋转渲染 + align/bold（TDD）

**Files:** Modify `src/renderer/src/components/video/annotationRender.ts`、`tests/renderer/components/annotationRender.test.ts`

要点：所有形状绘制包 `withRotation(ctx, s, draw)`（save→translate(center)→rotate→translate(-center)→draw→restore，rotation=0 时直通）；text align 逐行 `measureText` 偏移（ctx.measureText 不可用时回退 0 偏移即左对齐）；font 组装 `${bold ? '700 ' : ''}${size}px system-ui, sans-serif`；选中框/手柄画在同一旋转变换内。

用例（+3）：rotate 非 0 时 save/translate/rotate 调用序列出现且 restore 配对；align='center' 触发 measureText 且 fillText x 偏移；bold 出现在 font 字符串（`700 24px ...`）。

- [ ] 失败测试 → 实现 → 绿 → Commit `[PRD-0002] feat: R78.1/R78.2 rotated + aligned/bold text rendering`

---

### Task 3: ocrService + IPC ×3 + preload + mocks（TDD）

**Files:** Create `src/main/ocrService.ts`、`tests/main/ocrService.test.ts`；Modify `src/shared/ipc.ts`、`src/main/index.ts`、`src/preload/index.ts`、`tests/renderer/_helpers.tsx`

**ocrService 接口：**

```ts
export function buildOcrScript(imagePath: string): string      // 纯函数：PS 脚本文本
export function parseOcrOutput(stdout: string): { ok: boolean; text: string; hint?: string }
// 标记协议：成功行 "RGBBOX_OCR_BEGIN" ... "RGBBOX_OCR_END"；失败 "RGBBOX_OCR_ERR:<code>"（nolangpack / decode / engine）
export async function recognizeImage(dataUrl: string, run?: typeof execFile): Promise<{ ok: boolean; text: string; hint?: string }>
// 默认 execFile('powershell.exe', ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File', script], {timeout:30000})
// dataUrl → 临时 png（os.tmpdir）→ 脚本 → 解析 → 清理（finally）
```

PS 脚本核心（组装进 buildOcrScript）：`TryCreateFromUserProfileLanguages()` 为空时遍历 `AvailableLanguages` 尝试 `zh-Hans`/`zh-Hant`/`en`；`BitmapDecoder` 软件位图 → `RecognizeAsync`（WinRT await 用标准 `AsTask` 反射包装）；行拼接 `\n`；错误打标记行。`recognizeImage` 非 win32 平台直接 `{ok:false, hint:'unsupported'}`。

IPC：`clipboardWriteText: 'rgbbox:clipboard:write-text'`、`clipboardReadText: 'rgbbox:clipboard:read-text'`、`ocrRecognize: 'rgbbox:ocr:recognize'`；main handler（clipboard.writeText/readText；ocr 调 recognizeImage，入参校验 dataUrl string）；preload 白名单三 API；`_helpers` 三 mock（writeText→true、readText→''、ocr→{ok:true,text:''}）。

用例（+5）：buildOcrScript 含路径与语言回退序；parseOcrOutput 成功/失败/空/乱序；recognizeImage 非 win32 unsupported（注入假 run 断言未调用）。

- [ ] 失败测试 → 实现 → 绿 → typecheck → Commit `[PRD-0002] feat: R78.1/R78.3 clipboard-text + ocr IPC, winrt ocr service`

---

### Task 4: AnnotateOverlay 交互大改

**Files:** Modify `src/renderer/src/components/video/AnnotateOverlay.tsx`、`src/renderer/src/i18n/index.tsx`、`src/renderer/src/styles.css`、`tests/renderer/components/AnnotateOverlay.test.tsx`

行为清单：
1. **IME**：抽出 `shouldCommitText(ev: {key: string; isComposing?: boolean}): boolean`（`key==='Enter' && !shift && !isComposing`）导出纯函数并单测；textarea onKeyDown 用之；window capture 的 Escape 分支补 `if (e.isComposing) return`。
2. **同工具点选**：绘制工具分支 pointerdown 先 `hitTestRotated`，命中 → 选中 + move 拖拽会话，未命中才新建。
3. **手柄语义**：角（nw/ne/se/sw）→ `resizeShape(..., {proportional:true})`；边 → 原逻辑；`hitHandle` 手柄屏幕位过 `rotatePt`。
4. **旋转柄**：选中形状顶部中点沿旋转后上方偏移 22px；命中（16px）→ drag `rotate`：`rotation = orig + (angle(cursor-center) - angle(start-center))`，Shift 吸附 15°；渲染时模型已有 rotation。
5. **文字工具条**：选中 text 形状或 text 工具激活时显示——对齐 3 钮（AlignLeft/Center/Right）、字号 select（12/16/20/24/32/48，映射图像空间=css/k）、粗体 B（Bold）；作用于选中（update+commit）否则设默认 state。
6. **图层 4 钮**：ArrowUpToLine/ArrowDownToLine/ChevronUp/ChevronDown，`reorderShape` + commit；任意选中可用。
7. **Ctrl+C/V**：window keydown——`ctrl/meta+c` 且选中 text → `clipboardWriteText(shape.text)`；`ctrl/meta+v` → `clipboardReadText().then(txt => txt && setTextInput({at: lastMouseImagePt, value: txt}))`（pointermove 记录 `lastPtRef`）。
8. **OCR**：工具条右侧 ScanText 按钮 → `ocrState {status,text,hint}`；运行 `window.rgbbox.ocrRecognize(exportDataUrl())`；右上面板（loading/可编辑 textarea/行数/「复制全部」→ clipboardWriteText）；关闭面板按钮。
9. i18n：`video.annotate.align.left/center/right`、`video.annotate.bold`、`video.annotate.fontSize`、`video.annotate.layer.front/back/forward/backward`、`video.annotate.ocr / ocrRunning / ocrEmpty / ocrFailed / ocrCopyAll / ocrClose / ocrNoLang` 等 zh/en；CSS：`.video-annotate-texttools/-layerbar/-ocr-panel/-ocr-text/-rotate-handle`。

用例（+3）：`shouldCommitText` 纯函数（3 断言并入一个用例）；OCR 按钮点击后面板出现（mock resolve）且复制全部调用 clipboardWriteText；图层按钮 disabled 无选中。

- [ ] 实现 → 组件测试绿 → typecheck → Commit `[PRD-0002] feat: R78.1/R78.2/R78.3 annotator interactions (IME fix, text toolbar, layers, copy/paste, rotate, OCR panel)`

---

### Task 5: 胶片栏限宽 + 导航（TDD）

**Files:** Modify `src/renderer/src/components/CaptureFilmstrip.tsx`、`src/renderer/src/styles.css`、`tests/renderer/components/CaptureFilmstrip.test.tsx`

要点：
- `export function computeCanNav(scrollWidth: number, clientWidth: number, scrollLeft: number): { left: boolean; right: boolean }`（纯函数 + 单测）
- 组件：滚动容器 ref + onScroll/onWheel 后 setState canNav；‹ › 按钮（ChevronLeft/Right，`scrollBy({left: ±176, behavior:'smooth'})`）；到头隐藏。
- CSS 根因修复：`.video-layout` / `.video-stage` / 胶片栏 `min-width: 0`（或 grid 子项 min-width:0）+ `.video-filmstrip { max-width: 100%; flex-wrap: nowrap }`；细滚动条 `::-webkit-scrollbar { height: 6px }` 定制。

用例（+2）：computeCanNav 边界（未溢出全 false；溢出左侧贴头 left=false）；‹/› 按钮在 items 渲染时存在且点击调 scrollBy（spy `Element.prototype.scrollBy`）。

- [ ] 失败测试 → 实现 → 绿 → Commit `[PRD-0002] fix: R78.4 filmstrip width constraint + scrollbar/prev-next/wheel navigation`

---

### Task 6: 全量验证 + code review + PRD 收尾 + 交付

- [ ] `yarn typecheck && yarn vitest run --maxWorkers=4 && yarn build`（记数字）
- [ ] code-review 技能审查 `db4a63c~1..HEAD`，确认项修复/如实记录
- [ ] PRD R78.7 勾选 + 证据；R78.8 → ✅；§9 两行
- [ ] Commit + 交付报告（实机清单含 IME/旋转/OCR 识别率）

## Self-Review

覆盖：R78.1→T1/2/4、R78.2→T1/2/4、R78.3→T3/4、R78.4→T5、R78.7→T6。类型一致（Shape 新字段贯穿 model/render/overlay；IPC 三名贯穿 main/preload/mock）。无占位符。
