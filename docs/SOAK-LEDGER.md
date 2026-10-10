# SOAK-LEDGER — 长跑门禁台账（R252 / T15）

> 2026-10-10T18:50:54.191Z · 1800s 窗口 · synthetic 源（无摄像头）

| 检查 | 结果 | 明细 |
|---|---|---|
| inferFps 降幅 <10% | ✓ | 0.1% (60.5→60.4) |
| heap 增长 <20MB | ✓ | -1.0MB |
| SK-0 无卡键 | ✓ | null |
| stop/start 恢复 | ✓ | seam=true chip="体感已激活" |
| 退出清理（bench stop） | ✓ | chip="未开启" |

基线 fps=60.5 heap=9.9MB → 终值 fps=60.4 heap=9.0MB
