// R193: per-key server sessions, history replay, unclosed-<think> stripping.
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

// minimal local AI8 mock: /chat/session returns incrementing ids; /chat/completions
// records the request body and streams one delta. Session 9xx streams think text.
let server: Server
let baseUrl = ''
let sessionCreates: Array<Record<string, unknown>> = []
let chatBodies: Array<{ sessionId: unknown; text: string }> = []
let nextId = 100
let replyScript: string[] = []

beforeEach(async () => {
  sessionCreates = []
  chatBodies = []
  nextId = 100
  replyScript = []
  server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      const parsed = body === '' ? {} : JSON.parse(body)
      if (req.url === '/chat/session') {
        sessionCreates.push(parsed)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ code: 0, data: { id: nextId++ } }))
        return
      }
      if (req.url === '/chat/completions') {
        chatBodies.push({ sessionId: parsed.sessionId, text: parsed.text })
        const reply = replyScript.length > 0 ? replyScript.shift()! : 'ok'
        res.writeHead(200, { 'Content-Type': 'text/event-stream' })
        // wire format per parseAi8SseLine: {"code":0,"data":"chunk"}
        res.write(`data: ${JSON.stringify({ code: 0, data: reply })}\n\n`)
        res.write('data: [DONE]\n\n')
        res.end()
        return
      }
      res.writeHead(404).end()
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  process.env.RGBBOX_AI8_BASE_URL = baseUrl
  const mod = await import('../../src/main/ai8Provider')
  mod.resetAi8ToolSession()
})

afterEach(async () => {
  delete process.env.RGBBOX_AI8_BASE_URL
  await new Promise<void>((r) => server.close(() => r()))
})

const S = { apiKey: 'tok', model: 'm1' }

describe('R193 buildReplayContext (pure)', () => {
  it('returns empty for a one-shot exchange; renders multi-turn history with per-entry caps', async () => {
    const { buildReplayContext } = await import('../../src/main/ai8Provider')
    expect(buildReplayContext([{ role: 'user', content: 'hi' }])).toBe('')
    const out = buildReplayContext([
      { role: 'system', content: 'sys' },
      { role: 'user', content: '第一个任务' },
      { role: 'assistant', content: '答复' },
      { role: 'user', content: 'TOOL_RESULT read: ...' },
      { role: 'assistant', content: '结论' },
      { role: 'user', content: '继续' },
    ])
    expect(out).toContain('用户: 第一个任务')
    expect(out).toContain('助手: 答复')
    expect(out).toContain('用户: TOOL_RESULT read: ...')
    expect(out).toContain('用户: 继续')
    // system never leaks into the replay
    expect(out).not.toContain('sys')
    // total stays under the cap even with huge entries (middle dropped first)
    const huge = buildReplayContext([
      { role: 'user', content: '首问' },
      ...Array.from({ length: 40 }, (_, i) => ({ role: 'assistant' as const, content: 'x'.repeat(900) + i })),
      { role: 'user', content: '尾问' },
    ])
    expect(huge.length).toBeLessThanOrEqual(9000 + 200)
    expect(huge).toContain('用户: 首问')
    expect(huge).toContain('用户: 尾问')
  })
})

describe('R193 ai8ChatCompletion sessions + replay', () => {
  it('different sessionKeys get different server sessions; the same key reuses one', async () => {
    const { ai8ChatCompletion } = await import('../../src/main/ai8Provider')
    const msg = [{ role: 'user' as const, content: 'q1' }]
    await ai8ChatCompletion(msg, S, { sessionKey: 's-a' })
    await ai8ChatCompletion(msg, S, { sessionKey: 's-a' })
    await ai8ChatCompletion(msg, S, { sessionKey: 's-b' })
    expect(sessionCreates.length).toBe(2) // one per key
    expect(chatBodies.map((b) => b.sessionId)).toEqual([100, 100, 101])
  })

  it('a FRESH session with prior history sends a replay preamble; cached session sends the bare message', async () => {
    const { ai8ChatCompletion } = await import('../../src/main/ai8Provider')
    const history = [
      { role: 'system' as const, content: 'sys' },
      { role: 'user' as const, content: '之前的问题' },
      { role: 'assistant' as const, content: '之前的回答' },
      { role: 'user' as const, content: '继续干' },
    ]
    await ai8ChatCompletion(history, S, { sessionKey: 's-r' })
    expect(chatBodies[0].text).toContain('[上下文回放]')
    expect(chatBodies[0].text).toContain('之前的问题')
    expect(chatBodies[0].text).toContain('继续干')
    // second call rides the same session → no replay block, just the message
    await ai8ChatCompletion([...history, { role: 'user' as const, content: 'TOOL_RESULT x' }, { role: 'user' as const, content: '再来' }], S, { sessionKey: 's-r' })
    expect(chatBodies[1].text.startsWith('再来')).toBe(true)
  })

  it('R194: onDelta forwards raw SSE chunks as they arrive', async () => {
    const { ai8ChatCompletion } = await import('../../src/main/ai8Provider')
    // two data frames streamed in order
    server.close()
    server = createServer((req, res) => {
      let body = ''
      req.on('data', (c) => { body += c })
      req.on('end', () => {
        if (req.url === '/chat/session') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ code: 0, data: { id: nextId++ } }))
          return
        }
        res.writeHead(200, { 'Content-Type': 'text/event-stream' })
        res.write(`data: ${JSON.stringify({ code: 0, data: '第一段' })}\n\n`)
        res.write(`data: ${JSON.stringify({ code: 0, data: '第二段' })}\n\n`)
        res.write('data: [DONE]\n\n')
        res.end()
      })
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    process.env.RGBBOX_AI8_BASE_URL = baseUrl
    const chunks: string[] = []
    const out = await ai8ChatCompletion([{ role: 'user', content: 'q' }], S, { sessionKey: 's-d', onDelta: (c) => chunks.push(c) })
    expect(out.ok).toBe(true)
    expect(out.text).toBe('第一段第二段')
    expect(chunks).toEqual(['第一段', '第二段'])
  })

  it('strips an UNCLOSED <think> block from a cut stream', async () => {
    const { ai8ChatCompletion } = await import('../../src/main/ai8Provider')
    replyScript = ['<think>推理中被打断的思考', '<think>完整思考</think>可见回答']
    const out1 = await ai8ChatCompletion([{ role: 'user', content: 'q' }], S, { sessionKey: 's-t' })
    expect(out1.text).toBe('') // unclosed think fully stripped
    const out2 = await ai8ChatCompletion([{ role: 'user', content: 'q2' }], S, { sessionKey: 's-t' })
    expect(out2.text).toBe('可见回答')
  })
})
