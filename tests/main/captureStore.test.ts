import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  parseIndex, mergeIndex, decodePngDataUrl, nextCaptureFile,
  createCaptureStore, MAX_CAPTURES, type CaptureEntry,
} from '../../src/main/captureStore'

const mk = (id: string, ts = 0): CaptureEntry => ({ id, file: `cap-${id}.png`, name: id, ts, kind: 'photo' })

describe('captureStore pure', () => {
  it('parseIndex: valid / corrupt / non-array → parsed, [], []', () => {
    expect(parseIndex(JSON.stringify([mk('a')])).length).toBe(1)
    expect(parseIndex('not json')).toEqual([])
    expect(parseIndex(JSON.stringify({ no: 'array' }))).toEqual([])
  })

  it('mergeIndex appends, dedupes by id, FIFO-prunes beyond MAX', () => {
    const existing = Array.from({ length: MAX_CAPTURES }, (_, i) => mk(`old${i}`, i))
    const { entries, evicted } = mergeIndex(existing, [mk('new1', 999)])
    expect(entries.length).toBe(MAX_CAPTURES)
    expect(evicted.map(e => e.id)).toEqual(['old0'])   // FIFO：最旧被淘汰
    expect(entries[entries.length - 1].id).toBe('new1')
    // 同 id 重入 = 更新该条（去重），不新增
    const again = mergeIndex(existing, [mk('old5', 5000)])
    expect(again.entries.length).toBe(MAX_CAPTURES)
    expect(again.entries.find(e => e.id === 'old5')?.ts).toBe(5000)
  })

  it('decodePngDataUrl validates prefix and rejects non-strings', () => {
    const b64 = Buffer.from('fake').toString('base64')
    expect(decodePngDataUrl(`data:image/png;base64,${b64}`)).toBeTruthy()
    expect(decodePngDataUrl('data:image/jpeg;base64,AAA')).toBeNull()
    expect(decodePngDataUrl(42)).toBeNull()
    expect(decodePngDataUrl(null)).toBeNull()
  })

  it('nextCaptureFile naming', () => {
    const { id, file } = nextCaptureFile('snip', 1234)
    expect(id).toMatch(/^cap-snip-[0-9a-z]+-[0-9a-z]{4}$/)
    expect(file.endsWith('.png')).toBe(true)
  })
})

describe('captureStore fs', () => {
  it('add → list → read roundtrip; delete removes entry', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rgbbox-cap-'))
    const store = createCaptureStore(dir)
    const dataUrl = 'data:image/png;base64,' + Buffer.from('pngdata').toString('base64')
    const e = store.addPng(dataUrl, 'photo')!
    expect(e.kind).toBe('photo')
    expect(store.list().length).toBe(1)
    expect(store.read(e.id)).toBe(dataUrl)
    expect(store.delete(e.id)).toBe(true)
    expect(store.list().length).toBe(0)
    expect(store.read(e.id)).toBeNull()
  })

  it('corrupt index.json → empty list, add still works', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rgbbox-cap-'))
    mkdirSync(join(dir, 'captures'), { recursive: true })
    writeFileSync(join(dir, 'captures', 'index.json'), 'garbage{')
    const store = createCaptureStore(dir)
    expect(store.list()).toEqual([])
    expect(store.addPng('data:image/png;base64,AAAA', 'snip')).toBeTruthy()
  })

  it('importFiles copies allowed extensions only', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rgbbox-cap-'))
    const src = mkdtempSync(join(tmpdir(), 'rgbbox-src-'))
    const p1 = join(src, 'a.png'); writeFileSync(p1, 'x')
    const p2 = join(src, 'b.gif'); writeFileSync(p2, 'x')
    const store = createCaptureStore(dir)
    const imported = store.importFiles([p1, p2])
    expect(imported.length).toBe(1)
    expect(readFileSync(imported[0].file, 'utf-8')).toBe('x')
    expect(store.list().length).toBe(1)
  })
})
