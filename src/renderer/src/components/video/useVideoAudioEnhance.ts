/**
 * useVideoAudioEnhance — R91.3 电影 EQ 链 + DTLN 降噪（视频播放器专用）。
 *
 * EQ：懒建 MediaElementSource → [denoise worklet] → biquad 链 → 压缩器 →
 * GainNode（一经建图常驻；预设「关闭」= 全通 bypass）。远程 http(s) 无 CORS
 * 流拒绝建链（入图即静音）。参数纯函数在 audioEnhance.ts。
 *
 * 降噪（R91.3b）：推理在主进程 utilityProcess（denoiseService），本 hook 只
 * 编排——denoiseStart（模型缺失时自动 modelDownload 下载）→ 建 worklet 接入
 * 链路 → 双向中继帧（worklet port ↔ IPC）。DTLN 是语音增强模型（会压非语音
 * 成分），默认关、干湿强度可调。
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { ENHANCE_PRESETS, clampEnhanceGain, type EnhancePresetId } from './audioEnhance'
import { DENOISE_WORKLET_SOURCE } from './denoiseWorkletSource'

export type DenoiseStatus = 'idle' | 'downloading' | 'starting' | 'on' | 'error'

export function useVideoAudioEnhance(videoRef: RefObject<HTMLVideoElement | null>) {
  const ctxRef = useRef<AudioContext | null>(null)
  const srcRef = useRef<MediaElementAudioSourceNode | null>(null)
  const bandsRef = useRef<BiquadFilterNode[]>([])
  const compRef = useRef<DynamicsCompressorNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const workletRef = useRef<AudioWorkletNode | null>(null)
  const workletModuleUrlRef = useRef<string | null>(null)
  const [presetId, setPresetId] = useState<EnhancePresetId>('off')
  const [gainDb, setGainDb] = useState(0)
  const [enhanceError, setEnhanceError] = useState<string | null>(null)

  const [denoiseStatus, setDenoiseStatus] = useState<DenoiseStatus>('idle')
  const [denoiseStrength, setDenoiseStrengthState] = useState(1)
  const [denoiseMessage, setDenoiseMessage] = useState<string>('')

  /** True if the current source cannot be routed through WebAudio safely. */
  const isRemoteNoCors = useCallback((): boolean => {
    const el = videoRef.current
    if (!el || !el.currentSrc) return false
    return /^https?:\/\//i.test(el.currentSrc) && !el.crossOrigin
  }, [videoRef])

  const ensureGraph = useCallback((): boolean => {
    const el = videoRef.current
    if (!el) return false
    if (ctxRef.current && srcRef.current) return true
    if (isRemoteNoCors()) { setEnhanceError('ERR_REMOTE'); return false }
    try {
      const AC: typeof AudioContext | undefined = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) { setEnhanceError('ERR_NO_WEBAUDIO'); return false }
      const ctx = new AC()
      const src = ctx.createMediaElementSource(el)
      const comp = ctx.createDynamicsCompressor()
      const gain = ctx.createGain()
      src.connect(comp)
      comp.connect(gain)
      gain.connect(ctx.destination)
      ctxRef.current = ctx
      srcRef.current = src
      compRef.current = comp
      gainNodeRef.current = gain
      return true
    } catch {
      setEnhanceError('ERR_CREATE')
      return false
    }
  }, [videoRef, isRemoteNoCors])

  /** Wire src → [worklet] → bands → comp → gain from scratch (both callers
   *  rewire: preset changes and denoise worklet insertion). */
  const rewire = useCallback((): void => {
    const src = srcRef.current
    const comp = compRef.current
    if (!src || !comp) return
    const plan = ENHANCE_PRESETS[presetId]
    const ctx = ctxRef.current!
    src.disconnect()
    bandsRef.current.forEach((b) => b.disconnect())
    bandsRef.current = []
    let node: AudioNode = src
    const wl = workletRef.current
    if (wl) { node.connect(wl); node = wl }
    for (const spec of plan.bands) {
      const b = ctx.createBiquadFilter()
      b.type = spec.type
      b.frequency.value = spec.freq
      if (spec.q !== undefined) b.Q.value = spec.q
      if (spec.gain !== undefined) b.gain.value = spec.gain
      node.connect(b)
      node = b
      bandsRef.current.push(b)
    }
    node.connect(comp)
    const c = plan.compressor
    comp.threshold.value = c.threshold
    comp.knee.value = c.knee
    comp.ratio.value = c.ratio
    comp.attack.value = c.attack
    comp.release.value = c.release
  }, [presetId])

  // Re-wire whenever the preset changes (off with no graph = lazy skip)
  useEffect(() => {
    if (presetId === 'off' && !ctxRef.current) return
    if (!ensureGraph()) { setPresetId('off'); return }
    rewire()
  }, [presetId, ensureGraph, rewire])

  // Output gain rides the tail GainNode (dB → linear)
  useEffect(() => {
    const g = gainNodeRef.current
    if (g) g.gain.value = Math.pow(10, clampEnhanceGain(gainDb) / 20)
  }, [gainDb, presetId])

  const setPreset = useCallback((id: EnhancePresetId) => {
    setEnhanceError(null)
    setPresetId(id)
  }, [])

  const setGain = useCallback((db: number) => setGainDb(clampEnhanceGain(db)), [])

  // ── R91.3b: DTLN denoise orchestration ──────────────────────────────────
  useEffect(() => {
    // Renderer-side frame pump: worklet → IPC → utility → IPC → worklet
    const off = window.rgbbox.onDenoiseFrames((payload) => {
      workletRef.current?.port.postMessage({ type: 'frames', blocks: payload.blocks })
    })
    return () => { off() }
  }, [])

  const enableDenoise = useCallback(async (): Promise<void> => {
    if (denoiseStatus === 'downloading' || denoiseStatus === 'starting') return
    setDenoiseMessage('')
    if (!ensureGraph()) { setDenoiseStatus('error'); setDenoiseMessage('ERR_NO_WEBAUDIO'); return }
    setDenoiseStatus('starting')
    try {
      let res = await window.rgbbox.denoiseStart()
      if (!res.ok && res.missing && res.missing.length > 0) {
        setDenoiseStatus('downloading')
        for (const name of res.missing) {
          await window.rgbbox.modelDownload(name)
        }
        res = await window.rgbbox.denoiseStart()
      }
      if (!res.ok) throw new Error(res.message ?? `models missing: ${res.missing?.join(',')}`)

      // attach the relay worklet (blob module — dev/prod identical)
      if (!workletRef.current) {
        const ctx = ctxRef.current!
        if (!workletModuleUrlRef.current) {
          workletModuleUrlRef.current = URL.createObjectURL(new Blob([DENOISE_WORKLET_SOURCE], { type: 'text/javascript' }))
        }
        await ctx.audioWorklet.addModule(workletModuleUrlRef.current)
        const wl = new AudioWorkletNode(ctx, 'dtln-relay', {
          numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
        })
        wl.port.onmessage = (e: MessageEvent<{ type: string; id?: number; blocks?: Float32Array[] }>) => {
          const m = e.data
          if (m.type === 'send' && m.blocks) window.rgbbox.denoiseSendFrames(m.id ?? 0, m.blocks)
        }
        workletRef.current = wl
        rewire()
      }
      const wl = workletRef.current!
      wl.port.postMessage({ type: 'strength', value: denoiseStrength })
      wl.port.postMessage({ type: 'enable', value: true })
      setDenoiseStatus('on')
    } catch (err) {
      setDenoiseStatus('error')
      setDenoiseMessage(err instanceof Error ? err.message : String(err))
    }
  }, [denoiseStatus, ensureGraph, rewire, denoiseStrength])

  const disableDenoise = useCallback(async (): Promise<void> => {
    workletRef.current?.port.postMessage({ type: 'enable', value: false })
    setDenoiseStatus('idle')
    setDenoiseMessage('')
    await window.rgbbox.denoiseStop().catch(() => undefined)
  }, [])

  const toggleDenoise = useCallback((on: boolean): void => {
    if (on) void enableDenoise()
    else void disableDenoise()
  }, [enableDenoise, disableDenoise])

  const setDenoiseStrength = useCallback((v: number): void => {
    const clamped = Math.min(1, Math.max(0, v))
    setDenoiseStrengthState(clamped)
    workletRef.current?.port.postMessage({ type: 'strength', value: clamped })
  }, [])

  // App-exit hygiene: stop the utility process with the view (keep-alive means
  // this only fires on real teardown).
  useEffect(() => () => {
    workletRef.current?.port.postMessage({ type: 'enable', value: false })
    if (workletModuleUrlRef.current) URL.revokeObjectURL(workletModuleUrlRef.current)
    void window.rgbbox.denoiseStop().catch(() => undefined)
  }, [])

  // MediaElementSource 不会随元素 src 变化失效——同一元素换片无需重建图。
  return {
    presetId, setPreset, gainDb, setGain, enhanceError,
    denoiseStatus, denoiseStrength, setDenoiseStrength, toggleDenoise, denoiseMessage,
  }
}
