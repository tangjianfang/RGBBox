/**
 * playlistProgress — R91.1 per-item playback progress helpers (pure, testable).
 *
 * Progress lives inside video-playlist.json entries (`progress/duration/
 * updatedAt`, seconds/ms) so it survives restarts together with the list.
 * Old files without the fields restore as "no progress" (undefined → skipped).
 * 无水印铁律不涉及本模块；纯数据搬运。
 */

/** In-session progress record per playlist item id (seconds; u = epoch ms). */
export interface ProgressEntry {
  /** last playback position, seconds */
  t: number
  /** media duration, seconds */
  d: number
  /** when this entry was last written, epoch ms */
  u: number
}

/** Persisted shape of a video-playlist.json entry (main process stores as-is). */
export interface PlaylistPathEntry {
  id: string
  name: string
  path: string
  group: string
  /** last position, seconds — omitted when never watched / finished */
  progress?: number
  duration?: number
  updatedAt?: number
}

/** Renderer playlist item (subset this module needs). url is optional to
 * match VideoItem — items without one simply never persist. */
export interface PlaylistItemLike {
  id: string
  name: string
  url?: string
  group: string
}

/**
 * Build the persistable path-entry list: media:// items only (blob:/remote
 * have no path), with in-session progress merged in. Watched-to-the-end items
 * carry no progress (the caller deletes them) and stay clean.
 */
export function buildPathEntries(
  playlist: PlaylistItemLike[],
  progress: Record<string, ProgressEntry>,
): PlaylistPathEntry[] {
  const out: PlaylistPathEntry[] = []
  for (const v of playlist) {
    if (!v.url || !v.url.startsWith('media://')) continue
    let filePath = ''
    try { filePath = new URL(v.url).searchParams.get('p') ?? '' } catch { /* malformed url — drop */ }
    if (!filePath) continue
    const p = progress[v.id]
    out.push(p && p.t > 0
      ? { id: v.id, name: v.name, path: filePath, group: v.group, progress: Math.floor(p.t), duration: Math.floor(p.d), updatedAt: p.u }
      : { id: v.id, name: v.name, path: filePath, group: v.group })
  }
  return out
}

/**
 * Whether opening this item should offer "resume from t": watched past 30s
 * and more than 60s from the end (R91.1 thresholds).
 */
export function shouldOfferResume(p: ProgressEntry | undefined): boolean {
  return !!p && p.t > 30 && p.d - p.t > 60
}

/** Fold restored playlist entries back into the in-session progress map. */
export function ingestRestoredProgress(
  saved: Array<Pick<PlaylistPathEntry, 'id' | 'progress' | 'duration' | 'updatedAt'>>,
): Record<string, ProgressEntry> {
  const map: Record<string, ProgressEntry> = {}
  for (const e of saved) {
    if (e.id && typeof e.progress === 'number' && e.progress > 0
      && typeof e.duration === 'number' && e.duration > 0) {
      map[e.id] = { t: e.progress, d: e.duration, u: e.updatedAt ?? 0 }
    }
  }
  return map
}
