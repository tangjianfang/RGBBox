# R80 独立全局截图工具 — 设计文档

- 日期：2026-09-12
- PRD 条款：`PRD-0002` §R80（立项已批准，本文档为 brainstorm 细化结果）
- 风险等级：L2（新窗口类型 + globalShortcut + 托盘菜单 + 3 条新 IPC + 用户可见新功能）
- 状态：设计经用户批准（2026-09-12）

## 1. 目标与非目标

**目标**：把截图做成独立于视频工作台的系统级工具——托盘/全局热键触发，所有显示器冻结成画面，框选后**就地**进入完整标注器（复用 AnnotateOverlay 全家桶），产出自动进「最近拍摄」。

**非目标（YAGNI，后续可扩）**：贴图（钉屏幕）、跨屏拼接选区、滚动截长图、热键自定义设置页、截图历史独立 UI。

## 2. 已确认的交互决策（用户 2026-09-12 选定）

| 决策点 | 选定 |
|---|---|
| 触发 | 托盘右键菜单「截图」+ 全局热键 **Alt+A** |
| 显示器 | **所有显示器一起冻结**，在哪屏拖选就截哪屏 |
| 保存 | 复制 = 剪贴板 + 存最近拍摄；✓ = 下载 PNG + 存最近拍摄（与工作台一致） |
| 悬浮工具 | 选区确认后，标注工具条悬浮在选区下方（微信式 = AnnotateOverlay 现有形态，无需新组件） |

## 3. 架构（选定方案 A：冻结帧 + 独立全屏窗口）

备选方案 B（主窗口内截图，无法覆盖多屏）与 C（调系统 Win+Shift+S，Electron 无可控 API）已否决。

### 3.1 主进程 — `src/main/snipManager.ts`（新文件，照 `screensaverManager.ts` 模式）

- `startSnip()`：
  1. **先截后开窗**：`desktopCapturer.getSources({ types: ['screen'] })`，按 `source.display_id` 匹配 `screen.getAllDisplays()`，`thumbnailSize` 取各屏**物理像素**（`bounds × scaleFactor`）得到冻结帧 dataURL；
  2. 每屏开窗口：`frameless`、`setBounds(display.bounds)`、`alwaysOnTop('screen-saver')`、`skipTaskbar`、`resizable:false`、`ready-to-show` 后 show，query `?snip=1&displayId=X`（R74 模式）；
  3. 会话状态互斥：已在截图会话中时重复触发忽略。
- `finishSnip(dataUrl, action)`：`copy` → `clipboard.writeImage` + `capturesAdd('annotated')`（不下载）；`save` → `capturesAdd('annotated')`（不写剪贴板），PNG 下载由渲染端 `<a download>` 完成（工作台 `downloadPng` 同法）。
- `cancelSnip()`：销毁全部会话窗口。
- 热键：`app ready` 注册 `Alt+A` → `startSnip()`；注册失败（被占用）→ 托盘气泡提示"热键被占用，托盘入口仍可用"，托盘入口兜底；`will-quit` 注销。
- 生命周期：任一窗口 `closed`/ESC/右键 → 整个会话全部销毁；显示器增删/分辨率变化（`screen` 事件）→ 会话自动取消（防坐标错位）。

### 3.2 主进程接线 — `src/main/index.ts`（仅增不改）

托盘 context menu 加「截图」项（调 `startSnip`）；`whenReady` 里注册热键与 IPC；`will-quit` 注销热键。不动 index.ts 其它逻辑。

### 3.3 IPC + preload（3 条新通道）

| 通道 | 方向 | 载荷 |
|---|---|---|
| `rgbbox:snip:get-frame` | render→main | `displayId` → `{ dataUrl }`（本屏冻结帧） |
| `rgbbox:snip:finish` | render→main | `{ dataUrl, action: 'copy' \| 'save' }` → `{ ok }` |
| `rgbbox:snip:cancel` | render→main | 无 → 关闭整个会话 |

`src/shared/ipc.ts` 加常量；preload `window.rgbbox` 加 `snipGetFrame/snipFinish/snipCancel`。

### 3.4 渲染端 — `SnipView.tsx`（新组件）

- `main.tsx` 加 `?snip=1` 路由（包 I18nProvider，R70.9 教训）。
- 流程：拉本屏冻结帧 → 全屏 canvas 绘制（物理像素 ↔ CSS 尺寸按 scaleFactor 映射，沿用 `previewTransform` 数学）→ 暗幕拖选（交互同 OCR 框选：暗幕挖洞 + W×H 尺寸角标 + "拖选区域 · ESC 取消"提示）→ 松手（≥8px 有效，<8px 视为取消选择回到拖选态）→ `cropToDataUrl` 裁剪选区 → **就地渲染 `AnnotateOverlay`**（source = 裁剪 canvas，标注/OCR/智能手势零改动复用，工具条天然悬浮在选区下方）。
- `onSave` → `snipFinish(url, 'save')` + `<a download>`；`onCopy` → `snipFinish(url, 'copy')`；两者结束后 `snipCancel()`。
- 选区约束：**单屏内**；拖动跨屏时钳制在起始屏（跨屏截图 = 在目标屏重新触发）。
- ESC 分层沿用现约定：标注中 → 收文字输入/关标注器回拖选；拖选中 → `snipCancel` 退出整个会话。右键 = 退出。

## 4. 数据流（时序）

```
Alt+A / 托盘「截图」
 → snipManager.startSnip()
 → desktopCapturer 捕获所有屏冻结帧（物理像素，先截后开窗）
 → 每屏 frameless 全屏置顶窗口 + SnipView 显示冻结帧
 → 拖选（暗幕挖洞 + 尺寸角标）
 → 松手 ≥8px → 裁剪选区 → AnnotateOverlay 就地标注
 → ✓ 下载 PNG + 存最近拍摄(kind=annotated) ／ 复制 → 剪贴板 + 存最近拍摄
 → snipCancel() 销毁全部窗口，热键/托盘继续待命
```

## 5. 边界与错误处理

- **secure desktop**（锁屏/UAC 弹窗）截不到 → 可能黑帧：窗口照常开，ESC 可退（系统限制，已知边界）。
- **热键冲突**（Alt+A 与微信等）：注册失败 → 气泡提示 + 托盘兜底；退出时注销。
- **捕获延迟**（4K 约 100-300ms）：触发到冻结有短暂延迟，与微信一致，可接受。
- **显示器热插拔/分辨率变化**：会话自动取消。
- **desktopCapturer 失败/空帧**：气泡提示"截图失败"，不开窗。
- **重复触发**：会话互斥，忽略。

## 6. 测试策略

- `snipManager` 纯函数单测（node）：display↔source 匹配、物理像素尺寸计算、`action` 路由（copy/save → clipboard/captures 调用与 kind）、显示器变更取消判定。
- `SnipView` 组件测试（happy-dom）：拉帧渲染 → 拖选 → AnnotateOverlay 挂载；<8px 选区回拖选态；ESC 逐层退出；✓/复制调 IPC 后 cancel。
- 真机手动验收清单：多屏冻结、DPI 150% 选区像素准确、Alt+A 冲突降级提示、黑帧行为、托盘入口、最近拍摄入库。

## 7. 受影响文件

新增：`src/main/snipManager.ts`、`src/renderer/src/components/SnipView.tsx`、`tests/main/snipManager.test.ts`、`tests/renderer/components/SnipView.test.tsx`、设计文档（本文）。
修改：`src/shared/ipc.ts`、`src/main/index.ts`（托盘菜单 + 热键 + IPC 接线）、`src/preload/index.ts`、`src/renderer/src/main.tsx`（路由）、`src/renderer/src/i18n/index.tsx`（snip.* 文案）、`src/renderer/src/styles.css`、`tests/renderer/_helpers.tsx`（rgbbox mock）、`tests/renderer/setup.ts`（图标 mock 如需）、`docs/prd/PRD-0002-rgbbox-project-catalog.md`（R80 细化条款 + 验收）。
