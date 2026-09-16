// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  DEFAULT_PREFS,
  groupModelsByProvider,
  readPrefs,
  readSessions,
  titleFromContent,
  writePrefs,
  writeSessions,
  type Ai8Session,
} from '../../../src/renderer/src/ai8/localStore'

describe('renderer/ai8 localStore (R113)', () => {
  beforeEach(() => localStorage.clear())

  it('groupModelsByProvider caps each provider at 6 newest', () => {
    const models = [
      ...Array.from({ length: 9 }, (_, i) => ({ label: `o${i}`, value: `openai_chat::m${i}`, attr: { providerKey: 'openai_chat' } })),
      ...Array.from({ length: 2 }, (_, i) => ({ label: `g${i}`, value: `gemini_chat::m${i}`, attr: { providerKey: 'gemini_chat' } })),
    ]
    const groups = groupModelsByProvider(models)
    const openai = groups.find((g) => g.provider === 'openai_chat')
    expect(openai?.models.length).toBe(6)
    expect(openai?.models[0].value).toBe('openai_chat::m0')
    const gemini = groups.find((g) => g.provider === 'gemini_chat')
    expect(gemini?.models.length).toBe(2)
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
})
