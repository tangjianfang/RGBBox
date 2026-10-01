import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readJsonSafe, writeJsonAtomic, preserveBadFile } from '../../src/main/atomicJson'

// ── R221.1（05 T-C1）: 原子写 + 坏 JSON 防清空 的回归锁 ──
// 评审实测清空链:截断/坏 JSON → loadSystemSettings 静默回 {} → 下次 save
// 合并写回 → AI 密文/热键/屏保整份丢失。锁死三件事:
//  ① readJsonSafe 区分 missing/bad,坏根(数组/null/标量)也是 bad;
//  ② writeJsonAtomic 写出的必是完整 JSON(原文件在写失败时保持不变);
//  ③ preserveBadFile 在覆盖前把坏文件抢救为 .bad。

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'rgbbox-atomic-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('readJsonSafe', () => {
  it('好文件 → ok:value', async () => {
    const p = join(dir, 'a.json')
    writeFileSync(p, '{"x":1}', 'utf-8')
    const r = await readJsonSafe<{ x: number }>(p)
    expect(r).toEqual({ ok: true, value: { x: 1 } })
  })
  it('缺文件 → missing(非 bad)', async () => {
    const r = await readJsonSafe(join(dir, 'none.json'))
    expect(r).toEqual({ ok: false, reason: 'missing' })
  })
  it('截断 JSON → bad(清空链的起点)', async () => {
    const p = join(dir, 'b.json')
    writeFileSync(p, '{"ai":{"profiles":[{"apiKey":"enc:v1:SECRET"', 'utf-8')
    const r = await readJsonSafe(p)
    expect(r).toEqual({ ok: false, reason: 'bad' })
  })
  it('根为数组/null/标量 → bad(类型错误同坏文件)', async () => {
    for (const raw of ['[]', 'null', '42', '"str"', '']) {
      const p = join(dir, 'c.json')
      writeFileSync(p, raw, 'utf-8')
      expect(await readJsonSafe(p)).toEqual({ ok: false, reason: 'bad' })
    }
  })
})

describe('writeJsonAtomic', () => {
  it('写出完整可解析 JSON 并替换原文件', async () => {
    const p = join(dir, 'd.json')
    writeFileSync(p, '{"old":true}', 'utf-8')
    await writeJsonAtomic(p, { fresh: 7 })
    expect(JSON.parse(readFileSync(p, 'utf-8'))).toEqual({ fresh: 7 })
    // 不残留 tmp 文件
    expect(existsSync(join(dir, `.${process.pid}-`))).toBe(false)
  })
  it('目录不存在时自动创建', async () => {
    const p = join(dir, 'sub', 'e.json')
    await writeJsonAtomic(p, { ok: true })
    expect(JSON.parse(readFileSync(p, 'utf-8'))).toEqual({ ok: true })
  })
})

describe('preserveBadFile(抢救备份)', () => {
  it('坏文件改名为 .bad,内容原样保留(用户可手工找回密文)', async () => {
    const p = join(dir, 'f.json')
    const badContent = '{"ai":{"apiKey":"enc:v1:TRUNCATED'
    writeFileSync(p, badContent, 'utf-8')
    await preserveBadFile(p)
    expect(existsSync(p)).toBe(false)
    expect(readFileSync(`${p}.bad`, 'utf-8')).toBe(badContent)
  })
  it('文件不存在时静默(不抛)', async () => {
    await expect(preserveBadFile(join(dir, 'ghost.json'))).resolves.toBeUndefined()
  })
})

describe('防清空链(组合行为)', () => {
  it('坏文件 → 备份 → 原子覆盖:新文件完整,坏内容可从 .bad 找回', async () => {
    const p = join(dir, 'g.json')
    writeFileSync(p, '{"powerSaveBlock":true,"ai":{"apiKey":"enc:v1:LOST', 'utf-8')
    const r = await readJsonSafe(p)
    expect(r.ok).toBe(false)
    if (!r.ok && r.reason === 'bad') await preserveBadFile(p)
    await writeJsonAtomic(p, { powerSaveBlock: false })
    expect(JSON.parse(readFileSync(p, 'utf-8'))).toEqual({ powerSaveBlock: false })
    expect(readFileSync(`${p}.bad`, 'utf-8')).toContain('enc:v1:LOST')
  })
})
