import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// R222.4(T3 缺口): systemSettingsStore 的「坏文件→覆盖不合并→.bad 抢救」
// 语义专测——R221.1 只锁了 atomicJson 原语,本模块接线此前零专测。
const TEST_USER_DATA = mkdtempSync(join(tmpdir(), 'rgbbox-syssettings-'))
mkdirSync(join(TEST_USER_DATA, 'config'), { recursive: true })
vi.mock('electron', () => ({
  app: { getPath: (name: string) => (name === 'userData' ? TEST_USER_DATA : tmpdir()) },
}))

const { loadSystemSettings, saveSystemSettings } = await import('../../src/main/systemSettingsStore')
const settingsPath = () => join(TEST_USER_DATA, 'config', 'system.json')

afterEach(() => { rmSync(TEST_USER_DATA, { recursive: true, force: true }); mkdirSync(join(TEST_USER_DATA, 'config'), { recursive: true }) })

describe('main/systemSettingsStore R221.1 接线语义', () => {
  it('好文件:load 原值;save 浅合并保留未提交字段', async () => {
    writeFileSync(settingsPath(), JSON.stringify({ powerSaveBlock: true, ai: { baseUrl: 'x', apiKey: 'enc:v1:K', model: 'm' } }), 'utf-8')
    const loaded = await loadSystemSettings()
    expect(loaded.powerSaveBlock).toBe(true)
    const merged = await saveSystemSettings({ screensaver: { enabled: true, idleMinutes: 5 } })
    expect(merged.powerSaveBlock).toBe(true) // 未提交字段保留
    expect(merged.screensaver?.enabled).toBe(true)
  })

  it('坏文件:save 不与 {} 合并丢字段——本次显式提交为准 + 原文件抢救为 .bad', async () => {
    const bad = '{"ai":{"apiKey":"enc:v1:SECRET-truncated"'
    writeFileSync(settingsPath(), bad, 'utf-8')
    const merged = await saveSystemSettings({ powerSaveBlock: false })
    expect(merged.powerSaveBlock).toBe(false)
    // 磁盘:新文件完整 JSON;坏内容在 .bad 可抢救
    expect(JSON.parse(readFileSync(settingsPath(), 'utf-8'))).toEqual({ powerSaveBlock: false })
    expect(readFileSync(`${settingsPath()}.bad`, 'utf-8')).toBe(bad)
  })

  it('缺文件:save 直接建立(无 .bad)', async () => {
    const merged = await saveSystemSettings({ powerSaveBlock: true })
    expect(merged).toEqual({ powerSaveBlock: true })
    expect(existsSync(`${settingsPath()}.bad`)).toBe(false)
    expect(JSON.parse(readFileSync(settingsPath(), 'utf-8'))).toEqual({ powerSaveBlock: true })
  })

  it('坏文件 load 回空默认(读取侧不抛、不复活残值)', async () => {
    writeFileSync(settingsPath(), '[]', 'utf-8') // 根为数组也是 bad
    const loaded = await loadSystemSettings()
    expect(loaded).toEqual({})
  })

  // ── R267(REVIEW-main-ipc W2): 读-合并-写串行化 ─────────────────────────
  // ipcMain 不串行化 invoke:电源/热键/屏保/定时关机/AI 画像多路并发 save 时,
  // 裸的 load→浅合并→write 基于同一份旧值各写各的字段,后写者整对象覆盖前者
  // (跨字段丢更新)。锁死:并发 save 不同字段 → 全部落盘。
  it('R267: 并发 save 五个不同字段 → 无跨字段丢更新(全部落盘)', async () => {
    const expected = {
      powerSaveBlock: true,
      shutdownDeadline: 1760000000000,
      screensaver: { enabled: true, idleMinutes: 5 },
      snip: { hotkey: 'Ctrl+Alt+S' },
      ai: { baseUrl: 'https://u', apiKey: 'enc:v1:K', model: 'gpt-x' },
    }
    await Promise.all([
      saveSystemSettings({ powerSaveBlock: expected.powerSaveBlock }),
      saveSystemSettings({ shutdownDeadline: expected.shutdownDeadline }),
      saveSystemSettings({ screensaver: expected.screensaver }),
      saveSystemSettings({ snip: expected.snip }),
      saveSystemSettings({ ai: expected.ai }),
    ])
    expect(await loadSystemSettings()).toEqual(expected)
    // 落盘的也必须是五字段全量(不是内存合并态)
    expect(JSON.parse(readFileSync(settingsPath(), 'utf-8'))).toEqual(expected)
  })

  it('R267: save 完成前并发 load 不会读到半合并态(队列内原子可见)', async () => {
    writeFileSync(settingsPath(), JSON.stringify({ powerSaveBlock: true }), 'utf-8')
    const save = saveSystemSettings({ snip: { hotkey: 'Ctrl+Alt+S' } })
    const loads = await Promise.all([loadSystemSettings(), loadSystemSettings(), save.then(() => loadSystemSettings())])
    // save 前的 load 要么旧值要么新值,绝不含「只剩 snip」的半合并态
    for (const s of loads.slice(0, 2)) {
      expect(s.powerSaveBlock === true || s.powerSaveBlock === undefined).toBe(true)
      if (s.snip) expect(s.powerSaveBlock).toBe(true) // 有新字段就必须还有旧字段
    }
    expect(loads[2]).toEqual({ powerSaveBlock: true, snip: { hotkey: 'Ctrl+Alt+S' } })
  })
})
