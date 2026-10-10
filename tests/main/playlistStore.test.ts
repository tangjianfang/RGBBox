import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadPlaylist, savePlaylist } from '../../src/main/playlistStore'

// ── R267(REVIEW-main-ipc W4): 音视频播放列表持久化防清空 ──────────────────
// 旧实现在 index.ts 裸 writeFile(audio/video-playlist.json):写一半崩溃即截断,
// 下次 load 的 JSON.parse 失败回 [] 并把空列表写回——用户整个播放列表被清空
// (R221.1 清空链的播放列表变体)。锁死:
//  ① 往返保真(含视频进度字段);② 坏文件 load 回空但原文件不动、不落盘覆盖;
//  ③ save 覆盖坏文件前先抢救 .bad;④ 并发 save 串行、最终=最后一次。

type AudioItem = { id: string; name: string; path: string; group: string }
type VideoItem = AudioItem & { progress?: number; duration?: number; updatedAt?: number }

let dir: string
let p: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'rgbbox-playlist-'))
  p = join(dir, 'audio-playlist.json')
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('main/playlistStore R267', () => {
  it('往返: save → load 原样取回(含视频进度字段 R91.1)', async () => {
    const audio: AudioItem[] = [
      { id: 'a1', name: 'bgm.mp3', path: 'C:/media/bgm.mp3', group: '默认' },
      { id: 'a2', name: 'sfx.flac', path: 'C:/media/sfx.flac', group: '默认' },
    ]
    await savePlaylist(p, audio)
    expect(await loadPlaylist<AudioItem>(p)).toEqual(audio)

    const vp = join(dir, 'video-playlist.json')
    const video: VideoItem[] = [
      { id: 'v1', name: 'mv.mp4', path: 'C:/media/mv.mp4', group: '默认', progress: 0.42, duration: 213.7, updatedAt: 1760000000000 },
    ]
    await savePlaylist(vp, video)
    expect(await loadPlaylist<VideoItem>(vp)).toEqual(video)
  })

  it('缺文件: load 回空列表(不抛、不建文件)', async () => {
    expect(await loadPlaylist(p)).toEqual([])
    expect(existsSync(p)).toBe(false)
  })

  it('坏文件: load 回空列表但原文件一字节不动(内存兜底,不落盘覆盖)', async () => {
    const bad = '[{"id":"a1","name":"bgm.mp3","path":"C:/bgm' // 截断
    writeFileSync(p, bad, 'utf-8')
    expect(await loadPlaylist(p)).toEqual([])
    expect(readFileSync(p, 'utf-8')).toBe(bad) // 原文件保持——可手工抢救
    expect(readdirSync(dir)).toEqual(['audio-playlist.json']) // 无 .bad/.tmp 副本
  })

  it('非数组根(对象/标量)同样按 bad 处理: load 回 [] 且原文件不动', async () => {
    for (const raw of ['{"items":[]}', '42']) {
      writeFileSync(p, raw, 'utf-8')
      expect(await loadPlaylist(p)).toEqual([])
      expect(readFileSync(p, 'utf-8')).toBe(raw)
    }
  })

  it('save 覆盖坏文件: 先抢救为 .bad,再原子写新完整列表', async () => {
    const bad = '[{"id":"a1","apiKey'
    writeFileSync(p, bad, 'utf-8')
    const fresh: AudioItem[] = [{ id: 'a2', name: 'new.flac', path: 'C:/new.flac', group: '默认' }]
    await savePlaylist(p, fresh)
    expect(await loadPlaylist<AudioItem>(p)).toEqual(fresh)
    expect(readFileSync(`${p}.bad`, 'utf-8')).toBe(bad) // 坏内容可找回
  })

  it('并发 save: 全部完成、最终=最后一次入队值、文件全程完整 JSON', async () => {
    const N = 20
    const saves = Array.from({ length: N }, (_, i) =>
      savePlaylist(p, [{ id: `a${i}`, name: `f${i}.mp3`, path: `C:/f${i}.mp3`, group: '默认' }]),
    )
    await Promise.all(saves)
    expect(await loadPlaylist<AudioItem>(p)).toEqual([
      { id: `a${N - 1}`, name: `f${N - 1}.mp3`, path: `C:/f${N - 1}.mp3`, group: '默认' },
    ])
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([])
  })

  it('目录不存在时 save 自动创建(对齐旧 mkdir 行为)', async () => {
    const nested = join(dir, 'config', 'video-playlist.json')
    await savePlaylist(nested, [{ id: 'v1', name: 'm.mp4', path: 'C:/m.mp4', group: '默认' }])
    expect(await loadPlaylist<AudioItem>(nested)).toEqual([{ id: 'v1', name: 'm.mp4', path: 'C:/m.mp4', group: '默认' }])
  })
})
