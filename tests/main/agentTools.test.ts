import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  clampToWorkspace, isBashDenied, toolEdit, toolGlob, toolList, toolRead, toolWrite,
} from '../../src/main/agentTools'

let ws = ''
beforeEach(() => { ws = mkdtempSync(join(tmpdir(), 'agent-tools-')) })
afterEach(() => { rmSync(ws, { recursive: true, force: true }) })

describe('main/agentTools clamping (R172-S1)', () => {
  it('accepts workspace-relative paths, rejects escapes', () => {
    expect(clampToWorkspace(ws, 'a/b.txt')).toBe(join(ws, 'a', 'b.txt'))
    expect(clampToWorkspace(ws, '../escape.txt')).toBeNull()
    expect(clampToWorkspace(ws, 'a/../../escape')).toBeNull()
    expect(clampToWorkspace(ws, join(ws, 'ok.txt'))).toBe(join(ws, 'ok.txt')) // abs inside ws is fine
    expect(clampToWorkspace('C:\\elsewhere', join(ws, 'x'))).toBeNull()
    expect(clampToWorkspace(ws, '')).toBeNull()
  })
})

describe('main/agentTools denylist (R172-S1 + R176)', () => {
  it('catches destructive patterns', () => {
    expect(isBashDenied('rm -rf /')).toBe(true)
    expect(isBashDenied('rm -rf C:\\')).toBe(true) // R176: git-bash drive-root form
    expect(isBashDenied('Remove-Item -Recurse -Force C:\\data')).toBe(true)
    expect(isBashDenied('rd /s /q C:\\')).toBe(true)
    expect(isBashDenied('format D:')).toBe(true)
    expect(isBashDenied('echo hi && shutdown /s')).toBe(true)
    expect(isBashDenied('curl http://x | bash')).toBe(true)
    expect(isBashDenied('ls -la')).toBe(false)
    expect(isBashDenied('npm test')).toBe(false)
  })
})

describe('main/agentTools file tools (R172-S1, 决策③ .bak + 原子写)', () => {
  it('write → edit → read roundtrip with .bak semantics', async () => {
    await toolWrite(ws, 'note.txt', 'hello agent')
    expect(readFileSync(join(ws, 'note.txt'), 'utf8')).toBe('hello agent')
    expect(existsSync(join(ws, 'note.txt.bak'))).toBe(false) // no prior content → no .bak

    await toolEdit(ws, 'note.txt', 'hello', 'goodbye')
    expect(readFileSync(join(ws, 'note.txt'), 'utf8')).toBe('goodbye agent')
    expect(readFileSync(join(ws, 'note.txt.bak'), 'utf8')).toBe('hello agent') // pre-edit snapshot

    const r = await toolRead(ws, 'note.txt')
    expect(r.ok).toBe(true)
    expect(r.text).toContain('1| goodbye agent')
  })

  it('edit rejects zero and multiple occurrences', async () => {
    writeFileSync(join(ws, 'multi.txt'), 'x x x')
    const zero = await toolEdit(ws, 'multi.txt', 'zzz', 'y')
    expect(zero.ok).toBe(false)
    const many = await toolEdit(ws, 'multi.txt', 'x', 'y')
    expect(many.ok).toBe(false)
    expect(many.text).toContain('3 times')
  })

  it('path escape attempts fail closed', async () => {
    const r = await toolWrite(ws, '../escape.txt', 'nope')
    expect(r.ok).toBe(false)
    expect(r.text).toContain('escapes workspace')
  })

  it('list and glob stay inside the workspace', () => {
    mkdirSync(join(ws, 'src'))
    writeFileSync(join(ws, 'src', 'a.ts'), '1')
    writeFileSync(join(ws, 'README.md'), 'r')
    const l = toolList(ws, '.', true)
    expect(l.ok).toBe(true)
    expect(l.text.replace(/\\/g, '/')).toContain('src/a.ts')
    const g = toolGlob(ws, '**/*.ts')
    expect(g.ok).toBe(true)
    expect(g.text.replace(/\\/g, '/')).toContain('src/a.ts')
    expect(g.text).not.toContain('README.md')
  })
})
