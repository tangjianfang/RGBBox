import { describe, it, expect, vi } from 'vitest'

// setup.ts 全局 vi.mock 了 i18n 模块（只导出 useI18n 桩）——importActual 取真实词表
const { translations } = await vi.importActual<typeof import('../../src/renderer/src/i18n')>('../../src/renderer/src/i18n')

// R85 壳层新 key 清单——EN/ZH 必须同时有值（缺 key 由 TranslationTable 类型 + 本测试双保险）
const SHELL_KEYS = [
  'nav.dashboard', 'nav.settings', 'nav.model3d', 'nav.ai',
  'dash.desc.ai',
  'ai.privacyNote', 'ai.privacyNotePlain', 'ai.lab.keyUnreadable',
  'ai.lab.provider', 'ai.lab.providerCustom',
  'ai.lab.group.connection', 'ai.lab.group.config', 'ai.lab.group.chat', 'ai.lab.group.ocr',
  'ai.lab.status.connected', 'ai.lab.status.disconnected', 'ai.lab.status.failed',
  'ai.lab.test', 'ai.lab.showKey', 'ai.lab.hideKey', 'ai.lab.save', 'ai.lab.reset',
  'ai.lab.chat.placeholder', 'ai.lab.chat.send', 'ai.lab.chat.clear',
  'ai.lab.ocr.input', 'ai.lab.ocr.result', 'ai.lab.ocr.cleanup', 'ai.lab.ocr.translate',
  'dash.group.status', 'dash.group.modules',
  'a11y.moduleNav', 'a11y.toggleEngine',
  'dash.card.engine', 'dash.card.fps', 'dash.card.effect', 'dash.card.overlay', 'dash.card.audio',
  'dash.desc.workspace', 'dash.desc.effects', 'dash.desc.video', 'dash.desc.audio',
  'dash.desc.model3d', 'dash.desc.games', 'dash.desc.diagnostics', 'dash.desc.architecture',
  'menu.settings', 'menu.about', 'menu.login', 'menu.profile', 'menu.logout', 'menu.comingSoon',
  'settings.group.run', 'settings.group.screensaver', 'settings.group.hotkey'
] as const

describe('i18n shell keys (R85)', () => {
  it('every shell key exists in both en and zh tables', () => {
    for (const key of SHELL_KEYS) {
      expect(translations.en[key], `en missing: ${key}`).toBeTruthy()
      expect(translations.zh[key], `zh missing: ${key}`).toBeTruthy()
    }
  })
})
