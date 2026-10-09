// R228: the vision-host protocol contract + session registry (pure functions).
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { createSessionRegistry, nextConsumerId, HOST_MSG, HOST_REPLY, VISION_CHANNEL } from '../../src/renderer/src/vision/hostProtocol.js'

test('protocol tables are frozen and complete (the wire contract)', () => {
  assert.equal(VISION_CHANNEL, 'rgbbox-vision')
  assert.equal(HOST_MSG.INIT, 'init')
  assert.equal(HOST_MSG.ACQUIRE, 'acquire')
  assert.equal(HOST_MSG.RELEASE, 'release')
  assert.equal(HOST_REPLY.READY, 'ready')
  // sanity: the two tables stay disjoint
  const hostMsgs = new Set(Object.values(HOST_MSG))
  for (const v of Object.values(HOST_REPLY)) assert.ok(!hostMsgs.has(v), `${v} must not appear in both tables`)
})

test('registry: acquire is idempotent, release is idempotent, empty decides teardown', () => {
  const r = createSessionRegistry()
  assert.ok(r.empty())
  assert.equal(r.acquire('games'), 1)
  assert.equal(r.acquire('games'), 1) // double-acquire ≠ double refcount
  assert.equal(r.acquire('assistant'), 2)
  assert.ok(!r.empty())
  assert.equal(r.release('games'), 1)
  assert.ok(r.has('assistant'))
  assert.equal(r.release('games'), 1) // racing double-release is a no-op
  assert.equal(r.release('assistant'), 0)
  assert.ok(r.empty()) // last one out → host may tear down
})

test('registry: clear() is the force-stop path; junk ids are ignored', () => {
  const r = createSessionRegistry()
  r.acquire('a'); r.acquire('b')
  r.clear()
  assert.ok(r.empty())
  assert.equal(r.acquire(''), 0)
  assert.equal(r.acquire(undefined), 0)
  assert.equal(r.acquire(42), 0)
})

test('nextConsumerId: unique per call', () => {
  const ids = new Set(Array.from({ length: 100 }, () => nextConsumerId()))
  assert.equal(ids.size, 100)
})
