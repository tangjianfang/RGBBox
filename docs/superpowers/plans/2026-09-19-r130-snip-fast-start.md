# R130 实施计划：全局截图秒开 + 快门白闪 ×2

> 设计文档：`docs/superpowers/specs/2026-09-19-r130-snip-fast-start-design.md`（PRD R130）
> 分 6 步，每步可独立验证；TDD：先改测试再改实现（步骤 4/5）。

## 步骤

1. **构建入口**：`electron.vite.config.ts` renderer input 加 `snip: src/renderer/snip.html`；新建 `src/renderer/snip.html`（script `/src/snipMain.tsx`）+ `src/renderer/src/snipMain.tsx`（I18nProvider + SnipView，含 styles.css import 与 overflow 处理）。验证：`yarn build` 产出 `out/renderer/snip.html` + 独立小 bundle。
2. **IPC/preload**：`ipc.ts` 删 `snipGetFrame`、加 `snipPushFrame` / `snipFramePainted`；preload 删 `snipGetFrame`、加 `snipOnFrame(cb)→unsub` + `snipAckPainted()`；`main/index.ts` 删旧 handler、加 `ipcMain.on(snipFramePainted)`；`tests/renderer/_helpers.tsx` 同步 mock。验证：typecheck。
3. **snipManager 池 + 推送**：`createSnipWindow(displayId)` 统一构造（pooled 会话共用）；`snipPool` + `rebuildSnipPool()`（纯函数 `planPoolRebuild` 供单测）+ `warmSnipStack()`（3s 延迟，含 desktopCapturer 预热）；`startSnipInner` 改：取窗（池/即时）→ `did-finish-load` 后推 BGRA → `Promise.race(ack, 300ms)` → `presentWindow`；`cancelSnip` 后台重建池；display 变化重建池 + 重预热；分段耗时日志。验证：单测 + typecheck。
4. **SnipView 推送模式**：删 snipGetFrame 拉取，改 `snipOnFrame` 订阅；新增 `swapBgraToRgba`（导出纯函数）；绘制后 `snipAckPainted()`；更新 SnipView.test.tsx（推送触发 + swap 像素断言）。
5. **白闪**：`SnipView` 挂 `.snip-flash`（首次 select、animationend 移除）；`styles.css` keyframes + reduced-motion；测试断言。
6. **验证**：`yarn typecheck` + 全量 `yarn test`；`yarn dist:dir`；真机脚本（SendKeys 触发全局热键 + 日志耗时取证 + CDP 截图闪烁）；PRD R130 → ✅。

## 回退

- 任一步失败可独立回退；整体回退 = revert 提交（无数据迁移、无持久化格式变更）。
- 池内存超标 → 保留 130.1–130.3/130.5，禁用 130.4（`rebuildSnipPool` 调用点加开关）。
