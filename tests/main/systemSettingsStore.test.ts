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
})
