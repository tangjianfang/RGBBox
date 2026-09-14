/**
 * denoiseProcessor — R91.3b DTLN 推理的 utilityProcess 入口。
 *
 * 独立进程跑 onnxruntime-node（R91.3b 架构决策：主进程直连推理曾把 UI 拖死
 * （R90 教训），onnxruntime-web 又有 electron-vite/file:// 的 wasm 打包坑；
 * utilityProcess + 已有原生依赖两头都避）。经 electron-vite 多入口构建为
 * out/main/denoiseProcessor.mjs，由 denoiseService fork。
 *
 * 消息协议（process.parentPort）：
 *   → { type: 'init',  model1: string, model2: string }
 *   ← { type: 'ready' } | { type: 'error', message }
 *   → { type: 'frames', id, blocks: Float32Array[] }   // 每 block = 512 样 16k
 *   ← { type: 'frames', id, blocks: Float32Array[] }   // 降噪后同形
 */
import process from 'node:process'
import ort from 'onnxruntime-node'
import {
  DTLN_BINS, DTLN_BLOCK, DtlnOlaAccumulator, fftInPlace,
} from '../shared/dtlnDsp'

interface InitMsg { type: 'init'; model1: string; model2: string }
interface FramesMsg { type: 'frames'; id: number; blocks: Float32Array[] }
type InMsg = InitMsg | FramesMsg | { type: 'stop' }

let s1: ort.InferenceSession | null = null
let s2: ort.InferenceSession | null = null
let in1: Record<string, ort.Tensor> | null = null
let in2: Record<string, ort.Tensor> | null = null

function mkStateInputs(sess: ort.InferenceSession): Record<string, ort.Tensor> {
  const inputs: Record<string, ort.Tensor> = {}
  // ValueMetadata's declared type misses `shape` in this ORT version (runtime
  // provides it — verified in the spike); read it through a loose cast.
  const metaList = sess.inputMetadata as unknown as Array<{ name: string; shape?: Array<number | undefined> }>
  for (const meta of metaList) {
    const dims = (meta.shape ?? [1]).map((d) => (typeof d === 'number' ? d : 1))
    const len = dims.reduce((a: number, b: number) => a * b, 1)
    inputs[meta.name] = new ort.Tensor('float32', new Float32Array(len), dims)
  }
  return inputs
}

/** Run the two-stage DTLN pipeline over one 512-sample analysis window
 *  (spike-verified protocol; LSTM states thread across calls). */
async function denoiseBlock(block: Float32Array): Promise<Float32Array> {
  const re = Float32Array.from(block)
  const im = new Float32Array(DTLN_BLOCK)
  fftInPlace(re, im, false)
  const mag = new Float32Array(DTLN_BINS)
  for (let k = 0; k < DTLN_BINS; k++) mag[k] = Math.hypot(re[k], im[k])

  const magT = new ort.Tensor('float32', mag, [1, 1, DTLN_BINS])
  in1![s1!.inputNames[0]] = magT
  const o1 = await s1!.run(in1!)
  const mask = o1[s1!.outputNames[0]] as ort.Tensor
  ;(in1![s1!.inputNames[1]].data as Float32Array).set(o1[s1!.outputNames[1]].data as Float32Array)

  // mask × magnitude × e^{jφ} → iFFT
  const er = new Float32Array(DTLN_BLOCK)
  const ei = new Float32Array(DTLN_BLOCK)
  for (let k = 0; k < DTLN_BINS; k++) {
    const m = mag[k] * (mask.data as Float32Array)[k]
    const ph = Math.atan2(im[k], re[k])
    er[k] = m * Math.cos(ph)
    ei[k] = m * Math.sin(ph)
    if (k > 0 && k < DTLN_BINS - 1) { er[DTLN_BLOCK - k] = er[k]; ei[DTLN_BLOCK - k] = -ei[k] }
  }
  fftInPlace(er, ei, true)

  const blkT = new ort.Tensor('float32', er, [1, 1, DTLN_BLOCK])
  in2![s2!.inputNames[0]] = blkT
  const o2 = await s2!.run(in2!)
  const out = o2[s2!.outputNames[0]] as ort.Tensor
  ;(in2![s2!.inputNames[1]].data as Float32Array).set(o2[s2!.outputNames[1]].data as Float32Array)
  return Float32Array.from(out.data as Float32Array)
}

process.parentPort.on('message', (e: { data: InMsg }) => {
  const msg = e.data
  if (msg.type === 'init') {
    Promise.all([
      ort.InferenceSession.create(msg.model1),
      ort.InferenceSession.create(msg.model2),
    ])
      .then(([m1, m2]) => {
        s1 = m1
        s2 = m2
        in1 = mkStateInputs(m1)
        in2 = mkStateInputs(m2)
        process.parentPort.postMessage({ type: 'ready' })
      })
      .catch((err: unknown) => {
        process.parentPort.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) })
      })
    return
  }
  if (msg.type === 'frames') {
    void (async () => {
      if (!s1 || !s2 || !in1 || !in2) {
        process.parentPort.postMessage({ type: 'error', message: 'not initialized' })
        return
      }
      const ola = new DtlnOlaAccumulator()
      const outBlocks: Float32Array[] = []
      try {
        for (const blk of msg.blocks) {
          ola.add(await denoiseBlock(blk))
          const hop = new Float32Array(128)
          ola.drainHop(hop)
          outBlocks.push(hop)
        }
        process.parentPort.postMessage({ type: 'frames', id: msg.id, blocks: outBlocks })
      } catch (err: unknown) {
        process.parentPort.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) })
      }
    })()
    return
  }
  if (msg.type === 'stop') {
    process.exit(0)
  }
})
