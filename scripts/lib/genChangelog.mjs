// R306/T15: changelog generation from conventional commits. The PARSER and
// RENDERER live here as pure functions (tested in tests/scripts/
// genChangelog.test.mjs); scripts/gen-changelog.mjs is the thin git-log
// wrapper that writes CHANGELOG.md.
//
// Commit envelope (CLAUDE.md): `[PRD-0002] <type>: <subject>` — anything
// else (merge commits, stray messages) is skipped, never guessed at.

/** canonical section order; unknown types follow in first-seen order */
const TYPE_ORDER = ['feat', 'fix', 'perf', 'refactor', 'docs', 'test', 'chore', 'style', 'build', 'ci']

const COMMIT_RE = /^\[PRD-\d+\]\s*(feat|fix|perf|refactor|docs|test|chore|style|build|ci|revert)(?:\([^)]*\))?!?:\s*(.+)$/

/** @param {string[]} lines — `hash<TAB>date<TAB>subject` (git log --pretty with %x09) */
export function parseCommits(lines) {
  const groups = new Map()
  for (const line of lines) {
    const [hash, date, subject] = line.split('\t')
    const m = COMMIT_RE.exec(subject ?? '')
    if (!m) continue
    const type = m[1]
    if (!groups.has(type)) groups.set(type, [])
    groups.get(type).push({ hash, date, subject: m[2].trim() })
  }
  return [...groups.entries()]
    .sort((a, b) => {
      const ia = TYPE_ORDER.indexOf(a[0]); const ib = TYPE_ORDER.indexOf(b[0])
      return (ia === -1 ? TYPE_ORDER.length : ia) - (ib === -1 ? TYPE_ORDER.length : ib)
    })
    .map(([type, items]) => ({ type, items }))
}

export function renderChangelog(groups) {
  const body = groups.map(({ type, items }) =>
    `## ${type}\n\n${items.map((i) => `- ${i.subject} — \`${i.hash}\` ${i.date}`).join('\n')}\n`,
  ).join('\n')
  return `# Changelog

All notable changes to RGBBox. Generated from the repo's conventional commits
(\`[PRD-0002] <type>: <subject>\`); regenerate with \`yarn docs:changelog\`.

${body}`
}
