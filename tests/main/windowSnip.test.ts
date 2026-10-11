// R290.2 windowSnip — 按窗口句柄截图纯逻辑单测（mock electron desktopCapturer）。
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  desktopCapturer: {
    getSources: vi.fn(),
  },
}))
// getSourcesWithRetry 走真实实现(3s 竞速)——mock 的 getSources 即时 resolve,不触发重试路径

import { captureWindowBySourceId, WINDOW_SNIP_THUMB_CAP } from '../../src/main/windowSnip'
import { desktopCapturer } from 'electron'
import type { CaptureEntry } from '../../src/shared/types'

const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47])

/** 注入的 captureStore 替身（addBuffer 契约与 captureStore.ts:104 一致）。 */
const fakeStore = {
  addBuffer: (buf: Buffer, kind: CaptureEntry['kind'], name: string): CaptureEntry =>
    ({ id: `cap-${kind}-x`, file: `C:/fake/${kind}.png`, name, ts: 1, kind }),
}

function src(id: string, size: { width: number; height: number } | null) {
  return {
    id,
    name: `win-${id}`,
    thumbnail: size ? { toPNG: () => fakePng, getSize: () => size } : { toPNG: () => Buffer.alloc(0), getSize: () => ({ width: 0, height: 0 }) },
  }
}

describe('main/windowSnip 按窗口句柄截图 (R290.2)', () => {
  beforeEach(() => {
    vi.mocked(desktopCapturer.getSources).mockReset()
  })

  it('命中窗口源:原生分辨率 thumbnail → PNG 直落(物理尺寸封顶 3840)', async () => {
    vi.mocked(desktopCapturer.getSources).mockResolvedValue([src('window:123:0', { width: 1920, height: 1080 }), src('screen:0:0', { width: 1920, height: 1080 })] as never)
    const r = await captureWindowBySourceId('window:123:0', fakeStore)
    expect(r.ok).toBe(true)
    // 请求参数:只枚举窗口 + 封顶尺寸(不依赖窗口可见性,不需要更大)
    const opts = vi.mocked(desktopCapturer.getSources).mock.calls[0][0] as { types: string[]; thumbnailSize: { width: number } }
    expect(opts.types).toEqual(['window'])
    expect(opts.thumbnailSize.width).toBe(WINDOW_SNIP_THUMB_CAP)
  })

  it('sourceId 不在窗口列表(已关/陈旧) → {ok:false, code:"not-found"}', async () => {
    vi.mocked(desktopCapturer.getSources).mockResolvedValue([src('window:999:0', { width: 800, height: 600 })] as never)
    const r = await captureWindowBySourceId('window:404:0', fakeStore)
    expect(r).toEqual({ ok: false, code: 'not-found' })
  })

  it('thumbnail 空(最小化/黑帧) → {ok:false, code:"empty"}', async () => {
    vi.mocked(desktopCapturer.getSources).mockResolvedValue([src('window:1:0', null)] as never)
    const r = await captureWindowBySourceId('window:1:0', fakeStore)
    expect(r).toEqual({ ok: false, code: 'empty' })
  })

  it('底层异常 → {ok:false, code:"error"}(不抛出到 IPC 边界)', async () => {
    vi.mocked(desktopCapturer.getSources).mockRejectedValue(new Error('boom'))
    const r = await captureWindowBySourceId('window:1:0', fakeStore)
    expect(r).toEqual({ ok: false, code: 'error' })
  })
})
