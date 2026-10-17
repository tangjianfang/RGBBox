/**
 * R306/T15: regenerate CHANGELOG.md from the repo's conventional commits.
 * Pure parser/renderer: scripts/lib/genChangelog.mjs (tested). This wrapper
 * only talks to git and writes the file.
 *
 * Usage: node scripts/gen-changelog.mjs   (or: yarn docs:changelog)
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { renderChangelog, parseCommits } from './lib/genChangelog.mjs'

const log = execFileSync('git', ['log', '--pretty=%h%x09%ad%x09%s', '--date=short'], { encoding: 'utf8' })
const md = renderChangelog(parseCommits(log.split('\n').filter(Boolean)))
writeFileSync('CHANGELOG.md', md, 'utf8')
const groups = parseCommits(log.split('\n').filter(Boolean))
console.log(`CHANGELOG.md ← ${groups.reduce((s, g) => s + g.items.length, 0)} commits across ${groups.length} type sections`)
