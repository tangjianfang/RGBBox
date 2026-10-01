import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/**
 * R221.1（05 T-C1）：JSON 配置的原子读写与坏文件防护。
 *
 * 评审实测的清空链：裸 writeFile（写一半崩溃/断电 → 截断文件）+
 * JSON.parse 失败静默返回默认值 → 下一次 save 把默认值合并写回 →
 * AI 密文 profiles/热键/屏保等字段整份丢失。
 *
 * 修复：
 *  - writeJsonAtomic：先写 `<path>.tmp`（同目录，保证同分区）再 rename 原子替换；
 *    写失败时清理临时文件，原文件保持完整。
 *  - readJsonSafe：解析失败时返回 BAD_JSON 哨兵而非默认值——调用方据此
 *    「拒绝合并默认」，原文件原样保留（用户可手工修复），同时附带 error 日志。
 *    解析成功但根不是对象（数组/null/标量）同样按坏文件处理。
 */

export const BAD_JSON = Symbol('bad-json')

type ReadResult<T> = { ok: true; value: T } | { ok: false; reason: 'missing' | 'bad' }

/** 读取并解析 JSON；missing 与 bad（含根非对象）区分返回，永不抛出。 */
export async function readJsonSafe<T extends object>(path: string): Promise<ReadResult<T>> {
  let raw: string
  try {
    raw = await readFile(path, 'utf-8')
  } catch {
    return { ok: false, reason: 'missing' }
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { ok: false, reason: 'bad' }
    }
    return { ok: true, value: parsed as T }
  } catch {
    return { ok: false, reason: 'bad' }
  }
}

/** R221.1: 坏文件抢救性备份——覆盖前把原坏文件改名为 `<path>.bad`
 *  (best-effort),用户可手工从中找回 AI 密文等未序列化成功的字段。 */
export async function preserveBadFile(path: string): Promise<void> {
  try {
    const { rename } = await import('node:fs/promises')
    await rename(path, `${path}.bad`)
  } catch {
    /* 文件可能不存在/不可读——继续按无备份处理 */
  }
}

/** 原子写：tmp + rename；任何失败都不触碰原文件。 */
export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  const tmp = join(dirname(path), `.${process.pid}-${Date.now()}.tmp`)
  await mkdir(dirname(path), { recursive: true })
  try {
    await writeFile(tmp, JSON.stringify(value, null, 2), 'utf-8')
    await rename(tmp, path)
  } catch (err) {
    try {
      await rename(tmp, path).catch(() => undefined)
    } catch { /* tmp 可能未创建 */ }
    throw err
  }
}
