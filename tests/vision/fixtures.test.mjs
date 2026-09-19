// Golden-action fixture tests: each JSON fixture replays a synthetic landmark
// sequence through the full SessionController and asserts the EXACT ordered
// action stream (recognition regressions are caught as stream diffs).
// R131: ported from the vision-game-input module (node:test → vitest).

import { test, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SessionDriver, atPalm, CENTER } from './helpers.mjs';
import { SECTORS } from '../../src/renderer/src/vision/gesture_engine.js';

const dir = dirname(fileURLToPath(import.meta.url));

for (const file of readdirSync(join(dir, 'fixtures')).filter((f) => f.endsWith('.json'))) {
  const fx = JSON.parse(readFileSync(join(dir, 'fixtures', file), 'utf8'));

  test(`fixture: ${fx.name}`, () => {
    const d = new SessionDriver({ cfg: { calSteps: { center: 500, reach: 700, pinch: 1100 } }, fps: fx.fps ?? 30 });
    d.calibrate();
    d.collect(2, atPalm(CENTER.x, CENTER.y));

    const actual = [];
    for (const f of fx.frames) {
      const n = f.n ?? 1;
      const spec = f.absent
        ? { absent: true }
        : {
            cx: f.cx, cy: f.cy,
            pinch: f.pinch,
            face: f.face ? { jawOpen: 0.04, browInnerUp: 0.03, mouthSmileLeft: 0.02, mouthSmileRight: 0.02, ...f.face } : undefined,
          };
      for (let i = 0; i < n; i++) {
        const { events } = d.frame(spec);
        actual.push(...events.filter((e) => e.kind !== 'face' || e.key)); // drop bookkeeping events
      }
    }

    // ordered subset match: every expected event must appear in order
    let ai = 0;
    const missed = [];
    for (const exp of fx.expect) {
      let found = false;
      while (ai < actual.length) {
        const a = actual[ai++];
        if (
          (!exp.kind || a.kind === exp.kind) &&
          (!exp.key || a.key === exp.key) &&
          (!exp.name || a.name === exp.name) &&
          (exp.down === undefined || a.down === exp.down)
        ) { found = true; break; }
      }
      if (!found) missed.push({ expected: exp, afterIndex: ai });
    }
    expect(missed, `missing events:\n${JSON.stringify(missed, null, 2)}\nactual(${actual.length}):\n${JSON.stringify(actual)}`).toEqual([]);

    // extra events guard: nothing beyond expected kinds for these scenarios
    const extras = actual.filter((a) => !fx.expect.some((e) =>
      (!e.kind || a.kind === e.kind) && (!e.key || a.key === e.key) && (!e.name || a.name === e.name)));
    expect(extras, `unexpected extra events: ${JSON.stringify(extras)}`).toEqual([]);

    if (fx.noStuckKeys) {
      d.collect(100, { absent: true });
      const held = heldKeysOf(d.session);
      expect(held, `stuck keys: ${JSON.stringify(held)}`).toEqual([]);
    }
  });
}

function heldKeysOf(session) {
  const held = [];
  const d = session.handEngine.direction;
  if (d.active != null) for (const k of SECTORS_KEYS(d.active)) held.push(k);
  if (session.handEngine.pinch.state === 'PRESSED') held.push('Space');
  for (const b of session.faceEngine.bindings) if (b.state) held.push(b.key);
  return held.sort();
}
function SECTORS_KEYS(idx) { return SECTORS[idx]?.keys ?? []; }
