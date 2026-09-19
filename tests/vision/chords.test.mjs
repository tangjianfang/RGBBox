// Finger chords (R142-L4) — the resting-hand command channel. Tests cover:
// pattern classification, median/stability anti-chatter, the ≥97% noisy
// recognition gate, neutral-shape immunity (open palm / fist / pinch shapes
// never emit), and no spurious chords from the synthetic demo hand pipeline.

import { test, expect } from 'vitest'
import { fingerStates, ChordEngine, CHORD_VOCAB } from '../../src/renderer/src/vision/fingerChords.js'
import { makeLandmarks } from '../../src/renderer/src/vision/synthetic.js'

// Build a hand with EXPLICIT per-finger extension — positions tips/pips
// relative to the wrist so fingerStates' distance heuristic classifies each
// finger as intended, with optional landmark noise.
function chordHand({ extended = ['thumb', 'index', 'middle', 'ring', 'pinky'], noise = 0 } = {}) {
  const lm = makeLandmarks({ cx: 0.5, cy: 0.5, scale: 0.18, noise })
  const wrist = lm[0]
  const jig = () => (noise ? (Math.random() - 0.5) * noise : 0)
  // FINGERS: tip/pip indices; extended tip sits far above the wrist, folded
  // tip sits at wrist distance (below its pip).
  const fingers = { index: [8, 6], middle: [12, 10], ring: [16, 14], pinky: [20, 18] }
  for (const [name, [tip, pip]] of Object.entries(fingers)) {
    const isExt = extended.includes(name)
    const spread = isExt ? 0.34 : 0.10
    lm[pip] = { x: lm[pip].x + jig(), y: lm[pip].y + jig(), z: 0 }
    lm[tip] = { x: lm[tip].x + jig(), y: wrist.y - spread + jig(), z: 0 }
  }
  // THUMB: tip far from pinky-MCP when extended, close when folded
  const isThumb = extended.includes('thumb')
  lm[4] = { x: lm[4].x + jig(), y: isThumb ? lm[4].y - 0.1 + jig() : lm[2].y + 0.02 + jig(), z: 0 }
  if (isThumb) lm[4] = { x: lm[2].x - 0.34 + jig(), y: lm[2].y + jig(), z: 0 }
  return lm
}


// R143.3 helper: form a chord (hold past the stability window), then release
// to neutral — the commit fires on the release edge.
function typeChord(eng, extended, opts = {}) {
  const events = []
  for (let i = 0; i < 8; i++) events.push(...eng.update(chordHand({ extended, noise: opts.noise })))
  if (opts.noRelease) return events
  for (let i = 0; i < 6; i++) events.push(...eng.update(chordHand({ extended: [], noise: opts.noise })))
  return events
}

function driveChord(extended, frames = 8, noise = 0) {
  const eng = new ChordEngine()
  const events = []
  for (let i = 0; i < frames; i++) {
    events.push(...eng.update(chordHand({ extended, noise })))
  }
  return events
}

test('vocabulary chords commit exactly once on release with the right name', () => {
  for (const pattern of Object.keys(CHORD_VOCAB)) {
    const extended = pattern.split('+')
    const events = typeChord(new ChordEngine(), extended)
    const names = events.map((e) => e.name)
    expect(names, pattern).toEqual([CHORD_VOCAB[pattern]])
  }
})

test('neutral shapes never emit: open palm, fist, 4-finger near-open', () => {
  expect(typeChord(new ChordEngine(), ['thumb', 'index', 'middle', 'ring', 'pinky'])).toEqual([]) // open
  expect(typeChord(new ChordEngine(), [])).toEqual([]) // fist
  expect(typeChord(new ChordEngine(), ['thumb', 'index', 'middle', 'ring'])).toEqual([]) // near-open
})

test('pinch shape (middle+ring+pinky extended) is not in the vocabulary — no collision', () => {
  expect(typeChord(new ChordEngine(), ['middle', 'ring', 'pinky'])).toEqual([])
})

test('stability: transient frames do not arm; holding never commits; release does', () => {
  const eng = new ChordEngine()
  const events = []
  for (let i = 0; i < 3; i++) events.push(...eng.update(chordHand({ extended: ['index'] })))
  expect(events).toEqual([])
  expect(eng.currentPreview()).toBeNull()
  for (let i = 0; i < 10; i++) events.push(...eng.update(chordHand({ extended: ['index'] })))
  expect(events).toEqual([]) // armed, NOT committed while held
  expect(eng.currentPreview()?.name).toBe('select')
  for (let i = 0; i < 6; i++) events.push(...eng.update(chordHand({ extended: [] })))
  expect(events.map((e) => e.name)).toEqual(['select'])
})

// R143.3 regression: the ORIGINAL misfire — widening index → +middle → +ring
// (reaching for the space chord) used to emit the intermediate 'menu'/'n'.
test('widening a chord never commits the intermediate pattern (misfire regression)', () => {
  const eng = new ChordEngine()
  const events = []
  for (let i = 0; i < 8; i++) events.push(...eng.update(chordHand({ extended: ['index'] })))
  for (let i = 0; i < 8; i++) events.push(...eng.update(chordHand({ extended: ['index', 'middle'] })))
  for (let i = 0; i < 8; i++) events.push(...eng.update(chordHand({ extended: ['index', 'middle', 'ring'] })))
  expect(events).toEqual([]) // nothing committed while shaping
  for (let i = 0; i < 6; i++) events.push(...eng.update(chordHand({ extended: [] })))
  expect(events.map((e) => e.name)).toEqual(['menu']) // only the FINAL shape
})

test('≥97% recognition under landmark noise (Monte Carlo, 200 hands × 4 chords)', () => {
  const chords = [['index'], ['index', 'middle'], ['thumb', 'index'], ['index', 'pinky']]
  let hit = 0
  let total = 0
  for (let run = 0; run < 200; run++) {
    for (const extended of chords) {
      total++
      const events = typeChord(new ChordEngine(), extended, { noise: 0.006 })
      const want = CHORD_VOCAB[extended.join('+')]
      // a hit = the intended chord fires and nothing else did
      if (events.length === 1 && events[0].name === want) hit++
    }
  }
  const rate = hit / total
  expect(rate).toBeGreaterThanOrEqual(0.97)
})

// R142-E5: chord TEXT mode — same engine, same stability rules, characters
// instead of commands; command vocabulary stays silent in text mode.
import { ChordEngine as ChordEngineE5 } from '../../src/renderer/src/vision/fingerChords.js'

test('text mode: chords emit char events and build the buffer', () => {
  const eng = new ChordEngineE5()
  eng.setTextMode(true)
  const events = []
  for (let i = 0; i < 8; i++) events.push(...eng.update(chordHand({ extended: ['index'] })))
  for (let i = 0; i < 8; i++) events.push(...eng.update(chordHand({ extended: ['index', 'middle'] })))
  for (let i = 0; i < 8; i++) events.push(...eng.update(chordHand({ extended: ['index', 'middle', 'ring'] })))
  for (let i = 0; i < 6; i++) events.push(...eng.update(chordHand({ extended: [] })))
  expect(events.map((e) => e.name)).toEqual(['char: ']) // ONLY the final shape
  expect(eng.buffer).toBe(' ')
  for (let i = 0; i < 8; i++) events.push(...eng.update(chordHand({ extended: ['middle'] })))
  for (let i = 0; i < 6; i++) events.push(...eng.update(chordHand({ extended: [] })))
  expect(events.map((e) => e.name)).toEqual(['char: ', 'char:t'])
  expect(eng.buffer).toBe(' t')
})

test('text mode off: the same chords are commands again and the buffer clears', () => {
  const eng = new ChordEngineE5()
  eng.setTextMode(true)
  for (let i = 0; i < 8; i++) eng.update(chordHand({ extended: ['index'] }))
  eng.setTextMode(false)
  expect(eng.buffer).toBe('')
  // engine must see a non-neutral transition again: go neutral first
  for (let i = 0; i < 6; i++) eng.update(chordHand({ extended: [] }))
  const ev = []
  for (let i = 0; i < 8; i++) ev.push(...eng.update(chordHand({ extended: ['index'] })))
  for (let i = 0; i < 6; i++) ev.push(...eng.update(chordHand({ extended: [] })))
  expect(ev.map((e) => e.name)).toEqual(['select'])
})
