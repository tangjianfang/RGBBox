# SOAK-LEDGER — 长跑门禁台账（R252 / T15；R306/T22 场景档）

> 2026-10-18T06:33:46.475Z · 60s 窗口 · synthetic 源（无摄像头） · scenario=macro

| 检查 | 结果 | 明细 |
|---|---|---|
| inferFps 降幅 <10% | ✓ | 0.0% (30.0→30.0) |
| heap 增长 <20MB | ✓ | -0.2MB |
| SK-0 无卡键 | ✓ | null |
| stop/start 恢复 | ✓ | seam=true chip="体感已激活" |
| 退出清理（bench stop） | ✓ | chip="未开启" |

基线 fps=30.0 heap=9.1MB → 终值 fps=30.0 heap=9.0MB
