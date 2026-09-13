import { describe, it, expect } from 'vitest'
import { validateChatMessages } from '../../src/shared/aiChatValidation'

const ok = [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }]

describe('validateChatMessages (R88)', () => {
  it('accepts a valid conversation', () => {
    expect(validateChatMessages(ok)).toEqual(ok)
  })
  it('rejects non-array / bad role / bad content / missing fields', () => {
    expect(validateChatMessages('nope')).toBeNull()
    expect(validateChatMessages([{ role: 'admin', content: 'x' }])).toBeNull()
    expect(validateChatMessages([{ role: 'user', content: 42 }])).toBeNull()
    expect(validateChatMessages([{ role: 'user' }])).toBeNull()
  })
  it('rejects empty, >40 turns or >32k chars per turn', () => {
    expect(validateChatMessages([])).toBeNull()
    expect(validateChatMessages(Array.from({ length: 41 }, () => ({ role: 'user', content: 'x' })))).toBeNull()
    expect(validateChatMessages([{ role: 'user', content: 'x'.repeat(32_001) }])).toBeNull()
    expect(validateChatMessages(Array.from({ length: 40 }, () => ({ role: 'user', content: 'x' })))).not.toBeNull()
  })
})
