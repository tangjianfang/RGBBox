/**
 * R213 avatarStore 单测(node 环境,不 mock electron)。
 *
 * 模块对 electron 的依赖(nativeImage/dialog)全部是函数内 lazy import,
 * 因此 node 单测只覆盖:纯函数(slot/路径校验、缩放目标、BGRA 中心裁)、
 * 工厂 fs 分支(get/clear/落盘读)、默认实例与 IPC 注册(avatarSet 的
 * 解码/对话框路径需 Electron 运行时,由主干真机联调覆盖)。
 */
import { describe, it, expect } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { IpcMain } from 'electron'
import {
  AVATAR_MAX_BYTES,
  avatarScaleTarget,
  centerCropBgra,
  clearAvatar,
  createAvatarStore,
  getAvatar,
  initAvatarStore,
  isValidAvatarSlot,
  registerAvatarIpc,
  setAvatarFromPath,
  validateAvatarSource,
} from '../../src/main/avatarStore'
import { ipcChannels } from '../../src/shared/ipc'

const mkTmp = (): string => mkdtempSync(join(tmpdir(), 'rgbbox-avatar-'))
const writeRaw = (dir: string, slot: number, bytes: Uint8Array): void => {
  mkdirSync(join(dir, 'avatars'), { recursive: true })
  writeFileSync(join(dir, 'avatars', `avatar-${slot}.png`), bytes)
}

describe('avatarStore pure', () => {
  it('isValidAvatarSlot: 1-4 整数通过,其余拒绝', () => {
    for (const ok of [1, 2, 3, 4]) expect(isValidAvatarSlot(ok)).toBe(true)
    for (const bad of [0, 5, -1, 1.5, NaN, '2', null, undefined]) {
      expect(isValidAvatarSlot(bad)).toBe(false)
    }
  })

  it('validateAvatarSource: 白名单扩展(大小写不敏感)/坏扩展/空路径', () => {
    for (const p of ['a.png', 'b.JPG', 'c.jpeg', 'd.WebP', 'e.bmp']) {
      expect(validateAvatarSource(p)).toBe('ok')
    }
    expect(validateAvatarSource('c.gif')).toBe('unsupported-format')
    expect(validateAvatarSource('noext')).toBe('unsupported-format')
    expect(validateAvatarSource('')).toBe('invalid-path')
  })

  it('avatarScaleTarget: 短边贴 128,长边等比(两维均 ≥128)', () => {
    expect(avatarScaleTarget(200, 100)).toEqual({ width: 256, height: 128 }) // 横图
    expect(avatarScaleTarget(100, 300)).toEqual({ width: 128, height: 384 }) // 竖图
    expect(avatarScaleTarget(90, 90)).toEqual({ width: 128, height: 128 }) // 方图(允许上采样)
    expect(avatarScaleTarget(0, 10)).toBeNull()
    expect(avatarScaleTarget(10.5, 10)).toBeNull()
  })

  it('centerCropBgra: 中心正方形裁切(BGRA 行距 width*4)', () => {
    // 3×3,crop=1 → 中心像素 index 4;像素 i 四通道全填 i
    const px3 = Buffer.alloc(3 * 3 * 4)
    for (let i = 0; i < 9; i++) px3.fill(i, i * 4, i * 4 + 4)
    expect([...centerCropBgra(px3, 3, 3, 1) as Buffer]).toEqual([4, 4, 4, 4])

    // 4×2,crop=2 → x0=1,y0=0:第0行取像素1,2;第1行取像素5,6
    const px2 = Buffer.alloc(4 * 2 * 4)
    for (let i = 0; i < 8; i++) px2.fill(i, i * 4, i * 4 + 4)
    expect([...centerCropBgra(px2, 4, 2, 2) as Buffer]).toEqual([
      1, 1, 1, 1, 2, 2, 2, 2,
      5, 5, 5, 5, 6, 6, 6, 6,
    ])

    // 任一边 < crop / 缓冲不足 → null(1×1 源在 crop=1 时恰好可裁,不属此列)
    expect(centerCropBgra(Buffer.alloc(4), 1, 1, 2)).toBeNull()
    expect(centerCropBgra(Buffer.alloc(2 * 2 * 4), 2, 2, 4)).toBeNull()
    expect(centerCropBgra(Buffer.alloc(2 * 2 * 4 - 1), 2, 2, 2)).toBeNull()
  })
})

describe('avatarStore fs (工厂,临时目录)', () => {
  it('getAvatar: 无文件 → null;落盘 PNG → dataURL(preview 用)', () => {
    const dir = mkTmp()
    const store = createAvatarStore(dir)
    expect(store.getAvatar(2)).toBeNull()

    writeRaw(dir, 2, Buffer.from('fake-png-bytes'))
    const dataUrl = store.getAvatar(2)
    expect(dataUrl).toBe(`data:image/png;base64,${Buffer.from('fake-png-bytes').toString('base64')}`)

    // 席位隔离:别的 slot 不受影响;非法 slot 一律 null
    expect(store.getAvatar(1)).toBeNull()
    expect(store.getAvatar(9)).toBeNull()
    expect(store.getAvatar(0)).toBeNull()
    rmSync(dir, { recursive: true, force: true })
  })

  it('clearAvatar: 删文件且幂等;非法 slot 安全无操作', () => {
    const dir = mkTmp()
    const store = createAvatarStore(dir)
    writeRaw(dir, 3, Buffer.from('x'))
    store.clearAvatar(3)
    expect(store.getAvatar(3)).toBeNull()
    expect(() => {
      store.clearAvatar(3) // 再清(无文件)不抛
      store.clearAvatar(99) // 非法 slot 不抛
    }).not.toThrow()
    rmSync(dir, { recursive: true, force: true })
  })

  it('setAvatarFromPath 校验分支(node 环境不触 electron):slot/扩展/存在性/大小', async () => {
    const dir = mkTmp()
    const store = createAvatarStore(dir)

    expect(await store.setAvatarFromPath(0, 'a.png')).toEqual({ ok: false, error: 'invalid-slot' })
    expect(await store.setAvatarFromPath(5, 'a.png')).toEqual({ ok: false, error: 'invalid-slot' })

    const gif = join(dir, 'pic.gif')
    writeFileSync(gif, 'GIF89a')
    expect(await store.setAvatarFromPath(1, gif)).toEqual({ ok: false, error: 'unsupported-format' })

    expect(await store.setAvatarFromPath(1, join(dir, 'nope.png'))).toEqual({ ok: false, error: 'file-not-found' })

    const empty = join(dir, 'empty.png')
    writeFileSync(empty, '')
    expect(await store.setAvatarFromPath(1, empty)).toEqual({ ok: false, error: 'file-not-found' })

    const huge = join(dir, 'huge.png')
    writeFileSync(huge, Buffer.alloc(AVATAR_MAX_BYTES + 1))
    expect(await store.setAvatarFromPath(1, huge)).toEqual({ ok: false, error: 'file-too-large' })

    // 校验失败绝不落盘
    expect(store.getAvatar(1)).toBeNull()
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('avatarStore 默认实例 + IPC 注册', () => {
  it('registerAvatarIpc: 三通道挂载;get/clear 走注入的 userData 根', () => {
    const dir = mkTmp()
    const handlers = new Map<string, (e: unknown, ...args: unknown[]) => unknown>()
    const ipc = {
      handle: (ch: string, fn: (e: unknown, ...args: unknown[]) => unknown): void => {
        handlers.set(ch, fn)
      },
    } as unknown as IpcMain

    registerAvatarIpc(ipc, () => dir)
    expect(handlers.has(ipcChannels.avatarGet)).toBe(true)
    expect(handlers.has(ipcChannels.avatarSet)).toBe(true)
    expect(handlers.has(ipcChannels.avatarClear)).toBe(true)

    // avatarGet:未设置 → null;落盘后经同一注入根读回
    const get = handlers.get(ipcChannels.avatarGet) as (e: unknown, slot: number) => string | null
    expect(get(undefined, 1)).toBeNull()
    writeRaw(dir, 1, Buffer.from('ipc-png'))
    expect(get(undefined, 1)).toBe(`data:image/png;base64,${Buffer.from('ipc-png').toString('base64')}`)
    expect(get(undefined, 42)).toBeNull()

    // avatarClear:恒 true 且实际删盘
    const clear = handlers.get(ipcChannels.avatarClear) as (e: unknown, slot: number) => boolean
    expect(clear(undefined, 1)).toBe(true)
    expect(get(undefined, 1)).toBeNull()
    rmSync(dir, { recursive: true, force: true })
  })

  it('模块级便捷导出与 registerAvatarIpc 共用同一默认实例', async () => {
    const dir = mkTmp()
    initAvatarStore(dir)
    expect(getAvatar(4)).toBeNull()
    expect(await setAvatarFromPath(4, join(dir, 'nope.png'))).toEqual({ ok: false, error: 'file-not-found' })
    writeRaw(dir, 4, Buffer.from('mod-png'))
    expect(getAvatar(4)).toBe(`data:image/png;base64,${Buffer.from('mod-png').toString('base64')}`)
    clearAvatar(4)
    expect(getAvatar(4)).toBeNull()
    rmSync(dir, { recursive: true, force: true })
  })
})
