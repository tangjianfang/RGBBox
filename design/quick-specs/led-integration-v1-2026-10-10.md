# LED 联动 v1 — 2026-10-10

**分类**: Addition（新机制）
**游戏**: 全部（通过共享事件总线）
**动机**: 支柱 1——游戏是 RGB 灯效生态的游戏化延伸，当前 LED 零联动=产品价值环断裂

**改动**:
- 新建 `src/renderer/src/games/ledBridge.ts`：游戏事件→灯效参数映射
  - `onHit()` → 红色脉冲 200ms（受击）
  - `onKill()` → 击杀方主色脉冲 150ms + 邻近 LED 波纹
  - `onLevelUp()` → 全灯环彩虹渐变 1s
  - `onBossEnter()` → 全灯红色呼吸（持续至 boss 死亡/消失）
  - `onEvolve()` → 全灯白色闪光 500ms
  - `onDeath()` → 全灯渐暗至熄灭 2s
- 引擎事件总线：`window.dispatchEvent(new CustomEvent('game-event', {detail}))` → ledBridge 监听
- 灯效输出：复用现有 `distributeFrameToOverlays` 管线，游戏运行时 overlay 分发不暂停（useEngineLoop.ts:204-207 的 games 视图跳过逻辑改为「跳过预览引擎 tick，但 ledBridge 直写 overlay」）

**预期效果**: 打开游戏→房间灯进入游戏模式；boss 出现→红灯；击杀→彩色脉冲；死亡→渐暗。游戏从「屏幕上的事」变成「整个房间的事」。

**验证方式**: CDP 启动游戏+开启 overlay→截图验证灯效变化；模拟事件流→断言 overlay 帧数据包含对应颜色
**回归锁**: ledBridge 单测（事件→颜色映射）+ E2E 合成驱动断言 overlay 帧变化
