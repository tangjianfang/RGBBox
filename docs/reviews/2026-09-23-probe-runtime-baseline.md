# R158.1 运行时探针基线报告——冷启动 / hang / fps / 负载 / heap / 交互

**日期**:2026-09-23　**工具**:`scripts/probe-runtime.mjs`（`yarn probe` quick / `yarn probe:full` 全量）　**性质**:R158.1 探针资产化首轮基线采集
**苹果参考线**（记录用，不作门禁）:首帧 ≤400ms（WWDC2019，原生应用口径）/ hang >250ms（MetricKit）/ 动画 60fps

---

## 1. 完整冷启动（spawn → CDP → 首帧 → 可交互）——项目首次实测

R155 的「365ms」是页内 reload proxy；本节是 electron spawn 起算的完整冷启动，两轮环境：

| 轮次 | 环境 | cdp-up（main 就绪） | first-paint（渲染首帧） | rail 可交互 |
|---|---|---|---|---|
| quick 轮（系统空闲）×5 | 后台无编译任务 | 598-771ms（p50 ~658） | 948-1254ms（p50 ~1084） | 1108-1405ms（p50 ~1204） |
| full 轮（系统并发编译）×5 | typecheck/build 并行占用 | 1303-4622ms | 2228-4246ms | 2494-5168ms |

**结论**：
- 空闲环境完整冷启动 p50 ≈ **1.1s（首帧）/ 1.2s（可交互）**——未达苹果 400ms 原生参考线，但该锚点针对原生 iOS/macOS 应用；Electron 含 Chromium spawn，此数字即 RGBBox 基线（先测量后定阈，R158.1 口径）。
- **冷启动对系统负载敏感 3 倍**（1.1s → 3.3s+）——后续任何冷启动门禁必须在受控环境跑，且阈值取空闲基线 + 余量。

## 2. hang（>250ms 长任务，MetricKit 口径）

两轮导航全程（9 view 遍历 + 30min 常驻 + 45 次切 tab）**hang 计数 = 0**。✅

## 3. UI 动画 fps（9 view 各 2s rAF 采样）

| view | fps | 判读 |
|---|---|---|
| dashboard / video / audio / games / diagnostics / ai | 64-65 | ≥60 达标 |
| workspace | 64 | 达标 |
| effects | 20-21 | **内容层 canvas**：效果卡预览动画（55 卡各自 rAF），非 UI chrome |
| architecture | 26-27 | **内容层 canvas**：Three.js demo 场景，非 UI chrome |

7/9 view UI 层 60fps 达标；effects/architecture 为内容动画帧率（苹果 60fps 锚点管 UI 动画），作为后续优化线索入档，不计为 UI 层违例。

## 4. 引擎负载 p95（S4 采样①）

点击效果卡开负载 30s 后诊断页读数：**p95 23.6ms / avg 8.2ms**（30fps 预算 = 33.3ms）——S4 验收线（p95 ≤33ms）通过。frame-age 显示「空闲——无消费方（不在工作台且无浮窗）」，即该数字为 preview 通道引擎 tick 回路时延。

## 5. 30min heap 曲线（S4 采样②）

20.7MB → 20.7MB（每 30s 一点 ×60 点，全程恒定）——**增长 0%**，S4 验收线（<10%）大幅通过。零泄漏信号（空闲挂机态；负载态泄漏面建议后续按 vision/audio 场景补一轮）。

## 6. 交互脉冲（S4 采样③）

45 次 tab 切换 + 8 次滑杆键盘脉冲：**新增 console 告警 0、pageerror 0**。全程唯一 console 告警为 Electron 调试态 CSP 提示（`--remote-debugging-port` 固有，非产品缺陷）。

---

## 7. R157.8 三段结构的分数影响（对照）

| 苹果锚点 | 基线前（v2 按未测保守计） | 本报告后 |
|---|---|---|
| 完整冷启动 | 未测（维度 1 扣分主因） | ✅ 空闲 p50 1.1s 实测入档 |
| hang >250ms | 未测 | ✅ 0（导航+常驻+交互全程） |
| 60fps | 未测 | ✅ 7/9 view 达标 + 2 个内容层 canvas 记录在案 |
| 30min 内存平稳 | 未测（维度 2 扣分主因） | ✅ 0% 增长 |
| 负载 p95 | 未测 | ✅ 23.6ms < 33ms |

原始 JSON:`probe-runtime-latest.json`（full 轮，git 跟踪）。

*关联：R157.8 重评分 [`2026-09-23-apple-standard-rescoring.md`](./2026-09-23-apple-standard-rescoring.md) · R156 S4 [`2026-09-23-test-scoring-deep-review.md`](./2026-09-23-test-scoring-deep-review.md) §7*
