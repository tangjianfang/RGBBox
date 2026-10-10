import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
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
 *
 * R267（全模块硬化 W1 / REVIEW-main-ipc W2）追加：
 *  - writeJsonAtomic 失败路径修正——catch 里绝不再 rename(tmp,path)（半截 tmp
 *    会顶掉好文件，复现清空链），只 best-effort 清理 tmp 后原样上抛；
 *  - tmp 文件名加进程内计数器——同毫秒并发写不再撞名；
 *  - enqueueJson/writeJsonQueued——按路径互斥的串行写队列（见下）。
 */

export const BAD_JSON = Symbol('bad-json')

type ReadResult<T> = { ok: true; value: T } | { ok: false; reason: 'missing' | 'bad' }

export interface ReadJsonOptions {
  /** R267: 播放列表等数组根 JSON 的读取模式——根必须是数组,否则(对象/
   * 标量/null)仍按 bad 处理。默认模式(配置对象,R221.1 锁定语义)则要求
   * 根为非数组对象。 */
  allowArray?: boolean
}

/** 读取并解析 JSON；missing 与 bad（含根非对象）区分返回，永不抛出。 */
export async function readJsonSafe<T extends object>(path: string, opts: ReadJsonOptions = {}): Promise<ReadResult<T>> {
  let raw: string
  try {
    raw = await readFile(path, 'utf-8')
  } catch {
    return { ok: false, reason: 'missing' }
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    const isObjectRoot = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
    const isArrayRoot = Array.isArray(parsed)
    // 默认:根必须是非数组对象;allowArray:根必须是数组。其余一律 bad。
    if (opts.allowArray === true ? !isArrayRoot : !isObjectRoot) {
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

/** R267: tmp 名进程内计数器——只含 pid+Date.now() 时,同目录不同文件的
 * 并发原子写会在同一毫秒撞同一个 tmp 名(实测 ENOENT rename / 内容交错)。 */
let tmpSeq = 0

/** 原子写：tmp + rename；任何失败都不触碰原文件。 */
export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  const tmp = join(dirname(path), `.${process.pid}-${Date.now()}-${tmpSeq++}.tmp`)
  await mkdir(dirname(path), { recursive: true })
  try {
    await writeFile(tmp, JSON.stringify(value, null, 2), 'utf-8')
    await rename(tmp, path)
  } catch (err) {
    // R267(REVIEW-main-ipc W2 主审实锤): 旧实现在这里再 rename(tmp,path)——
    // 写失败时 tmp 是半截/不完整的,直接顶掉原文件恰好复现 R221.1 要防的
    // 清空链。失败路径唯一正确动作:best-effort 删 tmp(可能未创建/已被
    // 消费,忽略),原样上抛;原文件保持写前状态。
    try {
      await unlink(tmp)
    } catch { /* tmp 未创建或已被消费——无需清理 */ }
    throw err
  }
}

/**
 * R267(REVIEW-main-ipc W2): 按路径互斥的串行写队列。
 *
 * 背景:ipcMain 不串行化 invoke;system.json 的「load→浅合并→save」在
 * 电源/热键/屏保/定时关机/AI 画像多调用点并发时,基于同一份旧值各写各的
 * 字段——后写者整对象覆盖前者(跨字段丢更新);裸 writeJsonAtomic 并发时
 * 同毫秒还会撞同一个 tmp 文件名。链式 promise 排队(与 index.ts R89 的
 * runAiStoreOp 同一模式,下沉到本模块统一)保证:
 *  - 同路径任务严格按入队顺序串行执行;
 *  - 前置任务 reject 不影响后续任务(链不断、不毒化);
 *  - 不同路径互不阻塞。
 * Map 常驻每路径一个已结算的尾 promise(键=配置文件路径,有限集),无泄漏。
 */
const jsonQueues = new Map<string, Promise<unknown>>()

/** 把 task 排进 path 的串行队列;返回带 task 结果/错误的 promise(不吞错)。 */
export function enqueueJson<T>(path: string, task: () => Promise<T>): Promise<T> {
  const prev = jsonQueues.get(path) ?? Promise.resolve()
  const run = prev.then(task, task)
  jsonQueues.set(path, run.then(() => undefined, () => undefined))
  return run
}

/** R267: 排队后的原子写——同路径并发写串行化,最终文件=最后一次入队值。 */
export function writeJsonQueued(path: string, value: unknown): Promise<void> {
  return enqueueJson(path, () => writeJsonAtomic(path, value))
}
