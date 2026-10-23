import { stat } from 'node:fs/promises'
import { enqueueJson, preserveBadFile, readJsonSafe, writeJsonAtomic } from './atomicJson'

/**
 * R267（全模块硬化 W1 / REVIEW-main-ipc W4）：音视频播放列表持久化。
 *
 * 旧实现在 index.ts 里裸 `writeFile`（audio/video-playlist.json）：写一半
 * 崩溃/断电即截断文件，下次 load 的 `JSON.parse` 失败静默回 `[]`，用户再
 * 添加一个文件就把空列表+单条写回——整个播放列表被清空（R221.1 清空链的
 * 播放列表变体）。现统一走 atomicJson 原语：
 *  - load：坏/缺文件回空列表（内存兜底），但绝不落盘覆盖——原文件原样
 *    保留，待 save 抢救；
 *  - save：同路径串行队列 + 原子写；若现存文件是坏 JSON，覆盖前先抢救为
 *    `<path>.bad`（与 systemSettings 的 R221.1 同策略）。
 *
 * 播放列表是数组根 JSON——readJsonSafe 需显式 `allowArray`（数组根默认按
 * bad 处理是 R221.1 对配置对象的锁定语义，不放宽）。
 */
export type PlaylistItem = { id: string; name: string; path: string; group: string }

/** 读播放列表；缺文件/坏文件回空列表（永不抛、永不写盘）。 */
export async function loadPlaylist<T = PlaylistItem>(path: string): Promise<T[]> {
  const r = await readJsonSafe<T[]>(path, { allowArray: true })
  return r.ok ? r.value : []
}

/** 串行 + 原子写播放列表；覆盖坏文件前先抢救 `.bad`。 */
export function savePlaylist<T>(path: string, items: T[]): Promise<void> {
  return enqueueJson(path, async () => {
    const r = await readJsonSafe<T[]>(path, { allowArray: true })
    if (!r.ok && r.reason === 'bad') await preserveBadFile(path)
    await writeJsonAtomic(path, items)
  })
}

/** R317d (REVIEW_2026-10-24 附录04 R-2): 为播放列表条目附 `exists` 预检标记。
 *  playlist 存绝对路径且 dev/打包共享 userData——条目文件在另一台机器不可达
 *  时，R94 自动恢复会「打开视频工作站即报错」。主进程读取时逐条 stat，渲染
 *  层据此把失效条目标 `missing` 并跳过自动恢复（不从持久化清除——数据保留，
 *  UI 徽标列后续 R-N）。stat 异常（权限/断盘/不存在）一律按 false：误标只
 *  影响自动播放，不影响列表本身。 */
export async function annotateExists<T extends { path: string }>(
  items: T[],
  statFn: (p: string) => Promise<unknown> = stat,
): Promise<Array<T & { exists: boolean }>> {
  return Promise.all(items.map(async (item) => ({
    ...item,
    exists: await statFn(item.path).then(
      () => true,
      () => false,
    ),
  })))
}
