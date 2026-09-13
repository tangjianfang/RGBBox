import { describe, it, expect, vi } from 'vitest'

// setup.ts 全局 vi.mock 了 i18n 模块（只导出 useI18n 桩）——importActual 取真实词表
const { translations } = await vi.importActual<typeof import('../../src/renderer/src/i18n')>('../../src/renderer/src/i18n')

// R85 壳层新 key 清单——EN/ZH 必须同时有值（缺 key 由 TranslationTable 类型 + 本测试双保险）
const SHELL_KEYS = [
  'nav.dashboard', 'nav.settings', 'nav.model3d', 'nav.ai',
  'dash.desc.ai',
  'ai.privacyNote', 'ai.privacyNotePlain', 'ai.lab.keyUnreadable',
  'ai.lab.provider', 'ai.lab.providerCustom',
  'ai.lab.tab.config', 'ai.lab.tab.chat', 'ai.lab.tab.ocr', 'ai.lab.tab.audio',
  'ai.lab.audio.title.vad', 'ai.lab.audio.title.ast',
  'ai.lab.audio.desc.vad', 'ai.lab.audio.desc.ast',
  'ai.lab.audio.download', 'ai.lab.audio.progress', 'ai.lab.audio.record', 'ai.lab.audio.recording',
  'ai.lab.audio.needModel', 'ai.lab.audio.errorInference', 'ai.lab.audio.vad.speech', 'ai.lab.audio.vad.quiet', 'ai.lab.audio.vad.prob',
  'ai.lab.audio.live', 'ai.lab.audio.liveOn', 'ai.lab.audio.source', 'ai.lab.audio.source.mic', 'ai.lab.audio.source.system',
  'ai.lab.audio.desc.live', 'ai.lab.audio.vad.hint', 'ai.lab.audio.ast.hint',
  'ai.lab.audio.intro', 'ai.lab.audio.vad.reading', 'ai.lab.audio.ast.reading',
  'ai.lab.audio.level', 'ai.lab.audio.levelZero',
  'ai.lab.audio.source.tone', 'ai.lab.audio.pipeline',
  'ai.lab.audio.stage.idle', 'ai.lab.audio.stage.capturing', 'ai.lab.audio.stage.inferring', 'ai.lab.audio.stage.results',
  'ai.lab.audio.stage1', 'ai.lab.audio.stage2', 'ai.lab.audio.stage3', 'ai.lab.audio.stage4',
  'ai.lab.audio.selfTest', 'ai.lab.audio.selfTestModels', 'ai.lab.audio.batches',
  'ai.lab.audio.st.feed', 'ai.lab.audio.st.resample', 'ai.lab.audio.st.rms', 'ai.lab.audio.st.vad', 'ai.lab.audio.st.ast',
  'ai.lab.audio.reading',
  'ai.lab.audio.ast.running', 'ai.lab.audio.ast.waiting', 'ai.lab.audio.ast.cadence',
  'ai.lab.audio.modelReady', 'ai.lab.audio.modelFailed', 'ai.lab.audio.recheck',
  'player.aiListen.title', 'player.aiListen.toggle', 'player.aiListen.listening',
  'player.aiListen.needModel', 'player.aiListen.errSource', 'player.aiListen.errPermission',
  'ai.lab.profileNew', 'ai.lab.profileDelete', 'ai.lab.setActive', 'ai.lab.activeNow', 'ai.lab.name',
  'ai.lab.status.connected', 'ai.lab.status.disconnected', 'ai.lab.status.failed',
  'ai.lab.test', 'ai.lab.showKey', 'ai.lab.hideKey', 'ai.lab.save',
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
