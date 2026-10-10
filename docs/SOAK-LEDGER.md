# SOAK-LEDGER — 长跑门禁台账（R252 / T15）

> 2026-10-09T16:40:36.518Z · 60s 窗口 · synthetic 源（无摄像头）

| 检查 | 结果 | 明细 |
|---|---|---|
| inferFps 降幅 <10% | ✓ | -0.4% (60.2→60.5) |
| heap 增长 <20MB | ✓ | -1.3MB |
| SK-0 无卡键 | ✓ | null |
| stop/start 恢复 | ✓ | seam=true chip="体感已激活" |
| 退出清理（bench stop） | ✓ | chip="未开启" |

基线 fps=60.2 heap=10.1MB → 终值 fps=60.5 heap=8.7MB
