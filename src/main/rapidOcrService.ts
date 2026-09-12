/**
 * rapidOcrService — R82: 本地 RapidOCR（PP-OCRv4 ONNX，onnxruntime-node CPU）。
 *
 * 模型按需下载（ModelScope 官方直链 + SHA256 校验）到 userData/models/rapidocr/；
 * rec 字符表 = ['blank', ...ppocr_keys_v1.txt, ' ']（6625 类，blank=0，已实证）。
 * 任何未就绪/失败都返回 null —— 调用方（ocrService.recognizeImage）回退 WinRT。
 * 经 dynamic-import 接入，vitest node 环境不加载本模块（原生模块不可导入）。
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as https from 'node:https'
import { nativeImage } from 'electron'
import * as ort from 'onnxruntime-node'
import { getLogger, type Logger } from '../shared/logger'
import {
  boxesFromProbMap, ctcGreedyDecode, ctcIdxToString, detInputSize,
  IMAGENET_MEAN, IMAGENET_STD, mapBoxToOriginal, rgbaToCHW,
  REC_MEAN_HALF, REC_STD_HALF, sortBoxesReadingOrder, type ProbBox,
} from './rapidOcrPure'

function log(): Logger { return getLogger() }

export interface RapidOcrModelSpec { file: string; url: string; sha256: string }

/** 官方 default_models.yaml 直链 + 实证 SHA256（det/rec 与 yaml 一致；dict 为本机计算）。 */
export const RAPIDOCR_MODELS: RapidOcrModelSpec[] = [
  {
    file: 'ch_PP-OCRv4_det_mobile.onnx',
    url: 'https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.9.2/onnx/PP-OCRv4/det/ch_PP-OCRv4_det_mobile.onnx',
    sha256: 'd2a7720d45a54257208b1e13e36a8479894cb74155a5efe29462512d42f49da9',
  },
  {
    file: 'ch_PP-OCRv4_rec_mobile.onnx',
    url: 'https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.9.2/onnx/PP-OCRv4/rec/ch_PP-OCRv4_rec_mobile.onnx',
    sha256: '48fc40f24f6d2a207a2b1091d3437eb3cc3eb6b676dc3ef9c37384005483683b',
  },
  {
    file: 'ppocr_keys_v1.txt',
    url: 'https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.9.2/paddle/PP-OCRv4/rec/ch_PP-OCRv4_rec_mobile/ppocr_keys_v1.txt',
    sha256: '28b2362ad4ab2dc38769aa72feb535e3a9ddb3fd2a7585a05920e6393b1dc7f7',
  },
]

let modelsDir: string | null = null
let detSession: ort.InferenceSession | null = null
let recSession: ort.InferenceSession | null = null
let charset: string[] | null = null
let ensurePromise: Promise<boolean> | null = null

export function initRapidOcr(dir: string): void {
  modelsDir = dir
}

/**
 * R82.6: 模型目录解析——优先随安装包内置的 resources/rapidocr（dev 为
 * build/rapidocr），内置缺失才用 userData 在线下载路径。
 */
export function resolveRapidOcrDir(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { app } = require('electron') as typeof import('electron')
  const bundled = app.isPackaged
    ? join(process.resourcesPath, 'rapidocr')
    : join(__dirname, '../../build/rapidocr')
  if (existsSync(join(bundled, RAPIDOCR_MODELS[0].file))) return bundled
  return join(app.getPath('userData'), 'models', 'rapidocr')
}

/** ModelScope LFS CDN 对无 User-Agent 的裸请求回 403（实证 A/B：无 UA→403、带 UA→200）。 */
const DOWNLOAD_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) RGBBox/1.0'

function download(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': DOWNLOAD_UA } }, (res) => {
      if (res.statusCode != null && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        download(res.headers.location, dest).then(resolve, reject)
        return
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode ?? '?'} for ${url}`))
        return
      }
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        try {
          const buf = Buffer.concat(chunks)
          writeFileSync(dest, buf)
          resolve()
        } catch (err) { reject(err as Error) }
      })
      res.on('error', reject)
    }).on('error', reject)
  })
}

function sha256Of(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

async function ensureReady(): Promise<boolean> {
  if (detSession && recSession && charset) return true
  if (!modelsDir) return false
  try {
    // R82.6: 内置目录缺文件/损坏（Program Files 只读）→ 自动切 userData 下载
    const bundledOk = RAPIDOCR_MODELS.every((m) => {
      const p = join(modelsDir as string, m.file)
      return existsSync(p) && sha256Of(p) === m.sha256
    })
    if (!bundledOk && modelsDir !== join(require('electron').app.getPath('userData'), 'models', 'rapidocr')) {
      log().info('RapidOcr', 'bundled models incomplete — falling back to userData download')
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      modelsDir = join((require('electron') as typeof import('electron')).app.getPath('userData'), 'models', 'rapidocr')
    }
    mkdirSync(modelsDir, { recursive: true })
    for (const m of RAPIDOCR_MODELS) {
      const dest = join(modelsDir, m.file)
      if (existsSync(dest) && sha256Of(dest) === m.sha256) continue
      log().info('RapidOcr', `downloading ${m.file}…`)
      const tmp = `${dest}.tmp`
      await download(m.url, tmp)
      const got = sha256Of(tmp)
      if (got !== m.sha256) {
        try { unlinkSync(tmp) } catch { /* ignore */ }
        log().error('RapidOcr', `${m.file} sha256 mismatch (${got.slice(0, 12)}…), falling back to WinRT`)
        return false
      }
      renameSync(tmp, dest)
    }
    const det = await ort.InferenceSession.create(join(modelsDir, RAPIDOCR_MODELS[0].file), {
      executionProviders: ['cpu'], graphOptimizationLevel: 'all', intraOpNumThreads: 2,
    })
    const rec = await ort.InferenceSession.create(join(modelsDir, RAPIDOCR_MODELS[1].file), {
      executionProviders: ['cpu'], graphOptimizationLevel: 'all', intraOpNumThreads: 2,
    })
    const dictLines = readFileSync(join(modelsDir, RAPIDOCR_MODELS[2].file), 'utf-8').split('\n')
    while (dictLines.length > 0 && dictLines[dictLines.length - 1] === '') dictLines.pop()
    charset = ['blank', ...dictLines, ' ']   // 6625 类（实证 = rec 输出维度）
    detSession = det
    recSession = rec
    log().info('RapidOcr', `ready — charset ${charset.length} classes`)
    return true
  } catch (err) {
    log().error('RapidOcr', `init failed: ${err instanceof Error ? err.message : String(err)}`)
    return false
  }
}

/** 懒初始化（首次调用触发模型下载；失败冷却 5 分钟后自动重试，不再永久缓存失败）。 */
let ensureFailedAt = 0
async function ensureReadyOnce(): Promise<boolean> {
  if (detSession && recSession && charset) return true
  if (ensureFailedAt > 0 && Date.now() - ensureFailedAt < 5 * 60_000) return false
  if (ensurePromise === null) {
    ensurePromise = ensureReady().finally(() => {
      if (!detSession || !recSession || !charset) ensureFailedAt = Date.now()
      ensurePromise = null
    })
  }
  return ensurePromise
}

/**
 * RapidOCR 识别。返回 null = 未就绪/失败（调用方回退 WinRT）；
 * {ok:true,text} = 完成识别（空文本也是成功）。
 */
export async function recognizeWithRapid(dataUrl: string): Promise<{ ok: boolean; text: string } | null> {
  if (!dataUrl.startsWith('data:image/')) return null
  if (!(await ensureReadyOnce())) return null
  const img = nativeImage.createFromDataURL(dataUrl)
  const size = img.getSize()
  if (size.width < 4 || size.height < 4) return null
  const bitmap = img.toBitmap()   // Electron 原生位图为 BGRA（win 实证路径）
  try {
    // det：等比缩到 ≤960（/32 对齐）+ ImageNet 归一化
    const dw = detInputSize(size.width, size.height)
    const detTensor = new ort.Tensor('float32', rgbaToCHW(bitmap, size.width, size.height, dw.w, dw.h, IMAGENET_MEAN, IMAGENET_STD, true), [1, 3, dw.h, dw.w])
    const detOut = await (detSession as ort.InferenceSession).run({ x: detTensor })
    const probTensor = detOut[(detSession as ort.InferenceSession).outputNames[0]]
    const [mapH, mapW] = [probTensor.dims[2] as number, probTensor.dims[3] as number]
    const rawBoxes = boxesFromProbMap(probTensor.data as Float32Array, mapW, mapH, 0.3)
    if (rawBoxes.length === 0) return { ok: true, text: '' }
    const boxes = sortBoxesReadingOrder(
      rawBoxes.map((b) => mapBoxToOriginal(b, mapW, mapH, size.width, size.height)),
    )
    // rec：逐框裁剪（h=48 等比 + 宽度上限 800 实证调优：640 压扁致 O/0 混淆、
    // 1280 超出训练分布显著劣化；过窄 clamp 16 防除零）+ (x/255-0.5)/0.5 → CTC
    const lines: string[] = []
    for (const box of boxes as ProbBox[]) {
      const ratio = box.h > 0 ? box.w / box.h : 1
      const rw = Math.min(800, Math.max(16, Math.round(48 * ratio)))
      const recTensor = new ort.Tensor('float32', rgbaToCHW(bitmap, size.width, size.height, rw, 48, REC_MEAN_HALF, REC_STD_HALF, true, box), [1, 3, 48, rw])
      const recOut = await (recSession as ort.InferenceSession).run({ x: recTensor })
      const t = recOut[(recSession as ort.InferenceSession).outputNames[0]]
      const steps = t.dims[1] as number
      const classes = t.dims[2] as number
      if (classes !== (charset as string[]).length) return null   // 字符表不匹配 → 防乱码，回退
      const line = ctcIdxToString(ctcGreedyDecode(t.data as Float32Array, steps, classes), charset as string[])
      if (line.trim() !== '') lines.push(line)
    }
    return { ok: true, text: lines.join('\n') }
  } catch (err) {
    log().error('RapidOcr', `recognize failed: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}
