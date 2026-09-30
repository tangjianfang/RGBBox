// R211: 游戏引导/结算 i18n 键完整性——防「界面显示键名原文」回归。
// 背景:渲染契约是 t(`games.onboard.${screen}.${step}`) 与 t(recapCoachKey(...)) ;
// 历史上 i18n 表用短名(sw/te/sl)而 screen 值是 survival/tetris/slash,
// recapCoachKey 返回短键而渲染再拼一层前缀——两处都导致用户看到键名原文。
import { describe, expect, it, vi } from 'vitest'

// setup.ts 全局 vi.mock 了 i18n 模块（只导出 useI18n 桩）——importActual 取真实词表
const { translations } = await vi.importActual<typeof import('../../../src/renderer/src/i18n')>('../../../src/renderer/src/i18n')
const { recapCoachKey } = await vi.importActual<typeof import('../../../src/renderer/src/games/juice')>('../../../src/renderer/src/games/juice')

/** 与 MiniGamesView 渲染侧的 screen 值严格一致(hub enterGame 的入参)。 */
const SCREENS = ['td', 'survival', 'tetris', 'slash'] as const
const RECAP_KEYS = [
  recapCoachKey(1, null),
  recapCoachKey(1, 0),
  recapCoachKey(2, 1),
  recapCoachKey(1, 1),
  recapCoachKey(0, 10),
]

describe('R211 games i18n 键完整性(引导/结算)', () => {
  for (const lang of ['en', 'zh'] as const) {
    it(`${lang}: 四作 3 步引导键 games.onboard.<screen>.<n> 全部存在且非空`, () => {
      for (const screen of SCREENS) {
        for (let step = 1; step <= 3; step++) {
          const key = `games.onboard.${screen}.${step}` as keyof typeof translations.zh
          const value = translations[lang][key]
          expect(value, `${lang} 缺 ${key}`).toBeTruthy()
          expect(value, `${lang} 的 ${key} 是键名原文`).not.toContain('games.onboard')
        }
      }
    })

    it(`${lang}: recapCoachKey 返回的完整键在表中存在(双前缀防回归)`, () => {
      for (const key of RECAP_KEYS) {
        expect(key.startsWith('games.recap.'), `${key} 应为完整键`).toBe(true)
        const value = translations[lang][key as keyof typeof translations.zh]
        expect(value, `${lang} 缺 ${key}`).toBeTruthy()
        expect(value, `${lang} 的 ${key} 是键名原文`).not.toContain('games.recap.')
      }
    })
  }

  it('recapCoachKey 四分支语义:首局/进步/接近/需练习', () => {
    expect(recapCoachKey(1, null)).toBe('games.recap.firstRun')
    expect(recapCoachKey(2, 1)).toBe('games.recap.improved')
    expect(recapCoachKey(85, 100)).toBe('games.recap.close')
    expect(recapCoachKey(10, 100)).toBe('games.recap.practice')
  })
})
