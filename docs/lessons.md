# Lessons — RGBBox

Entry template: `| id | one-sentence lesson | how to apply (an executable action, not a slogan) | source | verified |`

- Update an existing entry on the same topic instead of adding a duplicate.
- Every retrospective re-checks entries: confirmed in action → `verified +1`; proved wrong or stale → rewrite or delete on the spot.
- ≥ 3 same-theme lessons with ≥ 5 total verifications → crystallize into a named SKILL.md mechanism or a standalone skill; mark the entries `crystallized → <where>`.

## measurement / test-infra

| id | lesson | how to apply | source | verified |
|---|---|---|---|---|
| L1 | Piped `yarn test \| grep` output has NO per-file lines (vitest TTY detection) — file-level forensics on piped output is blind; use `--reporter=verbose` or count totals only | When a file seems missing from a piped run, re-run with `yarn vitest run --reporter=verbose` before concluding anything | evolve #1 suite-count investigation | 1 |
| L2 | A single anomalous full-suite count (files or tests down, zero failures) under heavy parallel load (soak probes, stash runs) is a transient — re-run before investigating | Re-run the suite once; only diff file lists on a REPRODUCED delta (memory: parallel-sessions transient) | evolve #1 (209/1887 → 210/1907 on re-run) | 1 |

## networking / api-clients

| id | lesson | how to apply | source | verified |
|---|---|---|---|---|
| L3 | Every renderer-direct fetch needs an explicit abort timeout — the browser's socket timeout is minutes; retry/error state machines starve without a timely failure | Attach AbortSignal.timeout (injectable ms for tests) to every SHORT request; exclude only long-generation/streaming endpoints, and write that boundary in a comment | R307→R308 (retry existed but starved on hung sockets) | 1 |
