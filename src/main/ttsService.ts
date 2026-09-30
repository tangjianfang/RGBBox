/**
 * ttsService — R173-S2/R179 离线 TTS(Kokoro-82M ONNX 经 kokoro-js)。
 *
 * R179 重构:不再依赖 transformers.js 的自动下载(其 HF 端点解析在
 * hf-mirror 下会 404/失败,用户实测 `ai.voice.err.fetch failed`)——改为
 * **自建下载器**:模型文件经显式 URL(hf-mirror 主源 + HF 官方备源)流式
 * 下载到 userData/models/kokoro-local/...,带逐文件进度事件;完成后以
 * `env.localModelPath + allowRemoteModels=false` 纯本地加载,零网络。
 */
import { closeSync, createWriteStream, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { segmentsToWav } from './ttsWav'
import { KOKORO_VOICE_CATALOG } from '../shared/kokoroVoices'
import { hanziToPhonemes } from '../shared/zhPhonemes'

const KOKORO_REPO = 'onnx-community/kokoro-82M-v1.0-ONNX'
export const KOKORO_SAMPLE_RATE = 24000
export const DEFAULT_VOICE = 'af_heart'

/** v1 随包预置的音色(每个 ~8MB;其余音色 P-5 再开放按需下载)。 */
export const KOKORO_BUNDLED_VOICES = ['af_heart', 'af_bella', 'am_fenrir', 'bf_emma']

// R187: catalog + labels live in shared (renderer picker needs them too)
export { KOKORO_VOICE_CATALOG, voiceLabel } from '../shared/kokoroVoices'

export interface KokoroFileSpec {
  /** 相对 MODEL_DIR 的路径(transformers localModelPath 布局) */
  path: string
  /** 预期字节数(校验用;GET 无 content-length 时也作进度分母) */
  bytes: number
  required: boolean
  /** R212: 下载源(默认 kokoro 仓;piper 走 rhasspy/piper-voices zh 路径)。 */
  repo?: 'kokoro' | 'piper'
  /** R192.7: 内容哈希(LFS 文件取自 tree API 的 lfs.oid;小文件为镜像标准内容
   *  实算)。盘上已有文件先本地校验,通过即跳过——不再因启发式误判而重拉。 */
  sha256?: string
}

/** 流式计算文件 sha256(291MB 主模型 ~1s,仅在下载按钮触发时执行)。 */
function sha256File(file: string): string {
  const h = createHash('sha256')
  const fd = openSync(file, 'r')
  try {
    const buf = Buffer.alloc(1024 * 1024)
    let n = readSync(fd, buf, 0, buf.length, null)
    while (n > 0) {
      h.update(buf.subarray(0, n))
      n = readSync(fd, buf, 0, buf.length, null)
    }
  } finally {
    closeSync(fd)
  }
  return h.digest('hex')
}

// R192: bytes are the API-reported upstream sizes (hf-mirror tree API,
// 2026-09-26). The old estimates were wrong at the SOURCE — upstream
// tokenizer.json is a 3,497-byte character-level tokenizer (NOT a 2.6MB LFS
// blob), so the exact-accounting check rejected the COMPLETE file on every
// attempt ("size mismatch 3497/2726298"). Real total ≈ 293 MB.
export const KOKORO_FILES: KokoroFileSpec[] = [
  { path: 'config.json', bytes: 44, sha256: 'df34b4f930b23447cd4dc410fabfb42eb3f24e803e6c3f97d618fb359380a36f', required: true },
  { path: 'tokenizer.json', bytes: 3497, sha256: '77a02c8e164413299b4b4c403b14f8e0e1c1b727db4d46a09d6327b861060a34', required: true },
  // R192.2: AutoTokenizer reads this alongside tokenizer.json — without it the
  // engine load fell through to a remote fetch and died on DNS ("fetch failed").
  { path: 'tokenizer_config.json', bytes: 113, sha256: 'be1cb066d6ef6b074b3f15e6a6dd21ac88ff3cdaedf325f0aaed686c70f75d20', required: true },
  { path: 'onnx/model_q4.onnx', bytes: 305_215_966, sha256: '04cf570cf9c4153694f76347ed4b9a48c1b59ff1de0999e6605d123966b197c7', required: true },
  { path: 'voices/af_heart.bin', bytes: 522_240, sha256: 'd583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b', required: false },
  { path: 'voices/af_bella.bin', bytes: 522_240, sha256: 'f69d836209b78eb8c66e75e3cda491e26ea838a3674257e9d4e5703cbaf55c8b', required: false },
  { path: 'voices/am_fenrir.bin', bytes: 522_240, sha256: 'c27989f741f7ee34d273a39d8a595cc0837d35f5ced9a29b7cc162614616df43', required: false },
  { path: 'voices/bf_emma.bin', bytes: 522_240, sha256: '669fe0647f9dd04fcab92f1439a40eeb4c8b4ab1f82e4996fe3d918ce4a63b73', required: false },
]

export function kokoroFileUrl(path: string, mirror = true): string {
  const host = mirror ? 'https://hf-mirror.com' : 'https://huggingface.co'
  // ?download=true forces Content-Disposition: attachment — without it some
  // CDN responses come back as an HTML page (a 3497-byte one poisoned
  // tokenizer.json in the field) that passes HTTP 200.
  return `${host}/${KOKORO_REPO}/resolve/main/${path}?download=true`
}

// ── R212: Piper 中文本地引擎(zh_CN-huayan-medium,整句端到端 VITS) ──────────
// 选型:R197 桥(英文版 Kokoro+自创声调符号+60 音节分块硬拼)被用户试听判
// 「没什么区别,一点情感也没有」;Piper 为中文训练的端到端模型,韵律/停顿由
// 模型习得。G2P 用 piper-phonemize(纯 wasm,内置完整 espeak-ng cmn 数据),
// 拼音调值 1-5 直接在 phoneme 表内。模型 63.2MB(总预算 kokoro 之外新增)。
export const PIPER_REPO = 'rhasspy/piper-voices'
export const PIPER_ZH_VOICE = 'piper-zh' // 引擎选择器(voice 取此值走 Piper)
const PIPER_FILES: KokoroFileSpec[] = [
  { path: 'zh_CN-huayan-medium.onnx', bytes: 63_201_294, sha256: '9929917bf8cabb26fd528ea44d3a6699c11e87317a14765312420be230be0f3d', required: true, repo: 'piper' },
  { path: 'zh_CN-huayan-medium.onnx.json', bytes: 4822, sha256: 'd521dc45504a8ccc99e325822b35946dd701840bfb07e3dbb31a40929ed6a82b', required: true, repo: 'piper' },
]
export const PIPER_SAMPLE_RATE = 22050

export function piperFileUrl(file: string, mirror = true): string {
  const host = mirror ? 'https://hf-mirror.com' : 'https://huggingface.co'
  return `${host}/${PIPER_REPO}/resolve/main/zh/zh_CN/huayan/medium/${file}?download=true`
}

/** 布局:cacheRoot/piper-zh/<file> */
export function piperModelDir(cacheRoot: string): string {
  return join(cacheRoot, 'piper-zh')
}

/** 布局:cacheRoot/onnx-community/kokoro-82M-v1.0-ONNX/<path>(transformers localModelPath 兼容) */
export function kokoroModelDir(cacheRoot: string): string {
  return join(cacheRoot, 'kokoro-local', 'onnx-community', 'kokoro-82M-v1.0-ONNX')
}

export interface TtsModelFileStatus { path: string; bytes: number; present: boolean; actualBytes?: number }
export interface TtsModelStatus {
  complete: boolean
  files: TtsModelFileStatus[]
  /** 引擎运行时(kokoro-js 包本体)是否可用。 */
  kokoroInstalled: boolean
  bundledVoices: string[]
  /** R187: 音色 .bin 已在盘上的 id(含按需下载的目录外音色)。 */
  voices: string[]
  /** R212: Piper 中文引擎(模型文件齐备 + 包可用)。 */
  piper: { installed: boolean; complete: boolean; files: TtsModelFileStatus[] }
}

export function ttsModelStatus(cacheRoot: string): TtsModelStatus {
  const dir = kokoroModelDir(cacheRoot)
  const files: TtsModelFileStatus[] = KOKORO_FILES.map((f) => {
    const full = join(dir, f.path)
    if (!existsSync(full)) return { path: f.path, bytes: f.bytes, present: false }
    // R179: the downloader enforces exact content-length accounting, so any
    // on-disk size >0 means the file completed (the old >1KB heuristic
    // misclassified small legit files like config.json).
    const size = statSync(full).size
    return { path: f.path, bytes: f.bytes, present: size > 0, actualBytes: size }
  })
  // R187: scan the voices dir for every downloaded voice bin (catalog + any)
  let voices: string[] = []
  try {
    voices = readdirSync(join(dir, 'voices'))
      .filter((f) => f.endsWith('.bin') && KOKORO_VOICE_CATALOG.includes(f.replace(/\.bin$/, '')))
      .map((f) => f.replace(/\.bin$/, ''))
  } catch { /* no voices dir yet */ }
  // R212: piper zh engine status
  const piperDir = piperModelDir(cacheRoot)
  const piperFiles: TtsModelFileStatus[] = PIPER_FILES.map((f) => {
    const full = join(piperDir, f.path)
    if (!existsSync(full)) return { path: f.path, bytes: f.bytes, present: false }
    const size = statSync(full).size
    return { path: f.path, bytes: f.bytes, present: size === f.bytes, actualBytes: size }
  })
  return {
    complete: files.filter((f) => KOKORO_FILES.find((k) => k.path === f.path)?.required).every((f) => f.present),
    files,
    kokoroInstalled: (() => { try { require.resolve('kokoro-js'); return true } catch { return false } })(),
    bundledVoices: KOKORO_BUNDLED_VOICES,
    voices,
    piper: {
      installed: (() => { try { require.resolve('piper-phonemize'); return true } catch { return false } })(),
      complete: piperFiles.every((f) => f.present),
      files: piperFiles,
    },
  }
}

export interface TtsDownloadEvent {
  path: string
  receivedBytes: number
  totalBytes: number
  done: boolean
  error?: string
}

/** R179.1: download through Electron's network stack (Chromium) — it follows
 *  the system proxy, which plain Node fetch (undici) ignores. Node fetch is
 *  the fallback so this module stays unit-testable outside Electron. */
interface FetchLike { ok: boolean; status: number; headers: { get(name: string): string | null }; body: unknown }
async function xfetch(url: string, opts?: { signal?: AbortSignal; headers?: Record<string, string> }): Promise<FetchLike> {
  try {
    const { net } = await import('electron')
    if (net?.fetch) return (await net.fetch(url, { signal: opts?.signal, headers: opts?.headers, bypassCustomProtocolHandlers: true })) as unknown as FetchLike
  } catch { /* not in Electron (tests) */ }
  return fetch(url, { signal: opts?.signal, headers: opts?.headers }) as unknown as FetchLike
}

/** R182: hf-mirror sometimes answers 200 with an HTML notice page (3497B) —
 *  detect and reject it so the retry/fallback chain can pick another source. */
export function looksLikeHtmlPage(buf: Buffer): boolean {
  const head = buf.subarray(0, 200).toString('latin1').trimStart().toLowerCase()
  return head.startsWith('<!doctype') || head.startsWith('<html') || head.includes('<body')
}

/** R185: 单文件下载——mirror 主源失败回落 HF 官方,每源 2 次;`.part` 断点续传
 *  (Range 追加写)、416 毒分片自愈、首块 HTML 页检测、精确字节对账、tmp+rename
 *  原子落盘。返回 ''=成功(或已存在),否则为错误描述。 */
async function downloadOneFile(
  spec: KokoroFileSpec,
  dir: string,
  onEvent: (ev: TtsDownloadEvent) => void,
  signal?: AbortSignal,
): Promise<string> {
  const target = join(dir, spec.path)
  // R192.7: a file already on disk is VERIFIED LOCALLY and skipped — the old
  // `size > 1024` heuristic re-fetched the 44-byte config.json on every click
  // (one network hiccup then painted a false "fetch failed" on a healthy
  // cache). With sha256 pinned: size AND hash must match; without a pinned
  // hash, exact size suffices.
  if (existsSync(target)) {
    const size = statSync(target).size
    if (size === spec.bytes && (spec.sha256 === undefined || sha256File(target) === spec.sha256)) return ''
  }
  mkdirSync(join(target, '..'), { recursive: true })
  const partPath = `${target}.part`
  let lastErr = ''
  for (const mirror of [true, false]) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (signal?.aborted) return 'cancelled'
      try {
        // resume: continue from an existing .part when the server honors Range
        let have = existsSync(partPath) ? statSync(partPath).size : 0
        const useRange = have > 0
        const res = await xfetch(spec.repo === 'piper' ? piperFileUrl(spec.path, mirror) : kokoroFileUrl(spec.path, mirror), {
          signal,
          headers: useRange ? { Range: `bytes=${have}-` } : undefined,
        })
        // R179.2: 416 = the local .part is poisoned (0-byte/oversized from an
        // earlier crash) — drop it and retry this attempt as a full download
        if (res.status === 416 && useRange) {
          rmSync(partPath, { force: true })
          have = 0
          attempt -= 1 // retry the same attempt slot without consuming it
          continue
        }
        if (res.status !== 200 && res.status !== 206) throw new Error(`HTTP ${res.status}`)
        const resuming = res.status === 206 && have > 0
        const lenHeader = Number(res.headers.get('content-length') ?? 0)
        const total = resuming ? have + lenHeader : (lenHeader || spec.bytes)
        // R192: a 200 full-body answer to a Range request OVERWRITES the part
        // (flags 'w') — counting the stale `have` on top double-counted bytes
        // and failed accounting on every attempt. Only 206 resumes add `have`.
        let received = resuming ? have : 0
        const stream = Readable.fromWeb((res as unknown as { body: Parameters<typeof Readable.fromWeb>[0] }).body)
        const out = createWriteStream(partPath, { flags: resuming ? 'a' : 'w' })
        let firstChunkChecked = false
        stream.on('data', (chunk: Buffer) => {
          if (!firstChunkChecked) {
            firstChunkChecked = true
            const head = Buffer.from(chunk.subarray(0, 64)).toString('latin1').trimStart().toLowerCase()
            if (head.startsWith('<!doctype') || head.startsWith('<html')) {
              stream.destroy()
              out.destroy()
              rmSync(partPath, { force: true })
              onEvent({ path: spec.path, receivedBytes: 0, totalBytes: total, done: true, error: 'mirror returned an HTML page' })
              lastErr = 'mirror returned an HTML page instead of the file'
              stream.emit('error', new Error(lastErr))
              return
            }
          }
          received += chunk.length
          onEvent({ path: spec.path, receivedBytes: received, totalBytes: total, done: false })
        })
        await pipeline(stream, out)
        // exact accounting — a short body means a truncated/corrupt file
        if (total > 0 && received !== total) {
          rmSync(partPath, { force: true })
          throw new Error(`size mismatch ${received}/${total}`)
        }
        renameSync(partPath, target)
        onEvent({ path: spec.path, receivedBytes: received, totalBytes: received, done: true })
        lastErr = ''
        break
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e)
        if (signal?.aborted) return 'cancelled'
        await new Promise((r) => setTimeout(r, 1500)) // backoff between attempts
      }
    }
    if (lastErr === '') break
  }
  if (lastErr !== '' && spec.required) {
    onEvent({ path: spec.path, receivedBytes: 0, totalBytes: spec.bytes, done: true, error: lastErr })
    return `${spec.path}: ${lastErr}`
  }
  return ''
}

/** 下载全部(或 `only` 指定的)缺失文件。R185: 3 路并发——291MB 主模型不再被
 *  5KB 的 config.json 串行阻塞;单文件失败不再中断其余文件(可单独重试)。 */
export async function ttsDownloadModels(
  cacheRoot: string,
  onEvent: (ev: TtsDownloadEvent) => void,
  signal?: AbortSignal,
  opts?: { only?: string[]; piper?: boolean },
): Promise<{ ok: boolean; error?: string }> {
  // R212: piper=true 时下载中文引擎文件(独立目录);默认维持 kokoro 全量。
  if (opts?.piper === true) {
    const piperDir = piperModelDir(cacheRoot)
    let failure = ''
    for (const spec of PIPER_FILES) {
      if (signal?.aborted) return { ok: false, error: 'cancelled' }
      const err = await downloadOneFile(spec, piperDir, onEvent, signal)
      if (err !== '') failure = err
    }
    return failure === '' ? { ok: true } : { ok: false, error: failure }
  }
  const dir = kokoroModelDir(cacheRoot)
  const specs = KOKORO_FILES.filter((f) => opts?.only === undefined || opts.only.includes(f.path))
  const queue = [...specs]
  const failures: string[] = []
  const worker = async (): Promise<void> => {
    for (let spec = queue.shift(); spec !== undefined; spec = queue.shift()) {
      if (signal?.aborted) return
      const err = await downloadOneFile(spec, dir, onEvent, signal)
      if (err !== '') failures.push(err)
      if (signal?.aborted) return
    }
  }
  const lanes = Math.min(3, specs.length)
  await Promise.all(Array.from({ length: lanes }, () => worker()))
  if (signal?.aborted) return { ok: false, error: 'cancelled' }
  return failures.length > 0 ? { ok: false, error: failures.join('; ') } : { ok: true }
}

/** R187: 按需下载单个音色(目录内 55 个之一;~8MB)。复用 downloadOneFile 的
 *  Range 续传/HTML 页检测/字节对账;音色不入 KOKORO_FILES,complete 语义不变。 */
export async function ttsDownloadVoice(
  cacheRoot: string,
  voice: string,
  onEvent: (ev: TtsDownloadEvent) => void,
): Promise<{ ok: boolean; error?: string }> {
  if (!KOKORO_VOICE_CATALOG.includes(voice)) return { ok: false, error: 'unknown-voice' }
  const err = await downloadOneFile(
    { path: `voices/${voice}.bin`, bytes: 522_240, required: false },
    kokoroModelDir(cacheRoot),
    (ev) => onEvent({ ...ev, path: `voices/${voice}.bin` }),
  )
  return err === '' ? { ok: true } : { ok: false, error: err }
}

// ── 引擎(纯本地加载)───────────────────────────────────────────────────────

interface KokoroTtsInstance {
  generate: (text: string, opts?: { voice?: string; speed?: number }) => Promise<{ audio: Float32Array; sampling_rate?: number }>
  /** R197: 直喂音素 id 的入口(绕过英语 G2P)——中文桥走这里。 */
  generate_from_ids?: (ids: unknown, opts?: { voice?: string; speed?: number }) => Promise<{ audio: Float32Array; sampling_rate?: number }>
  tokenizer?: (text: string, opts?: Record<string, unknown>) => { input_ids: unknown }
}

let enginePromise: Promise<KokoroTtsInstance> | null = null

async function getEngine(cacheRoot: string): Promise<KokoroTtsInstance> {
  if (!enginePromise) {
    enginePromise = (async () => {
      const status = ttsModelStatus(cacheRoot)
      if (!status.complete) throw new Error('model-not-ready')
      const mod = (await import('kokoro-js')) as unknown as {
        KokoroTTS?: { from_pretrained: (repo: string, opts: Record<string, unknown>) => Promise<KokoroTtsInstance> }
      }
      if (!mod.KokoroTTS) throw new Error('KokoroTTS export missing')
      // R192.2: kokoro-js re-exports an `env` that is a {wasmPaths} shim — NOT
      // the transformers env. Setting allowRemoteModels/localModelPath on it
      // was a silent no-op, so a missing tokenizer_config.json made the load
      // fall through to a live huggingface.co fetch (DNS-polluted → "fetch
      // failed" after ~10s). The REAL env lives in @huggingface/transformers
      // (declared as a direct dep so the hoisted instance is the same one
      // kokoro-js uses).
      const tr = (await import('@huggingface/transformers')) as unknown as {
        env?: { localModelPath?: string; allowRemoteModels?: boolean }
      }
      if (tr.env) {
        tr.env.allowRemoteModels = false
        tr.env.localModelPath = join(cacheRoot, 'kokoro-local')
      }
      return mod.KokoroTTS.from_pretrained(KOKORO_REPO, { dtype: 'q4', device: 'cpu' })
    })().catch((err) => {
      enginePromise = null
      throw err
    })
  }
  return enginePromise
}

// ── R212: Piper 中文引擎运行时(懒加载;onnxruntime-node 与 piper-phonemize
// 都是产品依赖,纯本地)。ids 规则 = BOS ^ + (每音素 id + PAD _) … + EOS $,
// 与探针(2026-09-29)实测的 Piper 惯例一致。───────────────────────────────
type OrtTensorLike = { data: Float32Array | BigUint64Array; dims: readonly number[] }
interface PiperSession {
  run: (feeds: Record<string, unknown>) => Promise<Record<string, OrtTensorLike>>
  inputNames: readonly string[]
  outputNames: readonly string[]
}
let piperSessionCache: { dir: string; session: PiperSession; idMap: Record<string, number[]>; scales: { noise_scale: number; length_scale: number; noise_w: number } } | null = null

/** 线性插值重采样(混合导出时把 Piper 22k 对齐 Kokoro 24k)。 */
function resampleTo(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to || input.length === 0) return input
  const ratio = to / from
  const out = new Float32Array(Math.round(input.length * ratio))
  for (let i = 0; i < out.length; i++) {
    const pos = i / ratio
    const i0 = Math.floor(pos)
    const i1 = Math.min(input.length - 1, i0 + 1)
    const t = pos - i0
    out[i] = input[i0] * (1 - t) + input[i1] * t
  }
  return out
}

/** 音素串→Piper ids(BOS+音素×PAD 间隔+EOS);表外字符跳过。纯函数,单测覆盖。 */
export function piperPhonemesToIds(phonemes: string, idMap: Record<string, number[]>): number[] {
  const bos = idMap['^']?.[0]
  const eos = idMap['$']?.[0]
  const pad = idMap['_']?.[0]
  const ids: number[] = []
  if (bos !== undefined) ids.push(bos)
  for (const ch of phonemes) {
    const id = idMap[ch]?.[0]
    if (id === undefined) continue
    ids.push(id)
    if (pad !== undefined) ids.push(pad)
  }
  if (eos !== undefined) ids.push(eos)
  return ids
}

async function getPiperEngine(cacheRoot: string): Promise<NonNullable<typeof piperSessionCache>> {
  if (piperSessionCache !== null && piperSessionCache.dir === piperModelDir(cacheRoot)) return piperSessionCache
  const dir = piperModelDir(cacheRoot)
  let cfgJson: string
  try {
    cfgJson = readFileSync(join(dir, 'zh_CN-huayan-medium.onnx.json'), 'utf8')
  } catch {
    throw new Error('piper-config-missing')
  }
  const cfg = JSON.parse(cfgJson) as {
    phoneme_id_map?: Record<string, number[]>
    inference?: { noise_scale: number; length_scale: number; noise_w: number }
  }
  if (cfg.phoneme_id_map === undefined) throw new Error('piper-config-missing')
  const ort = (await import('onnxruntime-node')) as unknown as {
    InferenceSession: { create: (path: string, opts?: unknown) => Promise<PiperSession> }
    Tensor: new (type: string, data: unknown, dims: readonly number[]) => unknown
  }
  const session = await ort.InferenceSession.create(join(dir, 'zh_CN-huayan-medium.onnx'), { graphOptimizationLevel: 'all' })
  piperSessionCache = {
    dir,
    session,
    idMap: cfg.phoneme_id_map,
    scales: cfg.inference ?? { noise_scale: 0.667, length_scale: 1, noise_w: 0.8 },
  }
  return piperSessionCache
}

/** Piper 中文合成:逐句(espeak cmn 按标点分段)→ids→VITS→拼接。 */
async function piperSynthesize(
  segments: string[],
  opts: { speed?: number },
): Promise<{ audio: Float32Array; sampleRate: number }> {
  const pp = (await import('piper-phonemize')) as unknown as { phonemizeToString: (text: string, voice: string) => string[] }
  const all: number[] = []
  for (const seg of segments) {
    if (seg.trim() === '') continue
    // 引擎实例在 ttsSynthesize 侧已就绪(cacheRoot 传入)
    const eng = piperSessionCache
    if (eng === null) throw new Error('piper-not-ready')
    const chunks = pp.phonemizeToString(seg, 'cmn')
    for (const ph of chunks) {
      const ids = piperPhonemesToIds(ph, eng.idMap)
      if (ids.length <= 2) continue
      const ort = (await import('onnxruntime-node')) as unknown as { Tensor: new (type: string, data: unknown, dims: readonly number[]) => unknown }
      const feeds: Record<string, unknown> = {
        input: new ort.Tensor('int64', new BigInt64Array(ids.map((v) => BigInt(v))), [1, ids.length]),
        input_lengths: new ort.Tensor('int64', new BigInt64Array([BigInt(ids.length)]), [1]),
        // speed>1 = 说快 → length_scale 反比(Piper 惯例)
        scales: new ort.Tensor('float32', Float32Array.from([eng.scales.noise_scale, eng.scales.length_scale / (opts.speed ?? 1), eng.scales.noise_w]), [3]),
      }
      const out = await eng.session.run(feeds)
      const audio = out[eng.session.outputNames[0]].data as Float32Array
      for (const v of audio) all.push(v)
    }
  }
  return { audio: Float32Array.from(all), sampleRate: PIPER_SAMPLE_RATE }
}

export async function ttsSynthesize(
  segments: string[],
  opts: { voice?: string; speed?: number; cacheDir: string; perSegmentVoices?: Array<string | undefined> },
): Promise<{ ok: boolean; wav?: Buffer; sampleRate?: number; error?: string }> {
  if (segments.length === 0) return { ok: false, error: 'empty' }
  try {
    // R212: voice=PIPER_ZH_VOICE(或混合导出中 zh 句路由到它)走 Piper 中文引擎;
    // 其余声部不变。整批全是 piper 时无需加载 kokoro 引擎。
    const piperSegments: Array<number | null> = segments.map((_, i) => {
      const segVoice = opts.perSegmentVoices?.[i] ?? opts.voice
      return segVoice === PIPER_ZH_VOICE ? i : null
    }).filter((v): v is number => v !== null)
    if (piperSegments.length === segments.length) {
      await getPiperEngine(opts.cacheDir)
      const out = await piperSynthesize(segments, { speed: opts.speed })
      return { ok: true, wav: segmentsToWav([out.audio], out.sampleRate), sampleRate: out.sampleRate }
    }
    if (piperSegments.length > 0) {
      // 混合:逐段路由(中文句 Piper,英文句 Kokoro),拼单个 WAV——采样率不同
      // 时以 Kokoro 24k 为主,把 Piper 22k 线性插值到 24k。
      await getPiperEngine(opts.cacheDir)
      const engine = await getEngine(opts.cacheDir)
      const parts: Float32Array[] = []
      for (let i = 0; i < segments.length; i += 1) {
        if (piperSegments.includes(i)) {
          const out = await piperSynthesize([segments[i]], { speed: opts.speed })
          parts.push(resampleTo(out.audio, out.sampleRate, KOKORO_SAMPLE_RATE))
        } else {
          const segVoice = opts.perSegmentVoices?.[i] ?? opts.voice ?? DEFAULT_VOICE
          if (/^(zf|zm)_/.test(segVoice)) {
            if (engine.generate_from_ids === undefined || engine.tokenizer === undefined) throw new Error('zh-bridge-unavailable')
            const phonemes = hanziToPhonemes(segments[i])
            const syllables = phonemes.split(' ')
            const chunks: string[] = []
            for (let s = 0; s < syllables.length; s += 60) chunks.push(syllables.slice(s, s + 60).join(' '))
            for (const chunk of chunks) {
              const { input_ids } = engine.tokenizer(chunk, { truncation: true })
              const out = await engine.generate_from_ids(input_ids, { voice: segVoice, speed: opts.speed ?? 1 })
              parts.push(out.audio)
            }
          } else {
            const out = await engine.generate(segments[i], { voice: segVoice, speed: opts.speed ?? 1 })
            parts.push(out.audio)
          }
        }
      }
      return { ok: true, wav: segmentsToWav(parts, KOKORO_SAMPLE_RATE), sampleRate: KOKORO_SAMPLE_RATE }
    }
    const engine = await getEngine(opts.cacheDir)
    const voice = opts.voice && opts.voice.trim() !== '' ? opts.voice.trim() : DEFAULT_VOICE
    const speed = typeof opts.speed === 'number' && opts.speed > 0 ? opts.speed : 1
    // R197: 中文音色走拼音→IPA 桥 + generate_from_ids 直喂(kokoro-js 只有
    // 英语 G2P;实测该入口不校验音色名,zf/zm 的 .bin 即可发声)。
    // perSegmentVoices: 导出混合文本时逐句指定(zh 句桥音色/en 句英语音色)。
    const audio: Float32Array[] = []
    for (let i = 0; i < segments.length; i += 1) {
      const segVoice = opts.perSegmentVoices?.[i] ?? voice
      if (/^(zf|zm)_/.test(segVoice)) {
        if (engine.generate_from_ids === undefined || engine.tokenizer === undefined) throw new Error('zh-bridge-unavailable')
        const phonemes = hanziToPhonemes(segments[i])
        // R197.2: the tokenizer caps at 510 tokens (truncation would silently
        // drop the tail) — long sentences chunk by syllables (~3-6 tokens
        // each; 60 syllables stays well clear) and concatenate the audio.
        const syllables = phonemes.split(' ')
        const chunks: string[] = []
        for (let s = 0; s < syllables.length; s += 60) chunks.push(syllables.slice(s, s + 60).join(' '))
        for (const chunk of chunks) {
          const { input_ids } = engine.tokenizer(chunk, { truncation: true })
          const out = await engine.generate_from_ids(input_ids, { voice: segVoice, speed })
          audio.push(out.audio)
        }
      } else {
        const out = await engine.generate(segments[i], { voice: segVoice, speed })
        audio.push(out.audio)
      }
    }
    return { ok: true, wav: segmentsToWav(audio, KOKORO_SAMPLE_RATE), sampleRate: KOKORO_SAMPLE_RATE }
  } catch (e) {
    // R212: 'piper-config-missing' 对用户语义就是「模型未就绪」——归一成既有错误码
    const raw = e instanceof Error ? e.message : String(e)
    return { ok: false, error: raw === 'piper-config-missing' ? 'model-not-ready' : raw }
  }
}
