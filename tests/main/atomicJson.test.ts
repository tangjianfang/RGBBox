import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readJsonSafe, writeJsonAtomic, writeJsonQueued, enqueueJson, preserveBadFile } from '../../src/main/atomicJson'

// ── R267: 注入「tmp 写一半失败」的可控 mock(仅 flag 打开时拦截 *.tmp)──
// 模拟磁盘满/进程被杀:留下不完整 tmp 后抛错。其余 fs 调用全部透传真实现。
const tmpWriteFail = vi.hoisted(() => ({ fail: false }))
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  const realWriteFile = actual.writeFile.bind(actual) as (p: unknown, d: unknown, ...r: unknown[]) => Promise<void>
  return {
    ...actual,
    writeFile: (async (p: unknown, data: unknown, ...rest: unknown[]) => {
      if (tmpWriteFail.fail && typeof p === 'string' && p.endsWith('.tmp')) {
        await realWriteFile(p, '{"partial":') // 半截 JSON 落进 tmp
        throw new Error('EIO: simulated mid-write failure (R267)')
      }
      return realWriteFile(p, data, ...rest)
    }) as unknown as typeof actual.writeFile,
  }
})

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

  // ── R267 补充: 读侧行为锁 ─────────────────────────────────────────────
  it('R267: 坏文件返回 bad 且原文件一字节不动(读侧永不写盘)', async () => {
    const p = join(dir, 'untouched.json')
    const bad = '{"ai":{"apiKey":"enc:v1:HALF"'
    writeFileSync(p, bad, 'utf-8')
    expect(await readJsonSafe(p)).toEqual({ ok: false, reason: 'bad' })
    expect(readFileSync(p, 'utf-8')).toBe(bad) // BAD_JSON 分支不覆盖原文件
    expect(readdirSync(dir)).toEqual(['untouched.json']) // 也不产生 .bad/.tmp 副本
  })

  // R267(播放列表): 数组根 JSON 需显式 allowArray;默认(配置对象语义)数组根
  // 仍按 bad 处理——R221.1 锁定语义不放宽。
  it('R267: allowArray=true 时数组根 ok;默认仍 bad;标量/对象根仍 bad', async () => {
    const p = join(dir, 'arr.json')
    writeFileSync(p, '[{"id":"a1","name":"bgm.mp3","path":"C:/x","group":"g1"}]', 'utf-8')
    expect(await readJsonSafe<Array<{ id: string }>>(p)).toEqual({ ok: false, reason: 'bad' }) // 默认
    expect(await readJsonSafe<Array<{ id: string }>>(p, { allowArray: true })).toEqual({
      ok: true,
      value: [{ id: 'a1', name: 'bgm.mp3', path: 'C:/x', group: 'g1' }],
    })
    writeFileSync(p, '{"not":"an array"}', 'utf-8')
    expect(await readJsonSafe<Array<unknown>>(p, { allowArray: true })).toEqual({ ok: false, reason: 'bad' })
    writeFileSync(p, '42', 'utf-8')
    expect(await readJsonSafe<Array<unknown>>(p, { allowArray: true })).toEqual({ ok: false, reason: 'bad' })
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

  // ── R267 失败路径回归锁(REVIEW-main-ipc W2 主审实锤)──────────────────
  // 旧实现的 catch 块在写失败后再 rename(tmp,path):半截 tmp 直接顶掉好文件,
  // 复现 R221.1 清空链(截断→下次读回默认→再写回=整份丢失)。锁死三件事:
  // 原文件一字节不动 / 不完整 tmp 被清理 / promise reject(不静默吞错)。
  it('R267: writeFile 半途失败 → 原文件不变、tmp 被清理、reject(失败不覆盖原文件)', async () => {
    const p = join(dir, 'fail.json')
    const before = JSON.stringify({ ai: { apiKey: 'enc:v1:PRECIOUS' }, powerSaveBlock: true }, null, 2)
    writeFileSync(p, before, 'utf-8')
    tmpWriteFail.fail = true
    try {
      await expect(writeJsonAtomic(p, { fresh: 1 })).rejects.toThrow('EIO')
      expect(readFileSync(p, 'utf-8')).toBe(before) // 原文件一个字节都不能动
      expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]) // 半截 tmp 清走
    } finally {
      tmpWriteFail.fail = false
    }
  })

  // R267: tmp 名只含 pid+Date.now() 时,同目录不同文件的并发原子写会在同一
  // 毫秒撞同一个 tmp 名(写交错/rename ENOENT)。锁死:并发写互不踩。
  it('R267: 同目录不同文件并发原子写 → 两个文件都完整(唯一 tmp 名)', async () => {
    const a = join(dir, 'x.json')
    const b = join(dir, 'y.json')
    await Promise.all([writeJsonAtomic(a, { who: 'a' }), writeJsonAtomic(b, { who: 'b' })])
    expect(JSON.parse(readFileSync(a, 'utf-8'))).toEqual({ who: 'a' })
    expect(JSON.parse(readFileSync(b, 'utf-8'))).toEqual({ who: 'b' })
  })
})

// ── R267(REVIEW-main-ipc W2): 按路径互斥的串行写队列 ──────────────────
describe('writeJsonQueued / enqueueJson(R267 串行队列)', () => {
  it('并发 N 次同路径写:全部完成、按入队顺序落盘、最终文件=最后一次值', async () => {
    const p = join(dir, 'q.json')
    const N = 25
    const doneOrder: number[] = []
    const writes = Array.from({ length: N }, (_, i) =>
      writeJsonQueued(p, { seq: i }).then(() => { doneOrder.push(i) }),
    )
    await Promise.all(writes)
    expect(doneOrder).toEqual(Array.from({ length: N }, (_, i) => i)) // 严格入队顺序
    expect(JSON.parse(readFileSync(p, 'utf-8'))).toEqual({ seq: N - 1 }) // 无交错损坏
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([])
  })

  it('enqueueJson: 同路径任务严格串行(前一个未完成下一个不启动)', async () => {
    const p = join(dir, 'lock.json')
    const events: string[] = []
    let release!: () => void
    const gate = new Promise<void>((res) => { release = res })
    const t1 = enqueueJson(p, async () => { events.push('t1-start'); await gate; events.push('t1-end') })
    const t2 = enqueueJson(p, async () => { events.push('t2-start') })
    await new Promise((r) => setTimeout(r, 20))
    expect(events).toEqual(['t1-start']) // t2 被门闩挡住——没有串行化就会混入
    release()
    await Promise.all([t1, t2])
    expect(events).toEqual(['t1-start', 't1-end', 't2-start'])
  })

  it('前一个任务 reject 不毒化队列: 后续任务照常执行', async () => {
    const p = join(dir, 'poison.json')
    const boom = enqueueJson(p, async () => { throw new Error('boom') })
    const next = writeJsonQueued(p, { ok: true })
    await expect(boom).rejects.toThrow('boom')
    await next
    expect(JSON.parse(readFileSync(p, 'utf-8'))).toEqual({ ok: true })
  })

  it('不同路径互不阻塞(队列按 path 分键)', async () => {
    const a = join(dir, 'pa.json')
    const b = join(dir, 'pb.json')
    let release!: () => void
    const gate = new Promise<void>((res) => { release = res })
    const ta = enqueueJson(a, async () => { await gate })
    let bRan = false
    const tb = enqueueJson(b, async () => { bRan = true })
    await new Promise((r) => setTimeout(r, 20))
    expect(bRan).toBe(true) // a 的门闩不该挡住 b
    release()
    await Promise.all([ta, tb])
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
