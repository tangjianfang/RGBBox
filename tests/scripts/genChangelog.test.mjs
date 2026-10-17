// R306/T15: the changelog generator's pure parser — conventional commits
// (`[PRD-0002] <type>: <subject>`) grouped by type, newest-first, non-
// matching lines skipped. node environment.
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { parseCommits, renderChangelog } from '../../scripts/lib/genChangelog.mjs'

const LINE = (hash, date, subject) => `${hash}\t${date}\t${subject}`

test('parseCommits: groups by type newest-first, keeps PRD tag + subject verbatim', () => {
  const lines = [
    LINE('bbbb', '2026-10-18', '[PRD-0002] feat: R306/T2 深度体检报告——你的环境 vs 实验室基线'),
    LINE('aaaa', '2026-10-18', '[PRD-0002] fix: R305 体感台只有握拳能测'),
    LINE('cccc', '2026-10-17', '[PRD-0002] feat: R304 工作区「感觉台」'),
    LINE('dddd', '2026-10-16', '[PRD-0002] docs: R306 体感商业级 9+ 冲刺立项'),
    // non-matching shapes are skipped silently (merge commits, raw subjects)
    LINE('eeee', '2026-10-16', 'Merge branch main'),
    LINE('ffff', '2026-10-15', 'chore without the PRD envelope'),
  ]
  const out = parseCommits(lines)
  assert.deepEqual(out.map((g) => g.type), ['feat', 'fix', 'docs'], 'type groups in canonical order')
  assert.deepEqual(out[0].items.map((i) => i.hash), ['bbbb', 'cccc'], 'newest first within a type')
  assert.equal(out[0].items[0].subject, 'R306/T2 深度体检报告——你的环境 vs 实验室基线')
  assert.equal(out[0].items[0].date, '2026-10-18')
})

test('parseCommits: unknown conventional types land in a 按原词 group, still ordered after the known set', () => {
  const lines = [
    LINE('1111', '2026-10-18', '[PRD-0002] perf: 台账脚本提速'),
    LINE('2222', '2026-10-18', '[PRD-0002] style: 缩进'),
    LINE('3333', '2026-10-18', '[PRD-0002] feat: 新功能'),
  ]
  const out = parseCommits(lines)
  assert.deepEqual(out.map((g) => g.type), ['feat', 'perf', 'style'])
})

test('renderChangelog: deterministic markdown — header, type sections, one bullet per commit', () => {
  const md = renderChangelog(parseCommits([
    LINE('abcd123', '2026-10-18', '[PRD-0002] feat: something'),
    LINE('fffeeee', '2026-10-17', '[PRD-0002] fix: other'),
  ]))
  assert.ok(md.startsWith('# Changelog'), 'title first')
  assert.ok(md.includes('## feat'))
  assert.ok(md.includes('- something — `abcd123` 2026-10-18'), 'bullet carries subject + hash + date')
  assert.ok(md.includes('## fix'))
  assert.ok(md.includes('- other — `fffeeee` 2026-10-17'))
  // byte-stable for the same input (committed artifact, no timestamps of "now")
  assert.equal(md, renderChangelog(parseCommits([
    LINE('abcd123', '2026-10-18', '[PRD-0002] feat: something'),
    LINE('fffeeee', '2026-10-17', '[PRD-0002] fix: other'),
  ])))
})

test('renderChangelog: empty input still renders the header (never a broken file)', () => {
  const md = renderChangelog([])
  assert.ok(md.startsWith('# Changelog'))
  assert.ok(!md.includes('## '))
})
