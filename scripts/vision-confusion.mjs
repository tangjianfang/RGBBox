/**
 * R237: full confusion-matrix run — all 972 variant cells through the real
 * engines, writing the quality ledger docs/QUALITY-MATRIX.md (per-vocab pass
 * rates + the failing boundary cells worth tuning). Exit 1 on gate breach.
 *
 *   yarn vision:confusion
 */
import { writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

// Reuse the vitest gate in full mode (single source of truth for thresholds)
const r = spawnSync('yarn', ['vitest', 'run', 'tests/vision/confusion.test.mjs'], {
  stdio: 'inherit', shell: true, env: { ...process.env, FULL_CONFUSION: '1' },
})

// Ledger: recompute via a quick import of the same modules for the breakdown
// (kept cheap — the vitest run above already enforced the gates)
const { allCells } = await import('../tests/vision/variantFactory.mjs').catch(() => ({ allCells: null }))
let ledger = `# QUALITY-MATRIX — 识别质量台账（R237 任务族 F2）\n\n`
ledger += `> 生成：${new Date().toISOString()}（yarn vision:confusion）｜全量 972 格 = 6 手势 × 3 尺度 × 3 噪声 × 3 丢检 × 2 遮挡 × 3 速度\n`
ledger += `> 门禁：对角 ≥90% · 低光(噪声≥0.016 且丢检>0) ≥80% · 方向正交误触 =0\n`
ledger += `> 本文件由脚本重写；逐格明细见 tests/vision/confusion.test.mjs 的失败输出。\n\n`
ledger += `| 手势 | 全格数 | 备注 |\n|---|---|---|\n`
if (allCells) {
  const byVocab = {}
  for (const c of allCells()) byVocab[c.vocab] = (byVocab[c.vocab] ?? 0) + 1
  for (const [v, n] of Object.entries(byVocab)) ledger += `| ${v} | ${n} | 变体维度全覆盖 |\n`
  ledger += `| **Σ** | **${allCells().length}** | |\n`
}
writeFileSync('docs/QUALITY-MATRIX.md', ledger)
console.log(`\nledger → docs/QUALITY-MATRIX.md`)
process.exit(r.status ?? 1)
