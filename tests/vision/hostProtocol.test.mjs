// R228: the vision-host protocol contract + session registry (pure functions).
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { createSessionRegistry, nextConsumerId, HOST_MSG, HOST_REPLY, VISION_CHANNEL, USER_VOCAB } from '../../src/renderer/src/vision/hostProtocol.js'

test('protocol tables are frozen and complete (the wire contract)', () => {
  assert.equal(VISION_CHANNEL, 'rgbbox-vision')
  assert.equal(HOST_MSG.INIT, 'init')
  assert.equal(HOST_MSG.ACQUIRE, 'acquire')
  assert.equal(HOST_MSG.RELEASE, 'release')
  assert.equal(HOST_REPLY.READY, 'ready')
  // R244: the host liveness signal (5s interval — the client watchdog's input)
  assert.equal(HOST_REPLY.HEARTBEAT, 'heartbeat')
  // R244: 表+单测计数同步 — a new wire type must be a conscious act: update
  // these counts WITH the PRD note, not silent vocabulary creep.
  assert.equal(Object.keys(HOST_MSG).length, 13)
  assert.equal(Object.keys(HOST_REPLY).length, 8)
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

// R231: the learning surface — the user-facing vocabulary is capped at 6 and
// frozen. Adding a 7th word must be a conscious act (update the cap WITH a
// PRD note), not vocabulary creep.
test('R231: USER_VOCAB is frozen, unique, bilingual, and capped at 6', () => {
  assert.equal(USER_VOCAB.length, 6)
  assert.equal(new Set(USER_VOCAB.map((v) => v.id)).size, 6)
  for (const v of USER_VOCAB) {
    assert.ok(v.id && v.zh && v.en, `entry ${v.id} must be fully bilingual`)
    assert.ok(Object.isFrozen(v))
  }
  // R229's light ring is core vocabulary; reserved chords must NOT be listed
  assert.ok(USER_VOCAB.some((v) => v.id === 'chord-light'))
  assert.ok(!USER_VOCAB.some((v) => v.id === 'pause' || v.id === 'next'))
})
