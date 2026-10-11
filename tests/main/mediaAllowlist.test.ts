// R268 media://local 白名单——ai8-artifacts 缺口 + 播放列表自选目录放行(纯函数)。
import { describe, it, expect } from 'vitest'
import { isMediaPathAllowed } from '../../src/main/mediaAllowlist'

const ROOTS = {
  userData: 'C:/ud',
  home: 'C:/home',
  music: 'C:/music',
  videos: 'C:/videos',
}

describe('main/mediaAllowlist (R268)', () => {
  it('静态根:captures/models/Downloads/Music/Videos 维持放行', () => {
    expect(isMediaPathAllowed('C:/ud/captures/a.png', [], ROOTS)).toBe(true)
    expect(isMediaPathAllowed('C:/ud/models/m.splat', [], ROOTS)).toBe(true)
    expect(isMediaPathAllowed('C:/home/Downloads/v.mp4', [], ROOTS)).toBe(true)
    expect(isMediaPathAllowed('C:/music/song.mp3', [], ROOTS)).toBe(true)
    expect(isMediaPathAllowed('C:/videos/clips/a.webm', [], ROOTS)).toBe(true)
  })

  it('R268: userData/ai8-artifacts 放行(AI8 缩略图不再 403)', () => {
    expect(isMediaPathAllowed('C:/ud/ai8-artifacts/thumb-1.png', [], ROOTS)).toBe(true)
    expect(isMediaPathAllowed('C:/ud/ai8-artifacts/sub/x.jpg', [], ROOTS)).toBe(true)
  })

  it('R268: 播放列表登记文件的精确路径放行(用户自选目录不再全 403)', () => {
    expect(isMediaPathAllowed('D:/我的视频/custom.mp4', ['D:/我的视频/custom.mp4', 'E:/a.flac'], ROOTS)).toBe(true)
    expect(isMediaPathAllowed('E:/a.flac', ['D:/我的视频/custom.mp4', 'E:/a.flac'], ROOTS)).toBe(true)
  })

  it('越权仍拒:playlist 文件的同目录邻居/前缀伪装/系统目录', () => {
    expect(isMediaPathAllowed('D:/我的视频/other.mp4', ['D:/我的视频/custom.mp4'], ROOTS)).toBe(false)
    expect(isMediaPathAllowed('C:/ud/captures-evil/x.png', [], ROOTS)).toBe(false) // 前缀伪装
    expect(isMediaPathAllowed('C:/Windows/system32/evil.dll', ['D:/x.mp4'], ROOTS)).toBe(false)
    expect(isMediaPathAllowed('C:/ud/config/system.json', [], ROOTS)).toBe(false) // userData 其余仍拒
  })
})
