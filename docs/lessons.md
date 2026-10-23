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

## build-environment

| id | lesson | how to apply | source | verified |
|---|---|---|---|---|
| L4 | electron-builder 26.x 打包**不读** `node_modules/electron/dist`，而是解压 `%LOCALAPPDATA%\electron\Cache` 的 zip；缓存损坏 → unpack-electron 静默产出缺 electron.exe 的 win-unpacked → rename ENOENT（dist 缺 exe 只是同故障**共症状**） | 打包失败先跑 `node scripts/lib/checkBuildEnv.mjs`（R311 L-1 层，已接 predist 钩子）；红时按其打印的恢复指引删缓存 + 镜像重下 | 2026-10-24 跨机构建失败（REVIEW_2026-10-24 附录06）+ PRD R216.6 同构先例 | 1 |
| L5 | `yarn add` 任意包都可能触发 electron postinstall 把 `node_modules/electron/dist/` 清成只剩 locales/ —— `yarn dev` 报 spawn electron.exe ENOENT | 恢复：`ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ node node_modules/electron/install.js`（或从缓存 zip 解压 + path.txt 必须无尾换行） | 2026-10-14 实操验证；2026-10-24 入库（原存于私有 memory，跨机不可见） | 2 |
| L6 | CN 网络下 GitHub 直连二进制必炸（主进程不走系统代理）；electron/HuggingFace 均需镜像意识（hf-mirror 可用但单源是短板） | 仓库 `.npmrc` 已固化 electron_mirror（R311）；新依赖引入二进制下载时同样固化镜像，并给下载通道加超时与备源 | PRD R123/R136、REVIEW_2026-10-24 E-3 | 1 |
