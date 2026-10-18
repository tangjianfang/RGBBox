# evolve log — RGBBox

- verify: yarn typecheck && yarn test
- pointer: #11 (next round)
- rounds done: 10
- status: active
- metrics: findings 15 | fixes 12 | regressions 0
- checkpoint (2026-10-18, after round #10): 10 rounds green+progress, ALL in one session; context deep — next session resumes at pointer #11. In-flight: none (all committed). Done this stretch: denoise triple (serialization R310b / pairing-skew R310c / backpressure R310d — one inspector agent, three adversarial passes, all verdicts hold). Priority for #11+: Tier-1 denoiseStart double-fork (small), overload-UX telemetry; Tier-3 gl rotation; denoiseProcessor test-harness = epic candidate (zero direct coverage); palm event = epic candidate (user decision).

## Target pool

- Tier 1 (known defects):
  - [done #1] ai8Client bare fetch — no timeout on short JSON endpoints (hung network pends for minutes; R307 retry waits forever) → R308
  - [done #10] denoise backpressure (hole #2) → R310d (cap 4 + shed-newest over the proven id-error path)
  - denoise overload UX: shed/hang invisible to the user (queue-full error stream is the symptom; needs telemetry surface + reply-age watchdog + auto-recovery consideration)
  - denoiseProcessor/drop-path: still zero direct test coverage (needs an ORT-mock harness or worklet-logic extraction — candidate epic)
  - [done #9] denoise batch-failure pairing skew (hole #3) → R310c (id-precise resync after a two-pass inspector convergence)
  - denoiseStart double-fork (inspector nit): two concurrent invokes can both pass the session check → leaked child
  - palm gesture has NO engine event — chord-pause/palm cells in the macro table are inert at runtime (documented in PRD T9; needs an event source in gesture_engine/pipeline first — likely epic-sized)
- Tier 2 (coverage gaps):
  - [done #3] vision/skeleton.ts drawHandSkeleton direct unit test → R309
  - domain/visionReplay.ts ReplayPlayer.durationMs edge (events past last frame) is tested; setSpeed-after-done path untested
- Tier 3 (module rotation):
  - [done #7] src/engine/videoWallFrame.ts — reviewed clean (math + defenses sound); +2 edge tests → R310
  - [done #8] src/main/denoiseProcessor.ts — REAL race found (concurrent frames batches interleave shared LSTM state); serialized + inspector-hardened → R310b
  - src/renderer/src/gl/* (GPU shaders — node+headless-gl harness exists)
- Tier 4 (backlog):
  - [done #5] replay card: scrub/seek slider on the progress readout → R309c
  - [done #6] settings macro matrix: preset diff preview before applying → R309d
  - [done #4] deep-bench: remember last report in localStorage for tab re-entry → R309b

## Rounds

#1 | ai8Client fetch timeout (Tier 1) | findings(4) | actions(2) | result(green+progress, 210 files / 1908 passed / 45 skipped) | diff(~110) | TDD red-first ×2; inspector REFUTED first cut (9 fetch sites not 6 — chat-send-critical updateSession + drawDelete recovery + deleteSession were bare); all 3 holes + unwrap abort-identity closed in-round; streaming endpoint stays signal-free by design; PRD R308

#2 | retrospective (N=1 run) | findings(0) | actions(0) | result(green+no-progress, 210 files / 1908 passed / 45 skipped) | diff(~10) | replay audit PASS (parent 0×R308 refs vs HEAD 2×; both tests watched red pre-fix); lessons L1-L3 fresh (verified 1 each); no process pit hit twice; metrics stand

## Run summary (2026-10-18, N=1)

- Outcome: 1 work round + retrospective — 1 Tier-1 defect fixed (R308, AI8 request
  timeouts), adversarial inspector REFUTED the first cut (9 fetch sites, not 6)
  and all 3 holes + 1 error-identity issue were closed in-round.
- Metrics: findings 4 | fixes 4 | regressions 0 | tests 1906 → 1908.
- Lesson index: L1 (piped-output blindness), L2 (transient suite counts), L3
  (timeout every renderer fetch) — all new this run.
- Next: pointer #3 — palm-gesture-event epic candidate (Tier 1), else Tier 2
  (skeleton.ts direct test) / Tier 4 backlog.

#3 | skeleton direct tests (Tier 2) | findings(0) | actions(1) | result(green+progress, 211 files / 1911 passed / 45 skipped) | diff(~70) | baseline-grew +3: HAND_BONES graph integrity (21 bones, all 21 landmarks connected, no out-of-range) + rect mapping (recorder-ctx stub, one stroke path, 21 arcs, origin/corner math) + malformed-hand no-op; red phase caught MY test's own arithmetic before green — the code was right

#4 | bench report persistence (Tier 4) | findings(0) | actions(1) | result(green+progress, 211 files / 1912 passed / 45 skipped) | diff(~60) | red-first (tab re-entry loses a finished 90s measurement); numbers-only persisted (frames NEVER touch storage — MBs); hydrated view read-only (export hidden, again available); E2E 33/33

#5 | replay seek slider (Tier 4) | findings(0) | actions(1) | result(green+progress, 211 files / 1914 passed / 45 skipped) | diff(~110) | ReplayPlayer.seek red-first (crossed events skipped, backward re-arms, clamps, wall-anchor cleared so scrub never fast-forwards); slider value gated to the 0.1s text cadence (no per-frame re-render); seek-off-end flips done→ready (play resumes from position); packaged probe scrubbed mid-track + AI review clean

#6 | macro preset diff preview (Tier 4) | findings(0) | actions(1) | result(green+progress, 212 files / 1916 passed / 45 skipped) | diff(~120) | macroDiff() domain red-first (changed cells only, both directions, empty=no-op); settings two-step: select→exact-diff preview→apply/cancel (blind preset apply was sight-unseen rewiring); no-op presets confirm directly; packaged probe: 15 diffs listed, nothing stored until apply, AI review clean

#7 | videoWallFrame rotation (Tier 3) | findings(0) | actions(1) | result(green+progress, 212 files / 1918 passed / 45 skipped) | diff(~40) | 87-line module reviewed clean (double-clamped UVs, edge sampling, degenerate sizes — all tested); +2 edge tests: renderStyle passthrough + truncated-pixel-buffer defensive lock (reads past end clamp to black, never throws); red phase = my own sampling-math slip in the test (4×4 first out-pixel samples (1,0) not (0,0)), fixed to 2×2

#8 | denoiseProcessor rotation (Tier 3) | findings(7) | actions(2) | result(green+progress, 212 files / 1918 passed / 45 skipped) | diff(~30) | REAL race: fire-and-forget relay × fire-and-forget IIFE → concurrent batches race shared LSTM tensors; serialized via promise chain; inspector verdict: core holds + holes #1 (poisoned chain → process death, FIXED .catch guard) and pre-ready frames killing init (FIXED silent drop); holes #2 (backpressure) #3 (pairing skew) + double-fork nit → Tier-1 backlog (round-sized pieces cannot close honestly)

#9 | denoise pairing-skew (Tier 1, inspector hole #3) | findings(3) | actions(1) | result(green+progress, 212 files / 1918 passed / 45 skipped) | diff(~70) | first cut = inspector prescription (id relay + positional drop); re-inspection REFUTED common-case-only: same-window race + epoch-crossing drop + id-dead-weight; final = worklet pending-id queue, drop located at wet.length+indexOf(id)*BATCH — both races closed BY CONSTRUCTION, cross-epoch id miss = safe no-op

#10 | denoise backpressure (Tier 1, inspector hole #2) | findings(4) | actions(2) | result(green+progress, 212 files / 1918 passed / 45 skipped) | diff(~20) | cap 4 waiting + shed-newest over the R310c id-error path; third-pass verdict HOLDS (no counter leak, chain-safe, id-precise makes shed deterministic); applied its (c)3 one-liner (seq time-offset kills remount id collision); documented policy trade (order-continuity vs T_s-scaled audio age) + hang-no-timeout rationale (only policy consistent with serialization)
