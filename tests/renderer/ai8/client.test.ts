import { describe, it, expect } from 'vitest'
import { AI8_APP_VERSION, AI8_VIDEO_PROVIDERS, Ai8Client, Ai8Error, buildChatBody, buildVideoBody, isDrawDone, isDrawLimitError, parseAi8SseLine, parseDrawImages, parseDrawTemplate, parseVideoTemplate } from '../../../src/shared/ai8Client'

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


describe('renderer/ai8 draw recovery (R122)', () => {
  it('isDrawLimitError matches only the ONE-running-task rejection wording', () => {
    expect(isDrawLimitError(new Ai8Error(1, '您当前进行中的绘图任务数量已达到上限1个，请稍后再试'))).toBe(true)
    expect(isDrawLimitError(new Ai8Error(1, '绘图任务已达上限，请稍候'))).toBe(true)
    // server-side outages must surface as-is, never adopt
    expect(isDrawLimitError(new Ai8Error(1, '没有可用的渠道，请联系管理检查本模块的渠道管理是否已配置或启用对应模型所属渠道'))).toBe(false)
    expect(isDrawLimitError(new Ai8Error(2, 'login expired'))).toBe(false)
    expect(isDrawLimitError(new TypeError('network'))).toBe(false)
    expect(isDrawLimitError('a string')).toBe(false)
  })

  it('drawRecords pages through GET /draw with token headers', async () => {
    const calls: { url: string; headers: Record<string, string> }[] = []
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (url: string, init?: { headers?: Record<string, string> }) => {
      calls.push({ url: String(url), headers: init?.headers ?? {} })
      return new Response(JSON.stringify({ code: 0, data: { records: [{ taskId: 't1' }] }, msg: '' }), { status: 200 })
    }) as typeof fetch
    try {
      const client = new Ai8Client({ token: 'tk' })
      const out = await client.drawRecords<{ records: { taskId: string }[] }>(2, 12)
      expect(out.records).toEqual([{ taskId: 't1' }])
      expect(calls[0].url).toBe('https://ai8.rcouyi.com/api/draw?page=2&size=12')
      expect(calls[0].headers.Authorization).toBe('tk')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

describe('renderer/ai8 draw result shape (R124 — live outImages/imgUrl era)', () => {
  // live evidence (2026-09-18 draw-HaYo0BLq.js): the draw page renders images
  // ONLY from outImages[] (members carry .url/.imgUrl/.smallImgUrl) or the
  // top-level imgUrl/smallImgUrl — a `list` field no longer exists in the
  // protocol layer; polling ends on truthy `end`.
  it('parseDrawImages extracts the live outImages[] shape, best URL per member', () => {
    const status = {
      end: true,
      outImages: [
        { url: 'https://cdn/a.png', imgUrl: 'https://cdn/a-full.png', smallImgUrl: 'https://cdn/a-small.png' },
        { imgUrl: 'https://cdn/b-full.png', smallImgUrl: 'https://cdn/b-small.png' },
        { smallImgUrl: 'https://cdn/c-small.png' },
        { url: '' },
      ],
    }
    expect(parseDrawImages(status)).toEqual(['https://cdn/a.png', 'https://cdn/b-full.png', 'https://cdn/c-small.png'])
  })

  it('parseDrawImages falls back to the top-level imgUrl/smallImgUrl when outImages is absent', () => {
    expect(parseDrawImages({ end: 1, imgUrl: 'https://cdn/full.png', smallImgUrl: 'https://cdn/small.png' })).toEqual(['https://cdn/full.png'])
    expect(parseDrawImages({ end: 1, smallImgUrl: 'https://cdn/small.png' })).toEqual(['https://cdn/small.png'])
  })

  it('parseDrawImages keeps the legacy list[].url shape (e2e mock + old server)', () => {
    expect(parseDrawImages({ end: true, list: [{ url: 'https://ai8.rcouyi.com/mock-draw/1.png' }, { url: '' }] })).toEqual(['https://ai8.rcouyi.com/mock-draw/1.png'])
  })

  it('parseDrawImages tolerates junk and half-formed payloads', () => {
    expect(parseDrawImages(null)).toEqual([])
    expect(parseDrawImages({ end: false })).toEqual([])
    expect(parseDrawImages({ outImages: [{}, { url: 123 }] })).toEqual([])
    expect(parseDrawImages({ outImages: 'nope', list: 42 })).toEqual([])
  })

  it('isDrawDone matches the site truthy end check, guarding string falsies', () => {
    expect(isDrawDone({ end: true })).toBe(true)
    expect(isDrawDone({ end: 1 })).toBe(true)
    expect(isDrawDone({ end: '1' })).toBe(true)
    expect(isDrawDone({ end: false })).toBe(false)
    expect(isDrawDone({ end: 0 })).toBe(false)
    expect(isDrawDone({ end: null })).toBe(false)
    expect(isDrawDone({ end: undefined })).toBe(false)
    expect(isDrawDone({ end: '0' })).toBe(false)
    expect(isDrawDone({ end: 'false' })).toBe(false)
    expect(isDrawDone({})).toBe(false)
    expect(isDrawDone(null)).toBe(false)
  })

  it('AI8_APP_VERSION tracks the live site build (3.4.1, 2026-09-18)', () => {
    expect(AI8_APP_VERSION).toBe('3.4.1')
  })
})

describe('renderer/ai8 draw anti-stuck (R125 — args body + DELETE escape hatch)', () => {
  it('parseDrawTemplate carries each cms model default area (first option value)', () => {
    const parsed = parseDrawTemplate({
      cms: [
        {
          name: '即梦',
          models: [
            {
              label: '5.0',
              value: 'doubao-seedream-5-0',
              area: [{ label: '头像', value: '1024x1024' }, { label: '4K超清', value: '4096x4096' }],
            },
            { label: '4.0', value: 'doubao-seedream-4-0' },
          ],
        },
      ],
    })
    expect(parsed.groups[0].models[0].area).toBe('1024x1024')
    expect(parsed.groups[0].models[1].area).toBeUndefined()
  })

  it('draw() assembles args:{area} when an area is given, and omits args otherwise', async () => {
    const calls: { url: string; method?: string; body?: string }[] = []
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (url: string, init?: { method?: string; body?: string }) => {
      calls.push({ url: String(url), method: init?.method, body: init?.body })
      return new Response(JSON.stringify({ code: 0, data: { taskId: 't9' }, msg: '' }), { status: 200 })
    }) as typeof fetch
    try {
      const client = new Ai8Client({ token: 'tk' })
      await client.draw({ model: 'doubao-seedream-5-0', prompt: '一只猫', area: '1024x1024' })
      await client.draw({ model: 'mj', prompt: 'a cat --ar 16:9' })
      const withArgs = JSON.parse(String(calls[0].body))
      expect(withArgs).toEqual({ action: 'IMAGINE', public: false, fast: false, model: 'doubao-seedream-5-0', prompt: '一只猫', args: { area: '1024x1024' } })
      const withoutArgs = JSON.parse(String(calls[1].body))
      expect(withoutArgs.args).toBeUndefined()
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('drawDelete issues DELETE /draw/{taskId} with auth headers (best-effort unblock)', async () => {
    const calls: { url: string; method?: string; headers?: Record<string, string> }[] = []
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (url: string, init?: { method?: string; headers?: Record<string, string> }) => {
      calls.push({ url: String(url), method: init?.method, headers: init?.headers })
      return new Response(JSON.stringify({ code: 0, data: null, msg: '' }), { status: 200 })
    }) as typeof fetch
    try {
      const client = new Ai8Client({ token: 'tk' })
      await client.drawDelete('2100954848043208704')
      expect(calls[0].url).toBe('https://ai8.rcouyi.com/api/draw/2100954848043208704')
      expect(calls[0].method).toBe('DELETE')
      expect(calls[0].headers?.Authorization).toBe('tk')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

describe('renderer/ai8 draw platform families (R128 — state[] era)', () => {
  // trimmed from the live 2026-09-19 /draw/template: cms groups + the state
  // platform catalog (billing/integral omitted for brevity)
  const liveShape = {
    cms: [{ name: '即梦', platform: 'jimeng', models: [{ label: '5.0', value: 'doubao-seedream-5-0' }] }],
    state: {
      'google-draw': { o: 1, versions: { 'nano-banana': true, 'nano-banana-2': true } },
      'openai-draw': { o: 2, versions: { 'gpt-image-1': true, 'gpt-image-2': true } },
      mj: { o: 3 },
      'volc-draw': { o: 4, versions: {} },
      'xai-draw': { o: 5, versions: { 'grok-imagine-image': true } },
      blend: { enabled: true },
      describe: { enabled: true },
    },
  }

  it('surfaces the state platform families ordered by o, each version a model', () => {
    const parsed = parseDrawTemplate(liveShape)
    expect(parsed.groups.map((g) => g.provider)).toEqual(['即梦', 'Google · Nano Banana', 'OpenAI', 'Midjourney', 'xAI Grok'])
    const openai = parsed.groups.find((g) => g.provider === 'OpenAI')
    expect(openai?.models.map((m) => m.value)).toEqual(['gpt-image-1', 'gpt-image-2'])
    expect(openai?.models[0].platform).toBe('openai-draw')
    expect(openai?.models[0].area).toBeUndefined()
    const mj = parsed.groups.find((g) => g.provider === 'Midjourney')
    expect(mj?.models).toEqual([{ label: 'Midjourney', value: 'mj', platform: 'mj' }])
  })

  it('skips volc-draw (state versions empty — values live in site chunks, unverified) and action switches', () => {
    const parsed = parseDrawTemplate(liveShape)
    expect(parsed.groups.some((g) => g.provider.includes('火山'))).toBe(false)
    expect(parsed.groups.some((g) => g.provider === 'blend' || g.provider === 'describe')).toBe(false)
  })

  it('draw() sends model:<platform> + args:{version,area:auto} for platform models; mj sends no args', async () => {
    const calls: { body?: string }[] = []
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (_url: string, init?: { body?: string }) => {
      calls.push({ body: init?.body })
      return new Response(JSON.stringify({ code: 0, data: { taskId: 't' }, msg: '' }), { status: 200 })
    }) as typeof fetch
    try {
      const client = new Ai8Client({ token: 'tk' })
      await client.draw({ model: 'openai-draw', prompt: 'a cat', version: 'gpt-image-2' })
      await client.draw({ model: 'mj', prompt: 'a cat --ar 16:9' })
      expect(JSON.parse(String(calls[0].body))).toEqual({ action: 'IMAGINE', public: false, fast: false, model: 'openai-draw', prompt: 'a cat', args: { version: 'gpt-image-2', area: 'auto' } })
      expect(JSON.parse(String(calls[1].body))).toEqual({ action: 'IMAGINE', public: false, fast: false, model: 'mj', prompt: 'a cat --ar 16:9' })
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
