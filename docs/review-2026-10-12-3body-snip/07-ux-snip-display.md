# 07 · UX 诊断与修复设计 — 截图显示「放大失真」

> 用户原话:「截图之后显示放大失真,请按照截图的分辨率大小自适应显示大小即可」
> 仓库只读审查,未改任何代码。所有行号基于当前 main(5b861c8)。
> [V] = 亲自读到代码/文件;[I] = 基于证据的推断。

---

## 0. 结论速览

- **根因(一处)**:`AnnotateOverlay` 初始视图用 `containRect` 做 contain 适配,`k = min(cw/nw, ch/nh)` **无 ≤1 上限**——小尺寸裁剪图一进入标注器就被等比拉大到撑满整个舞台/全屏窗口,低分辨率位图上采样 → 模糊发虚。用户 12 张真实截图**全部**是小尺寸(363×277 ~ 1288×826),无一例外被放大 1.3×~5.3× 显示。[V]
- **修复核心(一行换函数)**:初始视图 `k = min(1, containK)`——大图 contain 缩小、小图 1:1 原生尺寸居中,进入时**绝不放大**。改 `AnnotateOverlay.tsx:134-137` 一处,Alt+A 全屏标注(SnipView)与视频工作站编辑(VideoStudioView)两个入口同时受益;标注/导出/OCR 坐标系全部存图像原生像素,对缩放天然免疫,零连带改动。
- 形态判定:题目选项 **a)**(低分辨率图被拉伸到容器尺寸→模糊)为主;**不是** b(canvas 尺寸是动态 DPR 感知的,非固定拉伸)、**不是** c(canvas backing 已乘 devicePixelRatio;缩略图是下采样)、**不是** d(contain 等比,纵横比未变——「失真」的感知语义是发虚模糊,而非拉伸变形)。置信度 **0.92**。

---

## 1. 显示链路走查表

截图从 `captureStore` 到屏幕的全部路径(消费方 grep 全量核实,无遗漏:AnnotateOverlay 仅 SnipView 与 VideoStudioView 两处实例化 [V])。

| # | 路径 | 代码位置 | 当前尺寸策略 | 纵横比 | DPR/平滑 | 判定 |
|---|------|----------|--------------|--------|----------|------|
| A | Alt+A → 每屏冻结帧全屏窗口(SnipView 拖选态) | `src/main/snipManager.ts:132-155`(窗口 bounds=display bounds)、`:291-301`(fullscreen+置顶);`src/renderer/src/components/SnipView.tsx:70-76`(canvas backing=帧物理像素,1:1 drawImage);CSS `src/renderer/src/styles/app.css:7301` `.snip-canvas { width:100vw; height:100vh }` | CSS 把物理像素 canvas 拉伸到窗口 CSS 尺寸;窗口纵横比==显示器纵横比(bounds 直建 [V]),等比缩放 | 保持 [V] | 混合 DPR 屏(如 125%)有一次浏览器重采样(轻微变软,非变形)[I] | 无变形;非本次主诉 |
| B | **拖选确认 → SnipView 标注态(全屏)** | `SnipView.tsx:114`(`cropToDataUrl` 物理像素裁剪)→ `:208-215` 渲染 `<AnnotateOverlay>` 于 `.snip-root`(全屏);`AnnotateOverlay.tsx:134-137` `fit = containRect(wrapSize, natural)` | **contain 无上限放大**:k=min(cw/nw,ch/nh),小图拉满全屏;`:205` `setTransform(dpr*k,…)` 后单次 `drawImage` 上采样(双线性) | 保持(等比)[V] | canvas backing 正确乘 dpr(`:195-200`)[V],模糊非 DPR 所致 | **根因主嫌** [V] |
| C | 落档 → 视频工作站胶片条缩略图 | `VideoStudioView.tsx:1788-1814` → `CaptureFilmstrip.tsx:109-117` `img src=media://local` 原始文件;CSS `app.css:6095-6101` `.video-filmstrip-thumb { height:64px; max-width:160px; object-fit:cover }` | CSS 下采样(浏览器高质量缩放),无 JS 重采样 [V] | `cover` 等比但**裁边**(极端宽高比图只露中间)[V] | 下采样不糊 | 无失真;裁边为 P3 观感项 |
| D | **胶片条编辑 → VideoStudioView 标注(舞台内)** | `VideoStudioView.tsx:1799-1807`(`capturesRead` → dataURL)→ `:1872-1888` `<AnnotateOverlay>` 覆盖 `.video-stage` | 同 B:同一 `containRect`,舞台小于全屏但通常仍远大于裁剪图,k 依旧 >1 | 保持 | 同 B | **同根因第二入口** [V] |
| E | 导出(✓保存/复制/下载/OCR) | `AnnotateOverlay.tsx:547-560` `exportDataUrl`(natural 尺寸 canvas);`:631-635` `exportRegionDataUrl`;`SnipView.tsx:120-130` finish→`snipManager.ts:310-321`(剪贴板+`addPng('annotated')`) | 恒自然尺寸,只搬运像素(无水印铁律 R75.2)[V] | — | — | 无问题 |
| F | 旁支:播放器/直播框选冻结帧 | `VideoStudioView.tsx:1404-1416`、`:1719-1731` `.video-snip-freeze` canvas 定位在 `contentRect`(视频 contain 矩形),backing=视频原生像素 | 跟随视频预览 contain(小视频放大属播放器预期语义);裁剪坐标经 `contentToNative` 映射 [V] | 保持 [V] | — | 不在主诉链路,不动 |

链路外的显示消费方核查:`media://local` 使用方共 7 处(grep 全量 [V]),其中显示截图的仅 CaptureFilmstrip(C);AudioStudioView/AiLabAi8Tab 为音视频/绘十缩略图,与截图失真无关。

---

## 2. 失真根因(置信度 0.92)

### 2.1 硬证据 — 用户 12 张真实截图的原生分辨率

读取 `%APPDATA%\rgbbox\captures\` 全部 PNG 的 IHDR 头(纯字节解析,未运行任何应用)[V],对照 index.json 共 12 条,尺寸如下:

| 文件(captures/ 目录) | 原生像素 | 在 1920×1080 全屏标注器的初始放大倍数 k [I] | 在 2560×1440 下 [I] |
|---|---|---|---|
| cap-annotated-mv4166ml-m5dk.png | 363×277 | **3.90×** | 5.21× |
| cap-annotated-muwk5ypi-rn5r.png | 483×165 | 3.97× | 5.29× |
| cap-annotated-muwob9cv-dkng.png | 529×244 | 3.63× | 4.83× |
| cap-annotated-mv40eksd-syy2.png | 1086×709 | 1.52× | 2.03× |
| cap-annotated-muwmq6k8-f7w4.png | 1088×716 | 1.51× | 2.01× |
| cap-annotated-muwmt94w-qmbg.png | 1091×709 | 1.52× | 2.03× |
| cap-annotated-mv41w7a2-gfwk.png | 1080×707 | 1.53× | 2.04× |
| cap-annotated-muwue4fq-bx45.png | 1197×446 | 1.60× | 2.14× |
| cap-annotated-muzqx9t2-vvno.png | 1288×826 | 1.31× | 1.75× |
| cap-annotated-muzsg387-g8pf.png | 1285×819 | 1.32× | 1.76× |
| cap-photo-muwevgcs-hqqk.png | 1280×720 | 1.50× | 2.00× |
| cap-photo-muwevt2n-8ai9.png | 1280×720 | 1.50× | 2.00× |

**12/12 全部 k>1**——即用户每一张截图进入标注器都会被上采样显示,最小 1.31×、最大 5×+。放大倍数 = `min(cw/nw, ch/nh)`,由 `previewTransform.ts:27-36` 计算(k 无 `Math.min(…, 1)` 截断)[V]。用户为 2-3 屏多显示器环境(日志 `rgbbox.log` 多次出现 "2 display(s)"/"3 display(s) frozen" [V]),具体分辨率未入日志,故表中按两种常见屏参数化。

### 2.2 代码因果链 [V]

1. `SnipView.tsx:105-117` `confirmSel` → `cropToDataUrl(frame, sel)`(`frameCapture.ts:35-51`):裁剪输出=选区物理像素,尺寸忠实(无失真引入)。
2. `AnnotateOverlay.tsx:77-90`:`natural = { naturalWidth, naturalHeight }` 正确取到小图原生尺寸。
3. `AnnotateOverlay.tsx:134-137`:`fit = containRect(wrapSize, natural)` → **放大起点**。
4. `:138-150`:`view = fit×z(z 初始 1)`、`k = view.w/natural.w`。
5. `:192-212` 渲染:canvas backing = `wrapSize×dpr`(DPR 正确),`setTransform(dpr*k,…)` 后 `drawImage(base,0,0)` —— 363px 宽的位图被画到 ~1400-1900 物理像素宽,双线性插值 → 边缘发虚、文字糊。
6. 主进程落档 `snipManager.ts:315` `addPng('annotated')` 原字节存储(`captureStore.ts:104-114`),**存储端无损**——失真纯发生在显示层。这也解释了用户措辞「显示放大失真」:文件本身是清晰的,一显示就糊。

### 2.3 判定矩阵

| 假说 | 判定 | 依据 |
|---|---|---|
| a) 低分辨率截图被拉伸到容器宽度(模糊) | **成立(主因)** | §2.1 全部 12 张 k>1 + §2.2 代码链 [V] |
| b) canvas 固定尺寸 drawImage 拉伸 | 排除 | canvas 尺寸随容器动态、DPR 感知(AnnotateOverlay.tsx:195-200)[V] |
| c) DPR 不匹配 | 排除(主因) | backing 已乘 dpr;缩略图为下采样 [V] |
| d) 纵横比变形 | 排除 | contain 等比;用户感知的「失真」=上采样发虚 [V] |

**置信度 0.92**(扣分项:未真机复现——按约束不启动应用;残余 0.08 留给「用户另指冻结帧轻微变软」的可能,但该路径 A 无变形且通常不是「放大」语义)。

---

## 3. 修复设计 —「按截图分辨率自适应」

### 3.1 规范(五条)

1. **初始视图**:`k_init = min(1, containK)`。图大于容器 → contain 等比缩小居中(现状保留);图任一维 ≤ 容器对应维(**且整体放得下**)→ 按原生 CSS 尺寸 1:1 居中,**绝不放大**。这正是用户说的「按照截图的分辨率大小自适应显示大小」。
2. **缩放只发生在视图层**:canvas transform / CSS 层;导出(`exportDataUrl`)恒自然尺寸(现状已满足,不动)。缩放过程中不产生任何落盘的二次重采样。
3. **主动缩放不受限**:滚轮缩放保留(绝对比例 clamp 10%–800%,`previewTransform.ts:18-24`),用户想看细节仍可放大;双击空白复位(`AnnotateOverlay.tsx:684-685` `setZoomState(null)`)——修复后复位语义自动变为「回到 1:1 初始」,零额外代码。
4. **缩略图用 CSS 缩小**(下采样不糊),不引入 JS 上采样——现状已满足,不动。
5. **坐标系恒图像原生像素**:Shape/OCR/命中全部存图像坐标(现状已满足,不动)——保证任意显示比例下标注精确、导出无偏差。

### 3.2 逐组件代码草案

**(1) 核心修复 — `src/renderer/src/components/video/previewTransform.ts` 新增纯函数(与 containRect 并列,不改后者)**

> ⚠️ 共享 `containRect` **不能**加 min(…,1) 截断:视频预览(`usePreviewZoom.ts:67`)与播放器冻结帧(Path F)依赖「小视频放大填满舞台」的语义,那是有意的。新函数仅供标注器初始视图使用。

```ts
/** R-xxx: contain-fit 但上限 1:1 —— 大图等比缩小,小图(整体放得下)保持
 *  原生尺寸居中,初始视图绝不放大(截图标注器专用;视频预览仍用 containRect)。 */
export function containRectNat(container: Size, native: Size): Rect {
  const cw = Math.max(1, container.w)
  const ch = Math.max(1, container.h)
  const nw = Math.max(1, native.w)
  const nh = Math.max(1, native.h)
  const k = Math.min(1, cw / nw, ch / nh)   // ← 唯一实质差异:min 里多一个 1
  const w = nw * k
  const h = nh * k
  return { x: (cw - w) / 2, y: (ch - h) / 2, w, h }
}
```

单测草案(`tests/renderer/…` 现有 previewTransform 测试旁追加):
- 小图(363×277 in 1920×1080)→ rect={777.5, 401.5, 363, 277}(1:1 居中,k=1)
- 大图(2560×1440 in 1920×1080)→ 与 containRect 结果一致(k=0.75)
- 临界(native==container)→ k=1,偏移 0

**(2) 接线 — `AnnotateOverlay.tsx:134-137` 一处替换**

```ts
// 现:
const fit: Rect = useMemo(
  () => (natural.w > 0 && wrapSize.w > 0 ? containRect(wrapSize, natural) : { x: 0, y: 0, w: 0, h: 0 }),
  [natural, wrapSize],
)
// 改为:
const fit: Rect = useMemo(
  () => (natural.w > 0 && wrapSize.w > 0 ? containRectNat(wrapSize, natural) : { x: 0, y: 0, w: 0, h: 0 }),
  [natural, wrapSize],
)
```
(import 行 `:22` 增补 `containRectNat`。)

**(3) 为什么只改这一处就够(影响面论证)** [V]

`fit` 是该组件视图的唯一源:`view`(=fit×z+pan)、`k`、`toImage`/`screenPt` 坐标映射、`strokeWidthImage`、手柄/边框命中、OCR 框选遮罩、马赛克底砖、文字字号换算全部由 `fit`/`k` 派生,且 Shape 数据一律存图像坐标——对初始比例完全无感。导出走独立的自然尺寸 canvas(`:547-560`),与本改动正交。滚轮缩放的绝对 clamp(0.1–8)以 `fitK` 换算(`:174-176`),小图初始 k=1 时用户仍可放大到 800%/缩小到 10%,语义不变。

**(4) 可选 P1 — 缩放百分比指示(让「不糊」可被用户确认)**

`AnnotateOverlay.tsx:913` 提示行附带当前比例:

```tsx
<p className="video-annotate-hint">{t('video.annotate.hint')} · {Math.round(k * 100)}%</p>
```

修复后小图进入即显示「100%」,与「原生尺寸」直觉对齐;放大后百分比随动,系统状态可见性(Nielsen #1)。

**(5) 可选 P3 — `CaptureFilmstrip` 缩略图微调**

现状 CSS 下采样无失真,仅 `object-fit: cover`(`app.css:6099`)裁边:1197×446 这类宽条图缩略图只露中间一段。如需完整预览,改 `.video-filmstrip-thumb { height:64px; width:auto; max-width:160px; object-fit:contain; }`(容器背景已是 `--surface-deep`,letterbox 不突兀)。`STEP_PX=176`(`CaptureFilmstrip.tsx:16`)仍兼容。观感项,非失真修复必改。

**(6) 明确不改**

- `SnipView.tsx` 冻结帧与拖选(Path A):无变形,坐标闭环正确,不动。
- `containRect` 本体、`usePreviewZoom`、`.video-snip-freeze`(Path F):视频语义,不动。
- 导出/剪贴板/落档链路(Path E):已是无损,不动。

> 流程提示:按 CLAUDE.md,实施(1)(2)前须在 PRD-0002 追加 R-N 条款(章节:截图/标注链路),本报告即为依据。

---

## 4. 顺带体检(Nielsen 快查)

| 项 | 发现 | 位置 | 严重度 |
|---|---|---|---|
| 空态/可发现性 | `items.length===0` 时胶片条**整体返回 null**,头部(「截图预览 (N)」)与「+ 导入」按钮一并消失——空态用户不知道该功能存在,也没有导入入口 | `CaptureFilmstrip.tsx:62` [V] | P2 |
| 加载失败 | 缩略图 `<img>` 无 `onError`:文件被外部删除后缩略图空白无声;但编辑入口有兜底(`onEdit` 失败 → `editorToast('video.filmstrip.missing')`) | `CaptureFilmstrip.tsx:109-117` 缺 onError;`VideoStudioView.tsx:1799-1807` 有反馈 [V] | P3 |
| 长列表性能 | `loading="lazy"` 有;但缩略图加载**原始分辨率** PNG 并全尺寸解码。上限 `MAX_CAPTURES=200`(captureStore.ts:26),200 张 1280×720 照片 ≈ 740MB 解码内存 [I];12→100 条可感变慢。P2 方案:落档时另存 ≤320px 缩略图或 media:// 加 `?thumb=` 参数 | `CaptureFilmstrip.tsx:111`、`captureStore.ts:26` [V]/[I] | P2 |
| 键盘操作 | 标注器键盘完备(ESC/Delete/Ctrl+Z/Y/C/V,`AnnotateOverlay.tsx:496-544`);胶片条缩略图不可聚焦、无 ←/→ 项导航,编辑仅 dblclick+悬停按钮(悬停按钮可 Tab 到,但缩略图本体不可) | `CaptureFilmstrip.tsx:107-135` [V] | P3 |
| 导出/复制入口 | 标注器内 ✓保存/复制齐全;但胶片条单项**无**「复制到剪贴板/另存为」直达入口——导出一张已存截图必须先进标注器绕一圈(且会新增一条 annotated 记录,`VideoStudioView.tsx:1878`,产生副本膨胀) | `VideoStudioView.tsx:1872-1888` [V] | P2 |
| 危险操作 | 单项删除无确认无撤销(clear-all 有 count 确认,`VideoStudioView.tsx:1792-1797`);`window.confirm` 原生弹窗与 app 内 toast 风格不一 | `VideoStudioView.tsx:1808-1810` [V] | P3 |
| 状态可见 | 选区尺寸标签实时显示物理像素(`SnipView.tsx:185-192`)、OCR 行数/引擎标签齐——良好 | [V] | — |

---

## 5. 验收标准

1. **真机前后对比(主验收)**:取 `%APPDATA%\rgbbox\captures\cap-annotated-mv4166ml-m5dk.png`(363×277,最小那张,放大最狠)。修复前/后分别在标注器打开它并整屏截图,并排对比:修复后初始显示宽 363 CSS px 居中,文字/边缘锐利无糊;修复前为整屏放大约 3.9×(1080p)发虚。两图同屏并排即「不再糊」的用户可感证据。
2. **大图回归**:1280×720 照片在小于它的舞台内仍 contain 等比缩小、无溢出无滚动条;2560×1440 截图同理。
3. **比例断言**:进入标注器即显示「100%」(若采纳 3.2-(4));滚轮放大至 800%、缩小至 10% 均可达;双击空白回到 100%/contain 初始。
4. **导出无损回归**:1:1 视图与放大 400% 视图下各画一个箭头+文字,分别 ✓保存,两次导出 PNG 尺寸均=原生 363×277,标注落点一致(坐标系不受初始比例影响的回归证据)。
5. **多屏/DPR**:在 100% 与 125%(或 150%)缩放屏各跑一次 Alt+A 全流程(拖选→标注→保存),冻结帧与标注器均无纵横比变形。
6. **单测**:`containRectNat` 三例(小图 1:1 居中 / 大图=containRect / 临界等尺寸)通过;现有 AnnotateOverlay/previewTransform 测试全绿(`yarn test tests/` 对应文件)。

---

## 6. 已验证无问题(本次排查排除项)

| 项 | 位置 | 结论 |
|---|---|---|
| 冻结帧全屏显示纵横比 | `snipManager.ts:136-137`(窗口=display bounds)+ `app.css:7301` | 窗口与显示器同比例,等比缩放,无变形 [V] |
| AnnotateOverlay canvas DPR | `AnnotateOverlay.tsx:195-205` | backing=wrapSize×dpr,变换含 dpr,Hi-DPI 正确 [V] |
| 裁剪坐标闭环 | `SnipView.tsx:99-103,105-117` + `frameCapture.ts:35-51` | CSS px→物理 px 换算与裁剪均为物理像素 1:1,无损 [V] |
| 导出/落档/剪贴板 | `AnnotateOverlay.tsx:547-560`、`snipManager.ts:310-321`、`captureStore.ts:104-114` | 恒自然尺寸、原字节存储,无二次重采样、无水印 [V] |
| 缩略图 MIME | `mediaProtocol.ts:16-27`(png/jpg/webp/bmp/avif 全表) | media://local 正确按扩展名给 image/* [V] |
| 缩略图缩放方式 | `app.css:6095-6101` + `CaptureFilmstrip.tsx:109-117` | CSS 下采样 + lazy,无 JS 上采样,不糊 [V] |
| 播放器框选冻结帧 | `VideoStudioView.tsx:1404-1416,1719-1731` | canvas 铺 contentRect(视频 contain 矩形),纵横比保持 [V] |
| captureStore 持久化 | `captureStore.ts:47-54,85-97` | FIFO+去重+索引相对路径+幽灵条目修复,健壮 [V] |
| 索引完整性 | `%APPDATA%\rgbbox\captures\index.json` | 12 条目字段齐全,与 12 个文件一一对应 [V] |

---

*审查方法:静态走查 6 条显示路径 + 全量 grep 消费方 + 解析 12 张真实 PNG 的 IHDR 头取原生分辨率(未运行应用、未写入用户数据目录)。*
