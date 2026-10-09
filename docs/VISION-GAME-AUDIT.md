# VISION-GAME-AUDIT — 五游戏体感接入审计（R249 / 任务族 F9）

> 2026-10-10 · 逐格结论+代码锚点。发现问题按「即修 / 立案」处置。

## 映射总表（vision-mapping 关）

| 游戏 | 输入源 | 八向映射 | 捏合 | 斜向 | 锚点 |
|---|---|---|---|---|---|
| hub | —（无游戏态） | — | pinch(space) 开局（Tetris/Survival ready/lost 态） | — | MiniGamesView.tsx:899 |
| td | 鼠标为主，体感**不接入**（R131 设计如此） | — | — | — | R131.3 ② |
| swarm | heldRef → keys Set（8 向 8 键） | 8→keys | space | dirs:8 | :805-930 区 |
| tetris | queueRef → commands left/right/rotate/hard + arrowdown 按住 | dirs:4（吸附基数方向防一次转两下） | space→hard | dirs:4 | :837-853、:949 |
| slash | queueRef + 双 pinch 确认（R139 轮盘） | — | 双 space<900ms 确认 | — | :918-928 |

**结论**：映射与 R131.3/R213 契约一致；文档化完成（本表即 F9-vision-mapping 交付）。

## pause-convergence 关

| 路径 | 摄像头 | 输入 | 锚点 |
|---|---|---|---|
| 回 hub | vision.disable()（释放+R228 release 语义） | heldRef.clear ✓ | R131.3 ③ + useVisionInput disable |
| Esc 暂停（R218 U2 统一分层） | 摄像头**不停**（游戏暂停态仍推流——B-8 已定 R244 后续） | keys 保留（暂停语义） | MiniGamesView.tsx:1512-1517 |
| 窗口最小化 | R227.5 助手层已收敛；**games hook 未挂可见性**——hub 外最小化仅靠宿主 throttling | — | **发现 1（立案 R250）** |

## undo-path 关

| 游戏 | 误触发力 | 可撤销 | 处置 |
|---|---|---|---|
| tetris | pinch=hard-drop（不可逆） | ✗ | **发现 2（即修 R249.1）**：hard 前插 150ms 确认双窗（第二次 pinch 才提交；与 R139 双 pinch 确认同模式） |
| swarm/slash/td | 方向/确认类 | 局部可逆（移动/选择） | ✓ |
| hub | pinch 开局 | 无破坏 | ✓ |

## fps-guard 关

| 对照 | 结果 |
|---|---|
| 宿主独立渲染进程（R136 架构）+ 推理 cap 30/60Hz | 引擎单帧 p50 0.222ms（03 量化实测），不在游戏线程 |
| games 路径 face 推理 | **发现 3（即修，随 R249.2）**：init cfg 仍传 faceModel → 每 3 帧白跑 FaceLandmarker（03-B9 实证 +34.6ms/3帧）——games 无 face 消费，置 null |

## 发现汇总

1. **立案 R250**：games hook 最小化不收敛摄像头（仅助手层收敛）——与 R227.5 同法挂 `onMainWindowVisibilityChanged`。
2. **即修 R249.1**：Tetris 硬降 150ms 双 pinch 确认窗（误触发不可逆=X9 P1）。
3. **即修 R249.2**：games init `faceModel:null`（白付 face 推理 B-9/U-3）。
