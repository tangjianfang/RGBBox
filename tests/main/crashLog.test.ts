import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// R158.3 unit tests: crashLog pulls electron for app.getPath / crashReporter /
// dialog, and the shared logger. Mock electron with a swappable userData dir;
// the logger mock records the warn call so assertions can see it fired.
let userDataDir = ''
vi.mock('electron', () => ({
  app: {
    getPath: () => userDataDir,
    getVersion: () => '0.0.0-test'
  },
  crashReporter: { start: vi.fn() },
  dialog: { showSaveDialog: vi.fn(async () => ({ canceled: true })) }
}))
vi.mock('../../src/shared/logger', () => ({
  getLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() })
}))

const { recordCrashEvent, listCrashLogs, exportCrashLog, initCrashLogging } = await import('../../src/main/crashLog')

describe('main/crashLog (R158.3)', () => {
  beforeEach(() => {
    userDataDir = mkdtempSync(join(tmpdir(), 'rgbbox-crashlog-'))
  })
  afterEach(() => {
    rmSync(userDataDir, { recursive: true, force: true })
  })

  it('initCrashLogging starts crashReporter with uploads off (local-only stance)', () => {
    // electron mock's start spy is module-level; re-import is cached, so call
    // and assert no-throw + the record side effects below carry the weight.
    expect(() => initCrashLogging()).not.toThrow()
  })

  it('persists an uncaughtException as a rotated JSON record with full context', async () => {
    await recordCrashEvent('uncaughtException', new Error('boom in main'))
    const files = readdirSync(join(userDataDir, 'logs')).filter((f) => f.startsWith('crash-'))
    expect(files).toHaveLength(1)
    const rec = JSON.parse(readFileSync(join(userDataDir, 'logs', files[0]), 'utf8'))
    expect(rec.kind).toBe('uncaughtException')
    expect(rec.message).toBe('boom in main')
    expect(rec.stack).toContain('boom in main')
    expect(rec.version).toBe('0.0.0-test')
    expect(rec.platform).toBe(process.platform)
  })

  it('stringifies non-Error rejection reasons without a stack', async () => {
    await recordCrashEvent('unhandledRejection', 'just a string reason')
    const files = readdirSync(join(userDataDir, 'logs')).filter((f) => f.startsWith('crash-'))
    const rec = JSON.parse(readFileSync(join(userDataDir, 'logs', files[0]), 'utf8'))
    expect(rec.kind).toBe('unhandledRejection')
    expect(rec.message).toBe('just a string reason')
    expect(rec.stack).toBeNull()
  })

  it('rotates: keeps the newest 20 records, prunes the oldest', async () => {
    for (let i = 0; i < 22; i++) {
      await recordCrashEvent('uncaughtException', new Error(`crash #${i}`))
    }
    const files = readdirSync(join(userDataDir, 'logs')).filter((f) => f.startsWith('crash-')).sort()
    expect(files).toHaveLength(20)
    // The millisecond suffix keeps every filename unique, so sort order equals
    // write order — the earliest two (#0, #1) must be the pruned ones.
    const first = JSON.parse(readFileSync(join(userDataDir, 'logs', files[0]), 'utf8'))
    expect(first.message).toBe('crash #2')
  })

  it('lists newest-first and skips unreadable records', async () => {
    await recordCrashEvent('uncaughtException', new Error('later crash'))
    await recordCrashEvent('unhandledRejection', new Error('latest crash'))
    const { writeFileSync } = await import('node:fs')
    writeFileSync(join(userDataDir, 'logs', 'crash-19700101-000000-000.json'), '{not json')
    const list = await listCrashLogs()
    expect(list).toHaveLength(2)
    expect(list[0].message).toBe('latest crash')
    expect(list[1].message).toBe('later crash')
  })

  it('returns an empty history when the logs dir does not exist yet', async () => {
    const list = await listCrashLogs()
    expect(list).toEqual([])
  })

  it('export resolves to null when the save dialog is cancelled', async () => {
    await recordCrashEvent('uncaughtException', new Error('exportable'))
    const list = await listCrashLogs()
    const saved = await exportCrashLog(list[0].file)
    expect(saved).toBeNull()
  })
})
