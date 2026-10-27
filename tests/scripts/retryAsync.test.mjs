// R323: bounded retry used by afterPack's rcedit icon write. The failure it
// papers over is a transient file lock ("Unable to commit changes"), so the
// policy must (a) retry only that kind, (b) never mask a real error, (c) stay
// bounded, (d) say what to do when it gives up. node environment.
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { retryAsync, backoffMs } from '../../scripts/lib/retryAsync.mjs'

const noSleep = async () => {}
const LOCKED = () => new Error('rcedit.exe failed with exit code 1. Fatal error: Unable to commit changes')
const isLocked = (e) => /Unable to commit changes/i.test(e.message)

test('backoffMs: linear 1s,2s,3s,4s then capped at 5s', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map((n) => backoffMs(n)), [1000, 2000, 3000, 4000, 5000, 5000, 5000])
  assert.equal(backoffMs(3, { baseMs: 10, capMs: 25 }), 25)
})

test('first call succeeds → returned as-is, no retry, no sleep', async () => {
  let calls = 0
  const slept = []
  const out = await retryAsync(async () => { calls++; return 'ok' }, { sleep: async (ms) => { slept.push(ms) } })
  assert.equal(out, 'ok')
  assert.equal(calls, 1)
  assert.deepEqual(slept, [])
})

test('transient lock then success → retried with back-off, result returned (the observed rcedit pattern)', async () => {
  let calls = 0
  const slept = []
  const seen = []
  const out = await retryAsync(async () => { calls++; if (calls < 3) throw LOCKED(); return 'icon embedded' }, {
    shouldRetry: isLocked,
    sleep: async (ms) => { slept.push(ms) },
    onRetry: (info) => seen.push([info.attempt, info.attempts, info.delayMs]),
  })
  assert.equal(out, 'icon embedded')
  assert.equal(calls, 3)
  assert.deepEqual(slept, [1000, 2000])
  assert.deepEqual(seen, [[1, 8, 1000], [2, 8, 2000]])
})

test('a NON-transient error fails at once — a real bug is never retried or masked', async () => {
  let calls = 0
  const bad = new Error('rcedit.exe failed with exit code 1. Fatal error: Unable to load icon from D:/x.ico')
  await assert.rejects(
    retryAsync(async () => { calls++; throw bad }, { shouldRetry: isLocked, sleep: noSleep }),
    (e) => e === bad,
  )
  assert.equal(calls, 1)
})

test('exhaustion is bounded: exactly `attempts` calls, sleeps between (not after) them, error carries count + hint + cause', async () => {
  let calls = 0
  const slept = []
  await assert.rejects(
    retryAsync(async () => { calls++; throw LOCKED() }, {
      attempts: 4, shouldRetry: isLocked, sleep: async (ms) => { slept.push(ms) },
      exhaustedHint: 'exclude release\\ from scanning',
    }),
    (e) => {
      assert.match(e.message, /still failing after 4 attempts/)
      assert.match(e.message, /Unable to commit changes/)
      assert.match(e.message, /exclude release\\ from scanning/)
      assert.match(e.cause.message, /Unable to commit changes/)
      return true
    },
  )
  assert.equal(calls, 4)
  assert.deepEqual(slept, [1000, 2000, 3000], 'no sleep after the final failure')
})

test('non-Error throwables are normalised', async () => {
  await assert.rejects(
    retryAsync(async () => { throw 'plain string' }, { attempts: 1, sleep: noSleep }),
    /still failing after 1 attempts: plain string/,
  )
})

test('afterPack wires the retry to the transient signature only (guard against regressing to a bare rcedit call)', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../../scripts/afterPack.mjs', import.meta.url), 'utf8')
  assert.match(src, /retryAsync\(\(\) => rcedit\(/, 'rcedit must go through retryAsync')
  assert.match(src, /Unable to commit changes/, 'retry is keyed on the lock signature, not "any error"')
  assert.doesNotMatch(src, /await rcedit\(exePath/, 'no bare rcedit call may remain')
})
