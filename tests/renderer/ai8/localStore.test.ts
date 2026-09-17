// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  DEFAULT_PREFS,
  cleanGeneratedTitle,
  groupModelsByProvider,
  matchCurated,
  readPrefs,
  readSessions,
  titleFromContent,
  writePrefs,
  writeSessions,
  type Ai8Session,
} from '../../../src/renderer/src/ai8/localStore'

describe('renderer/ai8 localStore (R113)', () => {
  beforeEach(() => localStorage.clear())

  it('groupModelsByProvider caps each provider at 6, ranked by version desc', () => {
    const models = [
      { label: 'Gpt 5.4 Nano', value: 'openai_chat::nano', attr: { providerKey: 'openai_chat' } },
      { label: 'Gpt 3.8', value: 'openai_chat::old', attr: { providerKey: 'openai_chat' } },
      ...Array.from({ length: 7 }, (_, i) => ({ label: `Gpt 5.${i}`, value: `openai_chat::v${i}`, attr: { providerKey: 'openai_chat' } })),
      { label: 'Gpt 5.7', value: 'openai_chat::top', attr: { providerKey: 'openai_chat' } },
      { label: 'Gemini 3.1 Pro', value: 'gemini_chat::pro', attr: { providerKey: 'gemini_chat' } },
    ]
    const groups = groupModelsByProvider(models)
    const openai = groups.find((g) => g.provider === 'openai_chat')
    expect(openai?.models.length).toBe(6)
    // highest version first; the 3.8 legacy and the nano variant must not lead
    expect(openai?.models[0].value).toBe('openai_chat::top')
    expect(openai?.models.map((m) => m.value)).not.toContain('openai_chat::old')
    // 5.4 Nano 与 Gpt 5.4 同版本：排在同版本之后（小模型垫底），但不跌出其版本档
    const values = openai?.models.map((m) => m.value) ?? []
    expect(values.indexOf('openai_chat::v4')).toBeLessThan(values.indexOf('openai_chat::nano'))
    expect(groups.find((g) => g.provider === 'gemini_chat')?.models.length).toBe(1)
  })

  it('sessions round-trip through localStorage', () => {
    expect(readSessions()).toEqual([])
    const sessions: Ai8Session[] = [{ id: 7, model: 'ouyi_chat::ouyi-chat', title: 'hi', turns: [{ role: 'user', content: 'hi' }], createdAt: 1, updatedAt: 2 }]
    writeSessions(sessions)
    expect(readSessions()).toEqual(sessions)
  })

  it('prefs merge over defaults', () => {
    expect(readPrefs()).toEqual(DEFAULT_PREFS)
    writePrefs({ model: 'ouyi_chat::ouyi-chat', thinking: true, webSearch: false, draw: false })
    expect(readPrefs().thinking).toBe(true)
    expect(readPrefs().model).toBe('ouyi_chat::ouyi-chat')
  })

  it('titleFromContent truncates and collapses whitespace', () => {
    expect(titleFromContent('  hello   world  ')).toBe('hello world')
    expect(titleFromContent('x'.repeat(40))).toBe('x'.repeat(24) + '…')
  })

  it('matchCurated resolves live values and hides missing entries (R115.2)', () => {
    const models = [
      { label: 'Gpt 6 Astra VIP', value: 'openai_chat::gpt-6-astra-vip' },
      { label: 'Gpt 5.4 Mini', value: 'openai_chat::gpt-5.4-mini' },
      { label: 'Kimi K3', value: 'moonshot_chat::kimi-k3' },
    ]
    const curated = matchCurated(models)
    expect(curated.flagship?.map((m) => m.value)).toEqual(['openai_chat::gpt-6-astra-vip', 'moonshot_chat::kimi-k3'])
    expect(curated.fast?.map((m) => m.value)).toEqual(['openai_chat::gpt-5.4-mini'])
    expect(curated.free).toBeUndefined()
    expect(curated.budget).toBeUndefined()
  })

  it('cleanGeneratedTitle strips decorations and caps length (R116.3)', () => {
    expect(cleanGeneratedTitle('RGB 灯效调优')).toBe('RGB 灯效调优')
    expect(cleanGeneratedTitle('「RGB 灯效调优」')).toBe('RGB 灯效调优')
    expect(cleanGeneratedTitle('标题：RGB 灯效调优')).toBe('RGB 灯效调优')
    expect(cleanGeneratedTitle('### RGB 灯效调优')).toBe('RGB 灯效调优')
    expect(cleanGeneratedTitle('RGB 灯效调优。')).toBe('RGB 灯效调优')
    // multi-line: first non-empty line wins
    expect(cleanGeneratedTitle('\n\nRGB 灯效调优\n第二行解释')).toBe('RGB 灯效调优')
    // over-length title caps at 24 chars
    expect(cleanGeneratedTitle('一'.repeat(40))).toBe('一'.repeat(24))
    // nothing usable → '' (caller keeps the fallback)
    expect(cleanGeneratedTitle('')).toBe('')
    expect(cleanGeneratedTitle('。。。')).toBe('')
  })

  it('sessions round-trip the titled flag (R116.3)', () => {
    const sessions: Ai8Session[] = [{ id: 9, model: 'm', title: 't', turns: [], createdAt: 1, updatedAt: 2, titled: true }]
    writeSessions(sessions)
    expect(readSessions()[0].titled).toBe(true)
  })
})
