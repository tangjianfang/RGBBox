# R130 设计：全局截图秒开（<500ms）+ 快门白闪 ×2

> 2026-09-19 用户需求：「按快捷键启动截图起码要 3 秒，希望 500ms 以内；启动截图时要有明显的闪烁两下效果。」
> 经 brainstorm 确认：验收口径 = **按下快捷键 → 冻结画面全屏出现 ≤500ms**；闪烁形态 = **白色快门闪 ×2**（透明度 0→35%→0，每次脉冲 ~90ms，总时长 ~400ms，pointer-events:none 不阻挡拖选）。
> 方案选型：**A+B 一步到位**（轻量入口 + 捕获栈预热 + 位图直传 + 常驻预热窗口池）。

## 1. 问题定位（3 秒的构成）

截图窗口复用主窗口 `index.html`，每次按热键都要解析执行 **4.4MB JS**（index 主 bundle 2.7MB + three/splat vendor 1.7MB，虽然实际只渲染 SnipView）+ 181KB CSS。链路全串行：

| 阶段 | 耗时估计 |
| --- | --- |
| ① `desktopCapturer.getSources`（首次调用初始化 WGC/DXGI 图形捕获栈） | 150–700ms |
| ② 创建窗口 + loadFile + **解析/执行 4.4MB JS** + React 首渲染 | ~1000–2000ms（最大头） |
| ③ `getSnipFrame` 懒 PNG 编码（全物理分辨率） | 200–600ms |
| ④ IPC base64 传输 → Image PNG 解码 → canvas 绘制 | 100–200ms |

## 2. 方案（三管齐下 + 预热窗口池）

### 2.1 轻量独立入口 `snip.html`（杀 ②）

- 新增 `src/renderer/snip.html` + `src/renderer/src/snipMain.tsx`：只装 I18nProvider + SnipView（依赖已审计：react + lucide 图标 + i18n + 4 个本地模块），bundle 预计 ~250KB（≈1/18）。
- `electron.vite.config.ts` renderer `rollupOptions.input` 加第二入口；snipManager 默认 load `snip.html`（dev 走 `${devUrl}/snip.html?...`）。
- `main.tsx` 旧 `isSnip` 分支保留作回退（不删除，零风险）。
- 不动 `package.json` scripts ✓；electron-builder `files: out/**/*` 自动覆盖新产物 ✓。

### 2.2 捕获栈预热（杀 ① 的首帧初始化）

- app 就绪 + 空闲 3s：`getSources({types:['screen'], thumbnailSize:{width:1,height:1}})` 触发图形捕获栈初始化（结果丢弃）；失败静默（热键路径含 R112.3 三重试保护，照旧可用）。
- 显示器拓扑变化后重新预热。预热与会话互斥（复用 snipStarting 闸门语义，防并发 stall）。

### 2.3 原始位图直传（杀 ③④）

- 冻结帧改 `nativeImage.getBitmap()`（BGRA Buffer）经 IPC structured clone 直传（二进制零膨胀、无 PNG 编码/解码、无 base64 +33%）。
- 渲染端 R/B 字节交换（4K ≈33MB，JS 循环 ~20-40ms）→ `ImageData` → `putImageData` 到物理像素 canvas。
- AnnotateOverlay 源不变：进入标注相位时 `cropToDataUrl(frame, sel)` 本就基于 canvas 现裁（已核实初始全帧 dataUrl 无消费方）。
- 通道重排：删 `snip:get-frame` invoke；新增 `snip:push-frame`（main→renderer send）+ `snip:frame-painted`（renderer→main ack）。

### 2.4 常驻预热窗口池（确定 <500ms）

- app 就绪 +3s 为每屏创建**隐藏**预载窗口（show:false、skipTaskbar、加载 snip.html 完毕待命）。
- 热键触发：捕获完成 → 池中取窗口（0ms）→ 推位图 → **等渲染端绘制 ack（300ms 超时兜底）→ show**。保证「窗口出现 = 冻结画面就绪」，验收口径干净。
- 会话结束（finish/cancel）：窗口销毁 + **后台重建回池**（不做隐藏复用，杜绝 AnnotateOverlay 状态残留）。
- 池失效路径全覆盖：窗口崩溃（render-process-gone）剔除出池；显示器增删/分辨率变化销毁重建；启动 3s 内按热键 / 池未命中 → 走即时创建路径（2.1 已保证该路径 ~500ms 量级）。

## 3. 闪烁效果（白闪 ×2）

- SnipView 首次进入 select 相位（帧绘制完成）时挂载 `<div class="snip-flash">`：
  - CSS keyframes `snip-flash`：0%→11% 透明度 0→0.35 →22% 回 0（第一次脉冲 ~90ms）→ 45% 静默 → 56% 0.35 → 67% 0（第二次脉冲）→ 100% 0，总 400ms；
  - `pointer-events:none`、白色 `#fff`、置于 mask 之上；`onAnimationEnd` 自移除节点；
  - 仅会话首次进入 select 播放（从标注器返回不重播）；
  - `@media (prefers-reduced-motion: reduce)` 不播放动画（R16 可达性对齐）。
- 闪烁发生在捕获之后，不可能污染冻结帧内容。

## 4. 热路径时序（A+B 生效后）

```text
Alt+A ─► startSnip ─► getSources（预热栈 ~100-200ms）
                        │ 冻结帧留在主进程内存
                        ▼
        每屏取窗口：池命中 → 0ms；未命中 → 即时创建（~200ms 兜底）
                        │ IPC 推送 BGRA 位图
                        ▼
        渲染端 swap + putImageData（~30-60ms）─ack─► show + 置顶 + 抢焦点
                        │
                        ▼
        白闪 ×2（400ms，不阻挡交互）─► 用户拖选
```

预估总耗时：池命中 150–350ms；兜底路径 300–500ms。

## 5. 错误处理

| 故障 | 行为 |
| --- | --- |
| 池窗口崩溃 / 池未建好（启动 3s 内按热键） | 走即时创建路径 |
| ack 超时 300ms | 直接 show，帧稍后补绘，不卡死（Esc 兜底仍在） |
| 预热失败（desktopCapturer stall） | 静默，热键路径照旧（3s 超时 ×3 重试） |
| 显示器热插拔 | 现有 onDisplayChanged 取消会话 + 池重建 + 重新预热 |
| secure desktop 黑帧 | 现有行为不变（ESC 可退） |
| R112.3 防重入闸门 / 全局 Esc / 孤儿窗口清扫 | 全部保留 |

## 6. 测试

- 单测：BGRA→RGBA 交换像素级断言；推送模式 SnipView（mock `snipOnFrame`）；闪烁节点挂载/animationend 自移除/reduced-motion；池重建纯函数决策；IPC 通道常量。
- 真机验收（`yarn dist:dir`）：①日志分段耗时 hotkey→shown ≤500ms 连续 5 次取最大；②闪烁两下真机截图视觉复核；③二次会话同样达标、任务管理器无窗口泄漏；④池内存实测（>100MB/窗则加开关回退 A）。

## 7. PRD

追加 **R130** 至 PRD-0002（R129 之后），状态 ⏳ → 完成后 ✅ 附证据。
