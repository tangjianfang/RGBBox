import { describe, it, expect, vi } from 'vitest'

// setup.ts 全局 vi.mock 了 i18n 模块（只导出 useI18n 桩）——importActual 取真实词表
const { translations } = await vi.importActual<typeof import('../../src/renderer/src/i18n')>('../../src/renderer/src/i18n')

// R85 壳层新 key 清单——EN/ZH 必须同时有值（缺 key 由 TranslationTable 类型 + 本测试双保险）
const SHELL_KEYS = [
  'nav.dashboard', 'nav.settings', 'nav.model3d',
  'dash.section.core', 'dash.section.create', 'dash.section.tools',
  'dash.desc.workspace', 'dash.desc.effects', 'dash.desc.video', 'dash.desc.audio',
  'dash.desc.model3d', 'dash.desc.games', 'dash.desc.diagnostics', 'dash.desc.architecture',
  'dash.closeTab', 'dash.opened', 'dash.status.effect', 'dash.status.overlay',
  'menu.settings', 'menu.about', 'menu.login', 'menu.profile', 'menu.logout', 'menu.comingSoon',
  'settings.group.run', 'settings.group.screensaver', 'settings.group.hotkey', 'settings.group.ai'
] as const

describe('i18n shell keys (R85)', () => {
  it('every shell key exists in both en and zh tables', () => {
    for (const key of SHELL_KEYS) {
      expect(translations.en[key], `en missing: ${key}`).toBeTruthy()
      expect(translations.zh[key], `zh missing: ${key}`).toBeTruthy()
    }
  })
})
