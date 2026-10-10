/**
 * mediaAllowlist (R268) — media://local 路径白名单判定(纯函数)。
 *
 * R221.5 收口了任意路径;REVIEW-main-ipc W1 主审实锤两处功能回归缺口:
 * ①`userData/ai8-artifacts`(AI8 缩略图目录)不在白名单 → 确定性 403;
 * ②用户自选的音视频文件夹(播放列表导入来源,任意目录)不在 Downloads/Music/Videos
 *   → 任意目录播放全 403。本模块把判定抽纯函数:静态根 + ai8-artifacts +
 * 播放列表登记文件的**精确路径**放行(邻居/前缀伪装仍拒)。
 */

export interface MediaAllowlistRoots {
  userData: string
  home: string
  music: string
  videos: string
}

function underRoot(normalized: string, root: string, sep: string): boolean {
  return normalized === root || normalized.startsWith(root + sep)
}

/** `normalized` 是否放行;`playlistPaths`=当前音视频播放列表登记的全部文件路径。 */
export function isMediaPathAllowed(
  normalized: string,
  playlistPaths: readonly string[],
  roots: MediaAllowlistRoots,
): boolean {
  const sep = normalized.includes('\\') ? '\\' : '/'
  const staticRoots = [
    roots.userData + sep + 'captures',
    roots.userData + sep + 'models',
    roots.userData + sep + 'ai8-artifacts', // R268: AI8 缩略图产物
    roots.home + sep + 'Downloads',
    roots.music,
    roots.videos,
  ]
  if (staticRoots.some((root) => underRoot(normalized, root, sep))) return true
  // R268: 播放列表登记文件精确匹配(不放宽到目录——同目录未登记文件仍拒)
  return playlistPaths.includes(normalized)
}
