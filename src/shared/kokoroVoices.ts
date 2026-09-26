/**
 * R187/R192: Kokoro 音色目录——主进程(ttsService 校验/状态扫描)与渲染层
 * (音色下拉)共用,故放 shared。
 *
 * R192.2 实测修正:上游仓库 voices/ 有 55 个 .bin,但 kokoro-js@1.2.1 内置的
 * 音色注册表(_validate_voice)只认 **28 个英语音色**(af/am 美式、bf/bm 英式,
 * 见引擎 console.table 输出)——选 zf/zm/jf 等必然报 "Voice not found"。
 * 目录收敛为引擎实际支持集;升级 kokoro-js 后按新注册表放开。
 */

/** 前缀 → 语言+性别(af=US ♀ … bm=UK ♂)。 */
export const VOICE_LOCALES: Record<string, string> = {
  af: '美式英语 ♀', am: '美式英语 ♂', bf: '英式英语 ♀', bm: '英式英语 ♂',
}

/** kokoro-js@1.2.1 支持的 28 个英语音色(2026-09-26 引擎实测取证)。 */
export const KOKORO_VOICE_CATALOG: readonly string[] = [
  'af_heart', 'af_alloy', 'af_aoede', 'af_bella', 'af_jessica', 'af_kore', 'af_nicole', 'af_nova', 'af_river', 'af_sarah', 'af_sky',
  'am_adam', 'am_echo', 'am_eric', 'am_fenrir', 'am_liam', 'am_michael', 'am_onyx', 'am_puck', 'am_santa',
  'bf_emma', 'bf_isabella', 'bf_alice', 'bf_lily',
  'bm_george', 'bm_lewis', 'bm_daniel', 'bm_fable',
]

export function voiceLabel(id: string): string {
  const locale = VOICE_LOCALES[id.slice(0, 2)] ?? ''
  const name = id.slice(3)
  return locale === '' ? id : `${name} · ${locale}`
}
