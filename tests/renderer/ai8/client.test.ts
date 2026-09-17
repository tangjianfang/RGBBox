import { describe, it, expect } from 'vitest'
import { AI8_VIDEO_PROVIDERS, Ai8Error, buildChatBody, buildVideoBody, parseAi8SseLine, parseDrawTemplate, parseVideoTemplate } from '../../../src/shared/ai8Client'

describe('renderer/ai8 client (R110)', () => {
  it('parses delta payloads and accumulates the full text', () => {
    let full = ''
    const first = parseAi8SseLine('{"code":0,"data":"你好"}', full)
    expect(first.event).toEqual({ type: 'delta', text: '你好' })
    expect(first.stop).toBe(false)
    full = first.full
    const second = parseAi8SseLine('{"code":0,"data":"，世界"}', full)
    expect(second.full).toBe('你好，世界')
  })

  it('maps [DONE] and mid-stream errors to terminal events', () => {
    const done = parseAi8SseLine('[DONE]', 'abc')
    expect(done.event.type).toBe('done')
    expect(done.stop).toBe(true)
    const failed = parseAi8SseLine('{"code":40901,"msg":"额度不足"}', '')
    expect(failed.event).toEqual({ type: 'error', message: '额度不足' })
    expect(failed.stop).toBe(true)
  })

  it('emits extra events for object payloads and skips malformed lines', () => {
    const extra = parseAi8SseLine('{"code":0,"data":{"tokens":12}}', '')
    expect(extra.event.type).toBe('extra')
    const junk = parseAi8SseLine('not-json', 'kept')
    expect(junk.event.type).toBe('done')
    expect(junk.stop).toBe(false)
    expect(junk.full).toBe('kept')
  })

  it('Ai8Error carries the business code', () => {
    const error = new Ai8Error(2, '登录已过期')
    expect(error.code).toBe(2)
    expect(error.message).toBe('登录已过期')
  })
})

describe('renderer/ai8 buildChatBody (R116.1 round 2 — live-site protocol)', () => {
  it('sends exactly the site frontend fields — model lives on the SESSION, not the body', () => {
    const body = buildChatBody(7, 'hi', { thinking: true })
    expect(Object.keys(body).sort()).toEqual(['files', 'nativeToolOptions', 'nativeTools', 'reasoningEffort', 'sessionId', 'text', 'thinking', 'webSearch'])
    expect('model' in body).toBe(false) // extra key → strict decoder 400 (silent network error)
    expect(body.text).toBe('hi')
    expect(body.sessionId).toBe(7)
    expect(body.thinking).toBe(true)
    expect(body.webSearch).toBe(false)
    expect(body.files).toEqual([])
  })

  it('keeps a numeric sessionId as a number and adds systemPrompt only when set', () => {
    const body = buildChatBody('123', 'q', { files: [{ name: 'a.png', url: 'data:image/png;base64,x' }], systemPrompt: 'be brief' })
    expect(body.sessionId).toBe('123')
    expect(body.files).toEqual([{ name: 'a.png', url: 'data:image/png;base64,x' }])
    expect(body.systemPrompt).toBe('be brief')
  })
})

describe('renderer/ai8 parseDrawTemplate (R120 — live /draw/template shape)', () => {
  // trimmed from the live 2026-09-17 response: models live under cms[].models[]
  // grouped per provider, meta is null, no top-level models[]
  const liveShape = {
    billing: {},
    meta: null,
    cms: [
      {
        name: '即梦',
        platform: 'jimeng',
        models: [
          { label: '4.0', value: 'doubao-seedream-4-0' },
          { label: '4.5', value: 'doubao-seedream-4-5' },
          { label: '5.0', value: 'doubao-seedream-5-0' },
        ],
      },
      {
        name: '千问',
        platform: 'qwen',
        models: [
          { label: 'max', value: 'qwen-image-max' },
          { label: 'turbo', value: 'z-image-turbo' },
        ],
      },
    ],
  }

  it('groups the live cms shape per provider and defaults to the first concrete model', () => {
    const parsed = parseDrawTemplate(liveShape)
    expect(parsed.groups.map((g) => g.provider)).toEqual(['即梦', '千问'])
    expect(parsed.groups[0].models.map((m) => m.value)).toEqual(['doubao-seedream-4-0', 'doubao-seedream-4-5', 'doubao-seedream-5-0'])
    expect(parsed.defaultModel).toBe('doubao-seedream-4-0')
  })

  it('falls back to the legacy flat models[] + meta.defInput shape (e2e mock era)', () => {
    const parsed = parseDrawTemplate({ models: [{ label: 'MJ 绘画', value: 'mj' }], meta: { defInput: { model: 'mj' } } })
    expect(parsed.groups).toEqual([{ provider: '', models: [{ label: 'MJ 绘画', value: 'mj' }] }])
    expect(parsed.defaultModel).toBe('mj')
  })

  it('returns empty groups (caller shows the error placeholder) for unknown shapes', () => {
    expect(parseDrawTemplate({ billing: {}, state: {} }).groups).toEqual([])
    expect(parseDrawTemplate(null).groups).toEqual([])
    // entries without a usable value are dropped; a provider left with none is skipped
    expect(parseDrawTemplate({ cms: [{ name: '空', models: [{ label: 'x' }] }, { name: 'ok', models: [{ label: 'a', value: 'a' }] }] }).groups).toEqual([
      { provider: 'ok', models: [{ label: 'a', value: 'a' }] },
    ])
  })
})

describe('renderer/ai8 video protocol (R121 — live video-*.js bundles)', () => {
  it('buildVideoBody matches the site frontend shape exactly', () => {
    const body = buildVideoBody({ model: 'kling', version: 'v3', prompt: '一只奔跑的猫' })
    expect(body).toEqual({ model: 'kling', action: 'all', isPublic: false, prompt: '一只奔跑的猫', params: { version: 'v3' } })
    expect(Object.keys(body).sort()).toEqual(['action', 'isPublic', 'model', 'params', 'prompt'])
  })

  it('parseVideoTemplate keeps only state-listed providers and filters versions', () => {
    const parsed = parseVideoTemplate({
      notice: '<p>视频板块正在内测，<span>每日 3 次</span>。</p>',
      state: [{ id: 'kling', versions: { v3: true, 'v3-turbo': true } }, { id: 'sora' }, { id: 'not-a-real-provider' }],
    })
    expect(parsed.providers.map((p) => p.id)).toEqual(['sora', 'kling']) // catalog order, not state order
    expect(parsed.providers[0].versions).toEqual(AI8_VIDEO_PROVIDERS.find((p) => p.id === 'sora')?.versions)
    expect(parsed.providers[1].versions.map((v) => v.value)).toEqual(['v3-turbo', 'v3'])
    expect(parsed.notice).toBe('视频板块正在内测，每日 3 次。')
  })

  it('parseVideoTemplate falls back to the full catalog when state is empty (anonymous)', () => {
    const parsed = parseVideoTemplate({ state: [], subs: {} })
    expect(parsed.providers.map((p) => p.id)).toEqual(AI8_VIDEO_PROVIDERS.map((p) => p.id))
    expect(parseVideoTemplate(null).notice).toBe('')
  })

  it('catalog mirrors the live provider chunk values', () => {
    const byId = Object.fromEntries(AI8_VIDEO_PROVIDERS.map((p) => [p.id, p.versions.map((v) => v.value)]))
    expect(byId.seedance).toContain('2.0')
    expect(byId.cogvideox).toEqual(['3', '2', '1'])
    expect(byId.veo).toContain('veo3.1')
    expect(byId.xai).toEqual(['grok-imagine-video'])
    expect(byId.wan).toContain('wan2.7')
  })
})
