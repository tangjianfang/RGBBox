/**
 * captureStore — 拍摄缓存持久化存储（PRD R77.1）。
 *
 * 存储：<userData>/captures/*.png + index.json（条目数组）。
 * 上限 MAX_CAPTURES 条 FIFO（超限删最旧文件 + 索引）。
 * 纯函数（parseIndex/mergeIndex/decodePngDataUrl/nextCaptureFile）导出供单测；
 * createCaptureStore 为薄 fs 包装，索引读写对齐 R69 systemSettingsStore 的
 * 简单直写惯例（损坏文件静默回退空列表）。
 * 无水印铁律（R75.2）：本存储只落原始 PNG 字节，不改写内容。
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CaptureEntry } from '../shared/types'

export type { CaptureEntry }

export const MAX_CAPTURES = 200
const MAX_PNG_BYTES = 30 * 1024 * 1024
const IMPORT_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp'])
const INDEX_FILE = 'index.json'

export function parseIndex(raw: string): CaptureEntry[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((e): e is CaptureEntry => {
      if (typeof e !== 'object' || e === null) return false
      const o = e as Record<string, unknown>
      return typeof o.id === 'string' && typeof o.file === 'string' &&
        typeof o.name === 'string' && typeof o.ts === 'number' && typeof o.kind === 'string'
    })
  } catch {
    return []
  }
}

/** 追加（按 id 去重）+ FIFO 淘汰；evicted 为被淘汰项（调用方删文件）。 */
export function mergeIndex(existing: CaptureEntry[], incoming: CaptureEntry[]): { entries: CaptureEntry[]; evicted: CaptureEntry[] } {
  const byId = new Map(existing.map(e => [e.id, e]))
  for (const e of incoming) byId.set(e.id, e)
  const all = [...byId.values()].sort((a, b) => a.ts - b.ts)
  if (all.length <= MAX_CAPTURES) return { entries: all, evicted: [] }
  const evicted = all.slice(0, all.length - MAX_CAPTURES)
  return { entries: all.slice(all.length - MAX_CAPTURES), evicted }
}

export function decodePngDataUrl(dataUrl: unknown): Buffer | null {
  if (typeof dataUrl !== 'string') return null
  const prefix = 'data:image/png;base64,'
  if (!dataUrl.startsWith(prefix)) return null
  try {
    const buf = Buffer.from(dataUrl.slice(prefix.length), 'base64')
    if (buf.length === 0 || buf.length > MAX_PNG_BYTES) return null
    return buf
  } catch {
    return null
  }
}

export function nextCaptureFile(kind: CaptureEntry['kind'], now: number): { id: string; file: string } {
  const rand = Math.random().toString(36).slice(2, 6)
  const id = `cap-${kind}-${now.toString(36)}-${rand}`
  return { id, file: `${id}.png` }
}

export function createCaptureStore(userDataDir: string): {
  list(): CaptureEntry[]
  addPng(dataUrl: string, kind: CaptureEntry['kind']): CaptureEntry | null
  delete(id: string): boolean
  read(id: string): string | null
  importFiles(paths: string[]): CaptureEntry[]
} {
  const dir = join(userDataDir, 'captures')
  const indexPath = join(dir, INDEX_FILE)

  const loadIndex = (): CaptureEntry[] => {
    try {
      return parseIndex(readFileSync(indexPath, 'utf-8'))
    } catch {
      return []
    }
  }
  const saveIndex = (entries: CaptureEntry[]): void => {
    writeFileSync(indexPath, JSON.stringify(entries), 'utf-8')
  }
  const evict = (evicted: CaptureEntry[]): void => {
    for (const e of evicted) {
      try { unlinkSync(e.file) } catch { /* 已不存在 */ }
    }
  }

  const addBuffer = (buf: Buffer, kind: CaptureEntry['kind'], name: string): CaptureEntry | null => {
    mkdirSync(dir, { recursive: true })
    const { id, file } = nextCaptureFile(kind, Date.now())
    const abs = join(dir, file)
    writeFileSync(abs, buf)
    const entry: CaptureEntry = { id, file: abs, name, ts: Date.now(), kind }
    const { entries, evicted } = mergeIndex(loadIndex(), [entry])
    evict(evicted)
    saveIndex(entries)
    return entry
  }

  return {
    list: loadIndex,
    addPng: (dataUrl, kind) => {
      const buf = decodePngDataUrl(dataUrl)
      if (!buf) return null
      return addBuffer(buf, kind, `capture-${new Date().toISOString().replace(/[:.]/g, '-')}`)
    },
    delete: (id) => {
      const entries = loadIndex()
      const hit = entries.find(e => e.id === id)
      if (!hit) return false
      try { unlinkSync(hit.file) } catch { /* 已不存在 */ }
      saveIndex(entries.filter(e => e.id !== id))
      return true
    },
    read: (id) => {
      const hit = loadIndex().find(e => e.id === id)
      if (!hit || !existsSync(hit.file)) return null
      try {
        return 'data:image/png;base64,' + readFileSync(hit.file).toString('base64')
      } catch {
        return null
      }
    },
    importFiles: (paths) => {
      const imported: CaptureEntry[] = []
      for (const p of paths) {
        if (typeof p !== 'string') continue
        const ext = p.slice(p.lastIndexOf('.')).toLowerCase()
        if (!IMPORT_EXTS.has(ext) || !existsSync(p)) continue
        try {
          const buf = readFileSync(p)
          // 非 png 扩展也统一以 png 命名位仅当源为 png；其余转存原字节 + 按扩展名命名
          const kind: CaptureEntry['kind'] = 'imported'
          const name = p.replace(/^.*[\\/]/, '')
          if (ext === '.png') {
            const e = addBuffer(buf, kind, name)
            if (e) imported.push(e)
          } else {
            mkdirSync(dir, { recursive: true })
            const { id, file } = nextCaptureFile(kind, Date.now())
            const abs = join(dir, file.replace(/\.png$/, ext))
            copyFileSync(p, abs)
            const entry: CaptureEntry = { id, file: abs, name, ts: Date.now(), kind }
            const { entries, evicted } = mergeIndex(loadIndex(), [entry])
            evict(evicted)
            saveIndex(entries)
            imported.push(entry)
          }
        } catch {
          // 单个文件失败跳过，不阻断批量导入
        }
      }
      return imported
    },
  }
}
