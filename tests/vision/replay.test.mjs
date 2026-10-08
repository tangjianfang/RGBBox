// R226.4: replay tests — recorded landmark fixtures (from real video via
// tools/vision-dataset) drive the real SessionController; per-gesture recall /
// latency / false fires are gated by each fixture's labels.json gates.
// The synthetic sample fixture is committed, so the replay chain itself is
// always exercised in CI; real-data fixtures land in the same directory as
// they are recorded+extracted and are picked up automatically.
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readdirSync, existsSync } from 'node:fs'
import { evaluate } from './replay-harness.mjs'

const DIR = new URL('./fixtures-replay/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

function fixtureBases () {
  if (!existsSync(DIR)) return []
  return readdirSync(DIR)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => DIR + f.replace(/\.jsonl$/, ''))
}

test('R226: synthetic sample fixture replays green (harness proven in CI)', () => {
  const bases = fixtureBases()
  assert.ok(bases.length > 0, 'no replay fixtures found — sample-synthetic must be committed')
  const sample = bases.find((b) => b.endsWith('sample-synthetic'))
  assert.ok(sample, 'sample-synthetic.jsonl missing')
  const r = evaluate(sample)
  assert.deepEqual(r.failures, [], JSON.stringify(r.metrics, null, 2))
  // synthetic data is clean by construction — demand perfection from it
  assert.equal(r.metrics.recall, 1)
  assert.equal(r.metrics.falseFires, 0)
})

test('R226: every recorded real fixture meets its own gates', () => {
  for (const base of fixtureBases().filter((b) => !b.endsWith('sample-synthetic'))) {
    const r = evaluate(base)
    assert.ok(r.ok, `${base}: ${r.failures.join('; ')}\n${JSON.stringify(r.metrics, null, 2)}`)
  }
})
