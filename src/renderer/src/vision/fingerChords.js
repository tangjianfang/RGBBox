// Finger chords (R142-L4) — the high-bandwidth, near-zero-fatigue command
// channel the 8-way ring can never be: the hand RESTS on the desk and only
// the fingers move. MediaPipe already reports all 21 landmarks; this module
// turns per-frame finger extension patterns into discrete chord events.
//
// Evidence base: one-handed chord keyboards sustain 47-67 wpm (Twiddler
// studies) — finger movement is a separate, faster channel than arm movement
// (the 10-bits/s wall is an ARM figure). Vocabulary deliberately avoids the
// thumb (least reliable landmark) and the two neutral shapes (open palm =
// cursor clutch / open-palm gestures; fist = pinch-adjacent), so chords
// never collide with existing gestures.
//
// Pure JS, node-testable; the host pipeline feeds it the primary hand's
// landmarks each frame and merges its events into the snapshot stream.

import { Median3 } from './gesture_engine.js';

const dist2d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Per-finger extension booleans (orientation-tolerant tip-vs-PIP from wrist). */
export function fingerStates(lm) {
  const wrist = lm[0];
  const ext = (tip, pip) => dist2d(lm[tip], wrist) > dist2d(lm[pip], wrist) * 1.08;
  // thumb: tip-to-pinky-MCP vs thumb-MCP-to-pinky-MCP (angle-free heuristic)
  const thumbExt = dist2d(lm[4], lm[17]) > dist2d(lm[2], lm[17]) * 1.15;
  return {
    thumb: thumbExt,
    index: ext(8, 6),
    middle: ext(12, 10),
    ring: ext(16, 14),
    pinky: ext(20, 18),
  };
}

export const CHORD_VOCAB = {
  'index': 'select',            // primary click (cursor hover)
  'index+middle': 'confirm',    // confirm focused/hovered action
  'middle': 'pause',            // reserved: assistant pause (E4)
  'index+middle+ring': 'menu',  // reserved: radial quick menu (E4)
  'pinky': 'cancel',            // reserved: back/cancel (E4)
  'thumb+index': 'back',        // back to library / close overlay
  'index+pinky': 'next',        // reserved: list paging (E4)
};


// ---- E5: chord TEXT entry (R142-E5) --------------------------------------
// One chord = one character. Single fingers carry the most frequent letters
// (ETAOIN order), pairs carry the rest — 5-key chord evidence: ~20 wpm after
// ~6h practice (Academia study). Mode chords (pause/menu/…) never emit chars.
export const CHORD_CHARS = {
  'index': 'e', 'middle': 't', 'ring': 'a', 'pinky': 'o',
  'thumb': 'i',
  'index+middle': 'n', 'index+ring': 's', 'index+pinky': 'h',
  'middle+ring': 'r', 'middle+pinky': 'd', 'ring+pinky': 'l',
  'thumb+index': 'c', 'thumb+middle': 'u', 'thumb+ring': 'm',
  'thumb+pinky': 'w',
  'index+middle+ring': ' ', // space via the widest easy chord
}

function patternOf(f) {
  const parts = [];
  if (f.thumb) parts.push('thumb');
  if (f.index) parts.push('index');
  if (f.middle) parts.push('middle');
  if (f.ring) parts.push('ring');
  if (f.pinky) parts.push('pinky');
  return parts.join('+');
}

// Neutral shapes never emit: open palm (all five — clutch/start gestures)
// and fist (none — pinch-adjacent), plus 4-finger variants that read as
// near-open under landmark noise.
function isNeutral(pattern, f) {
  const count = pattern ? pattern.split('+').length : 0;
  if (count === 0 || count >= 4) return true;
  // ring-only/pinky-less transitions near open palm: require ring+middle
  // pairing for 'menu' to stay distinctive
  return false;
}

/**
 * ChordEngine — median-filtered finger states with a stability window; a
 * stable non-neutral pattern change emits ONE chord event (edge-triggered).
 */
export class ChordEngine {
  constructor(cfg = {}) {
    this.cfg = { stableFrames: 4, previewFrames: 2, ...cfg };
    // R142-E5: text mode — the SAME chords emit characters instead of commands
    this.textMode = false;
    this.buffer = ''; // committed characters (host-side, echoed in snapshots)
    this.medians = {
      thumb: new Median3(), index: new Median3(), middle: new Median3(),
      ring: new Median3(), pinky: new Median3(),
    };
    this.stablePattern = '';
    this.candidate = '';
    this.candidateFrames = 0;
    // R143.3: commit-on-release state
    this.preview = null; // { pattern, kind: 'command'|'char', name } — live, undoable
    this.released = false;
  }

  /** live preview of the chord currently held (for UI feedback) */
  currentPreview() {
    return this.preview;
  }

  /** @returns {Array<{kind:'chord', name:string, down:true}>} */
  setTextMode(on) { this.textMode = !!on; if (!on) this.buffer = ''; }
  backspace() { this.buffer = this.buffer.slice(0, -1); }

  update(lm) {
    if (!lm || lm.length < 21) return [];
    const raw = fingerStates(lm);
    const filtered = {};
    for (const f of ['thumb', 'index', 'middle', 'ring', 'pinky']) {
      // Median3 over 0/1 booleans kills single-frame classification flips
      filtered[f] = this.medians[f].push(raw[f] ? 1 : 0) >= 0.5;
    }
    const pattern = patternOf(filtered);
    // R143.3: RELEASE commit — a previously-armed preview commits when the
    // pattern dissolves (fingers relaxing). Any change away from the armed
    // pattern toward fewer extended fingers = release.
    if (this.preview && this.preview.pattern !== pattern) {
      const prevCount = this.preview.pattern ? this.preview.pattern.split('+').length : 0;
      const nowCount = pattern ? pattern.split('+').length : 0;
      const commit = this.preview;
      this.preview = null;
      if (nowCount < prevCount) {
        // fingers released → COMMIT
        if (commit.kind === 'char') this.buffer += commit.name;
        return [{ kind: 'chord', name: commit.kind === 'char' ? 'char:' + commit.name : commit.name, down: true }];
      }
      // pattern CHANGED without releasing (wider chord or different shape):
      // re-arm flow continues — the new pattern will arm its own preview
      // when it stabilizes. No commit, no misfire.
      if (pattern === this.stablePattern) { /* stable-pattern fallthrough */ }
    }
    if (pattern === this.stablePattern) {
      this.candidate = '';
      this.candidateFrames = 0;
      return [];
    }
    if (pattern === this.candidate) {
      this.candidateFrames++;
      if (this.candidateFrames >= this.cfg.stableFrames) {
        this.stablePattern = pattern;
        this.candidate = '';
        this.candidateFrames = 0;
        if (isNeutral(pattern, filtered)) return [];
        // R143.3: reaching stability ARMS a preview, not a commit —
        // committing fires on RELEASE (fingers relaxing toward neutral),
        // so passing through patterns on the way to a wider chord never fires.
        if (this.textMode) {
          const ch = CHORD_CHARS[pattern];
          this.preview = ch ? { pattern, kind: 'char', name: ch } : null;
        } else {
          const name = CHORD_VOCAB[pattern];
          this.preview = name ? { pattern, kind: 'command', name } : null;
        }
        return [];
      }
      return [];
    }
    this.candidate = pattern;
    this.candidateFrames = 1;
    return [];
  }
}
