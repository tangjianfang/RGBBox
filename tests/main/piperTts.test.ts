// R212: Piper 中文引擎——ids 构造/状态清单纯函数单测。
import { describe, expect, it } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { piperPhonemesToIds, ttsModelStatus } from '../../src/main/ttsService'

const ID_MAP: Record<string, number[]> = {
  '^': [1], _: [0], $: [2],
  n: [10], i: [11], '2': [12], 'ɕ': [13], 'ɑ': [14], 'ˈ': [15], 'ʊ': [16],
}

describe('R212 piperPhonemesToIds', () => {
  it('BOS+每音素后接 PAD+EOS(Piper intersperse 惯例)', () => {
    // "ni2" → ^ n _ i _ 2 _ $
    expect(piperPhonemesToIds('ni2', ID_MAP)).toEqual([1, 10, 0, 11, 0, 12, 0, 2])
  })
  it('表外字符(标点/未收录 IPA)跳过不断链', () => {
    expect(piperPhonemesToIds('n!ɕ', ID_MAP)).toEqual([1, 10, 0, 13, 0, 2])
  })
  it('空串只剩 BOS/EOS;合成侧按 ≤2 跳过', () => {
    expect(piperPhonemesToIds('', ID_MAP)).toEqual([1, 2])
  })
})

describe('R212 ttsModelStatus piper 分支', () => {
  const root = join(tmpdir(), `rgbbox-piper-test-${Date.now()}`)
  it('文件齐备才 complete(尺寸精确对账)', () => {
    const dir = join(root, 'piper-zh')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'zh_CN-huayan-medium.onnx'), Buffer.alloc(63_201_294))
    writeFileSync(join(dir, 'zh_CN-huayan-medium.onnx.json'), Buffer.alloc(4822))
    const st = ttsModelStatus(root)
    expect(st.piper?.complete).toBe(true)
    expect(st.piper?.files).toHaveLength(2)
  })
  it('缺文件/错尺寸 → 不 complete', () => {
    const st = ttsModelStatus(join(tmpdir(), `rgbbox-piper-empty-${Date.now()}`))
    expect(st.piper?.complete).toBe(false)
    expect(st.piper?.files.every((f) => !f.present)).toBe(true)
  })
  it('kokoro 侧状态不受 piper 扩展影响', () => {
    const st = ttsModelStatus(join(tmpdir(), `rgbbox-piper-empty2-${Date.now()}`))
    expect(st.complete).toBe(false)
    expect(st.files.length).toBeGreaterThan(0)
  })
})

process.on('exit', () => { try { rmSync(root, { recursive: true, force: true }) } catch { /* */ } })
