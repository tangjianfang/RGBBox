# evolve log — RGBBox

- verify: yarn typecheck && yarn test
- pointer: #2 (next round)
- rounds done: 1
- status: active
- metrics: findings 4 | fixes 4 | regressions 0

## Target pool

- Tier 1 (known defects):
  - [done #1] ai8Client bare fetch — no timeout on short JSON endpoints (hung network pends for minutes; R307 retry waits forever) → R308
  - palm gesture has NO engine event — chord-pause/palm cells in the macro table are inert at runtime (documented in PRD T9; needs an event source in gesture_engine/pipeline first — likely epic-sized)
- Tier 2 (coverage gaps):
  - vision/skeleton.ts drawHandSkeleton has no direct unit test (covered indirectly via VisionReplayCard/VisionPad suites)
  - domain/visionReplay.ts ReplayPlayer.durationMs edge (events past last frame) is tested; setSpeed-after-done path untested
- Tier 3 (module rotation):
  - src/engine/videoWallFrame.ts (no dedicated suite beyond videoWall)
  - src/main/denoiseProcessor.ts (utility-process entry, tested via denoiseService suites only)
  - src/renderer/src/gl/* (GPU shaders — node+headless-gl harness exists)
- Tier 4 (backlog):
  - replay card: scrub/seek slider on the progress readout
  - settings macro matrix: preset "diff vs current" preview before applying
  - deep-bench: remember last report in localStorage for tab re-entry

## Rounds

#1 | ai8Client fetch timeout (Tier 1) | findings(4) | actions(2) | result(green+progress, 210 files / 1908 passed / 45 skipped) | diff(~110) | TDD red-first ×2; inspector REFUTED first cut (9 fetch sites not 6 — chat-send-critical updateSession + drawDelete recovery + deleteSession were bare); all 3 holes + unwrap abort-identity closed in-round; streaming endpoint stays signal-free by design; PRD R308
