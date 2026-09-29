/**
 * R213: 角色头像存取 —— 每玩家(P1-P4)可选本地图片作游戏内角色大头像。
 *
 * 管线:文件路径(主进程 dialog 选图)→ nativeImage 解码 → 等比缩到「含 128×128
 * 方」→ toBitmap() 手动中心裁 128×128(BGRA,行距 = width*4)→ 重新封装 PNG →
 * <userData>/avatars/avatar-<slot>.png 落盘 → 渲染层经 IPC 读 PNG dataURL
 * (供 canvas drawImage)。游戏画布绘制接线由主干统一做,本模块只管存取。
 *
 * center-crop 说明:nativeImage 无 crop 原语且 resize 只缩放——故先按短边 128
 * 等比 resize(长边 ≥128),再从 BGRA 位图手动裁中心正方形(纯函数 centerCropBgra,
 * 可单测)。createToBitmap↔createFromBitmap 同进程往返,通道序自洽,不涉平台差异。
 *
 * Electron 依赖(nativeImage/dialog)一律函数内 lazy import:node 单测环境
 * (非 Electron)无需 mock 即可导入本模块,只测纯逻辑/校验分支/IPC 注册。
 */
import { mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import type { IpcMain } from 'electron'
import { ipcChannels } from '../shared/ipc'
import type { AvatarResult } from '../shared/types'

/** 头像目标边长(方形,px)。 */
export const AVATAR_SIZE = 128
/** 源文件大小上限(8MB;BMP 这类未压缩格式膨胀快,提前拦截)。 */
export const AVATAR_MAX_BYTES = 8 * 1024 * 1024
/** 允许的源图扩展名(与 captureStore 导入口径一致)。 */
const AVATAR_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp'])
/** 席位范围:P1-P4(本地双人 + LAN 双席一致)。 */
export const AVATAR_SLOT_MIN = 1
export const AVATAR_SLOT_MAX = 4

/** 席位校验(1-4 整数);IPC 入参不可信,先于一切读写。 */
export function isValidAvatarSlot(slot: unknown): boolean {
  return typeof slot === 'number' && Number.isInteger(slot) && slot >= AVATAR_SLOT_MIN && slot <= AVATAR_SLOT_MAX
}

/** 源路径静态校验:返回稳定错误码(null 段路径/非白名单扩展)。 */
export function validateAvatarSource(filePath: string): 'ok' | 'invalid-path' | 'unsupported-format' {
  if (typeof filePath !== 'string' || filePath.length === 0) return 'invalid-path'
  if (!AVATAR_EXTS.has(extname(filePath).toLowerCase())) return 'unsupported-format'
  return 'ok'
}

/**
 * 等比缩放目标尺寸:短边贴 `size`、长边按比例(结果两维均 ≥ size,保证可裁)。
 * 纯函数,可单测;非法尺寸(0/负/非整数)返回 null。
 */
export function avatarScaleTarget(
  w: number,
  h: number,
  size = AVATAR_SIZE,
): { width: number; height: number } | null {
  if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) return null
  const s = Math.min(w, h)
  return {
    width: s === w ? size : Math.round((size * w) / s),
    height: s === h ? size : Math.round((size * h) / s),
  }
}

/**
 * 从等比缩放后的 BGRA 位图裁中心 `crop`×`crop` 正方形(4 字节/像素,行距 =
 * width*4)。纯函数,可单测;画布任一边小于 crop 或缓冲不足时返回 null。
 */
export function centerCropBgra(src: Buffer, width: number, height: number, crop = AVATAR_SIZE): Buffer | null {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < crop || height < crop) return null
  if (src.length < width * height * 4) return null
  const x0 = Math.floor((width - crop) / 2)
  const y0 = Math.floor((height - crop) / 2)
  const out = Buffer.allocUnsafe(crop * crop * 4)
  for (let row = 0; row < crop; row++) {
    const start = (y0 + row) * width * 4 + x0 * 4
    src.copy(out, row * crop * 4, start, start + crop * 4)
  }
  return out
}

export interface AvatarStore {
  /** 读盘返回 PNG dataURL(无文件/坏文件 → null;供 canvas drawImage)。 */
  getAvatar(slot: number): string | null
  /** 校验 + 解码 + 缩裁 + 落盘;失败返回稳定错误码,不透传底层异常文本。 */
  setAvatarFromPath(slot: number, filePath: string): Promise<AvatarResult>
  /** 删除该席位头像(幂等:无文件也成功)。 */
  clearAvatar(slot: number): void
}

/** 工厂:测试可注入临时目录(与 captureStore 同惯例)。 */
export function createAvatarStore(baseDir: string): AvatarStore {
  const dir = join(baseDir, 'avatars')
  const fileFor = (slot: number): string => join(dir, `avatar-${slot}.png`)

  return {
    getAvatar(slot) {
      if (!isValidAvatarSlot(slot)) return null
      try {
        const buf = readFileSync(fileFor(slot))
        if (buf.length === 0) return null
        return `data:image/png;base64,${buf.toString('base64')}`
      } catch {
        return null // 无文件(常态)或读失败一律按「未设置」处理
      }
    },

    async setAvatarFromPath(slot, filePath) {
      if (!isValidAvatarSlot(slot)) return { ok: false, error: 'invalid-slot' }
      const verdict = validateAvatarSource(filePath)
      if (verdict !== 'ok') return { ok: false, error: verdict }
      let bytes: number
      try {
        bytes = statSync(filePath).size
      } catch {
        return { ok: false, error: 'file-not-found' }
      }
      if (bytes <= 0) return { ok: false, error: 'file-not-found' }
      if (bytes > AVATAR_MAX_BYTES) return { ok: false, error: 'file-too-large' }

      // ── 以下需 Electron 运行时(node 单测只覆盖上面的校验分支)──
      const { nativeImage } = await import('electron')
      const img = nativeImage.createFromPath(filePath)
      if (img.isEmpty()) return { ok: false, error: 'decode-failed' }
      const target = avatarScaleTarget(img.getSize().width, img.getSize().height)
      if (!target) return { ok: false, error: 'decode-failed' }
      const scaled = img.resize({ ...target, quality: 'good' })
      // resize 实际产出尺寸可能因取整微偏,按 getSize() 实测值裁
      const cropped = centerCropBgra(scaled.toBitmap(), scaled.getSize().width, scaled.getSize().height)
      if (!cropped) return { ok: false, error: 'crop-failed' }
      const png = nativeImage.createFromBitmap(cropped, { width: AVATAR_SIZE, height: AVATAR_SIZE }).toPNG()
      try {
        mkdirSync(dir, { recursive: true })
        writeFileSync(fileFor(slot), png)
      } catch {
        return { ok: false, error: 'write-failed' }
      }
      return { ok: true }
    },

    clearAvatar(slot) {
      if (!isValidAvatarSlot(slot)) return
      try {
        unlinkSync(fileFor(slot))
      } catch {
        /* 无文件即幂等 */
      }
    },
  }
}

// ── 默认实例(userData 根;registerAvatarIpc 接线时设定)──────────────────

let store: AvatarStore | null = null

/** 设定默认实例根目录(userData);registerAvatarIpc 内部会自动调用。 */
export function initAvatarStore(userDataDir: string): void {
  store = createAvatarStore(userDataDir)
}

/** 读默认实例头像;未接线(单测早期/异常路径)返回 null 而非抛错。 */
export function getAvatar(slot: number): string | null {
  return store?.getAvatar(slot) ?? null
}

/** 默认实例写盘(经校验/解码管线);未接线返回 not-initialized。 */
export async function setAvatarFromPath(slot: number, filePath: string): Promise<AvatarResult> {
  if (!store) return { ok: false, error: 'not-initialized' }
  return store.setAvatarFromPath(slot, filePath)
}

/** 默认实例清除。 */
export function clearAvatar(slot: number): void {
  store?.clearAvatar(slot)
}

// ── IPC 注册(index.ts 一行接线:registerAvatarIpc(ipcMain, () => app.getPath('userData')))──

/** 主进程原生选图对话框(已按白名单扩展过滤);取消/关闭返回 null。 */
async function pickAvatarImage(): Promise<string | null> {
  const { dialog } = await import('electron')
  const res = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: [...AVATAR_EXTS].map((e) => e.slice(1)) }],
  })
  return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0]
}

/**
 * 挂三个 avatar 通道(R213):avatarGet(slot)→dataURL|null、
 * avatarSet(slot)(主进程开对话框选图→落盘)、avatarClear(slot)→true。
 * index.ts 不改结构,主干接线时在 registerLanIpc 行旁加一行调用即可。
 */
export function registerAvatarIpc(ipcMain: IpcMain, getUserDataPath: () => string): void {
  // 无状态存储:每次注册都按 getter 重建(重复接线/测试重定向 userData 均幂等)
  initAvatarStore(getUserDataPath())
  ipcMain.handle(ipcChannels.avatarGet, (_e, slot: number) => getAvatar(slot))
  ipcMain.handle(ipcChannels.avatarSet, async (_e, slot: number): Promise<AvatarResult> => {
    const filePath = await pickAvatarImage()
    if (!filePath) return { ok: false, error: 'cancelled' } // 用户取消属常态,组件静默
    return setAvatarFromPath(slot, filePath)
  })
  ipcMain.handle(ipcChannels.avatarClear, (_e, slot: number) => {
    clearAvatar(slot)
    return true
  })
}
