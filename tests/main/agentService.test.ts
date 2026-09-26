import { describe, expect, it } from 'vitest'
import { buildAi8TurnPrompt, parseReactToolCall } from '../../src/main/agentService'
import { buildWavHeader, floatTo16BitPcm, segmentsToWav } from '../../src/main/ttsWav'

describe('main/agentService parseReactToolCall (R172-S3 AI8 桥)', () => {
  it('parses a tool block and its args', () => {
    const call = parseReactToolCall('Thinking…\n```tool\n{"tool":"write","args":{"path":"a.txt","content":"hi"}}\n```')
    expect(call).toEqual({ tool: 'write', args: { path: 'a.txt', content: 'hi' } })
  })

  it('accepts json fences and name/arguments aliases', () => {
    const call = parseReactToolCall('```json\n{"name":"bash","arguments":{"command":"npm test"}}\n```')
    expect(call).toEqual({ tool: 'bash', args: { command: 'npm test' } })
  })

  it('uses the LAST parseable block when several are present', () => {
    const call = parseReactToolCall('```tool\n{"tool":"read","args":{"path":"old"}}\n```\nmid\n```tool\n{"tool":"list","args":{"path":"."}}\n```')
    expect(call?.tool).toBe('list')
  })

  it('returns null for prose-only replies (final answer)', () => {
    expect(parseReactToolCall('Done — created two files.')).toBeNull()
    expect(parseReactToolCall('```tool\nnot json\n```')).toBeNull()
    expect(parseReactToolCall('```tool\n{"novalue": true}\n```')).toBeNull()
  })
})

describe('main/agentService buildAi8TurnPrompt (R178)', () => {
  it('injects workspace + tool legend above the task text', () => {
    const out = buildAi8TurnPrompt('C:\ws', '评估这个项目')
    expect(out).toContain('[工作区] C:\ws')
    expect(out).toContain('[任务] 评估这个项目')
    expect(out).toContain('read(path)')
    expect(out).toContain('```tool')
    // order: workspace/legend BEFORE the task
    expect(out.indexOf('[工作区]')).toBeLessThan(out.indexOf('[任务]'))
  })
})

describe('main/ttsWav (R173-S2)', () => {
  it('float → int16 clamps at ±1', () => {
    const pcm = floatTo16BitPcm(new Float32Array([0, 0.5, -0.5, 2, -2]))
    expect(pcm[0]).toBe(0)
    expect(pcm[1]).toBe(Math.trunc(0.5 * 0x7fff))
    expect(pcm[2]).toBe(-0.5 * 0x8000)
    expect(pcm[3]).toBe(0x7fff)
    expect(pcm[4]).toBe(-0x8000)
  })

  it('WAV header fields for 24kHz mono 16-bit', () => {
    const h = buildWavHeader(48000, 24000)
    expect(h.toString('latin1', 0, 4)).toBe('RIFF')
    expect(h.toString('latin1', 8, 12)).toBe('WAVE')
    expect(h.readUInt32LE(4)).toBe(36 + 48000)
    expect(h.readUInt16LE(22)).toBe(1) // mono
    expect(h.readUInt32LE(24)).toBe(24000)
    expect(h.readUInt16LE(34)).toBe(16)
    expect(h.readUInt32LE(40)).toBe(48000)
  })

  it('segmentsToWav joins with the inter-segment gap', () => {
    const wav = segmentsToWav([new Float32Array(2400), new Float32Array(2400)], 24000, 80)
    // 2400 + 1920(gap) + 2400 samples × 2 bytes + 44 header
    expect(wav.length).toBe(44 + (2400 + 1920 + 2400) * 2)
    expect(wav.toString('latin1', 0, 4)).toBe('RIFF')
  })
})
