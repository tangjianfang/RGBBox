/**
 * R187: Kokoro 全量音色目录——主进程(ttsService 校验/状态扫描)与渲染层
 * (音色下拉)共用,故放 shared。列表为 2026-09-26 hf-mirror tree API 实测的
 * 55 个音色 .bin(af.bin/am.bin 为打包张量,非独立音色,不列)。
 */

/** 前缀 → 语言+性别(af=US ♀ … zm=中文 ♂)。 */
export const VOICE_LOCALES: Record<string, string> = {
  af: '美式英语 ♀', am: '美式英语 ♂', bf: '英式英语 ♀', bm: '英式英语 ♂',
  ef: '西班牙语 ♀', em: '西班牙语 ♂', ff: '瑞士法语 ♀',
  hf: '印地语 ♀', hm: '印地语 ♂', if: '意大利语 ♀', im: '意大利语 ♂',
  jf: '日语 ♀', jm: '日语 ♂', pf: '葡萄牙语 ♀', pm: '葡萄牙语 ♂',
  zf: '中文 ♀', zm: '中文 ♂',
}

export const KOKORO_VOICE_CATALOG: readonly string[] = [
  'af_alloy', 'af_aoede', 'af_bella', 'af_heart', 'af_jessica', 'af_kore', 'af_nicole', 'af_nova', 'af_river', 'af_sarah', 'af_sky',
  'am_adam', 'am_echo', 'am_eric', 'am_fenrir', 'am_liam', 'am_michael', 'am_onyx', 'am_puck', 'am_santa',
  'bf_alice', 'bf_emma', 'bf_isabella', 'bf_lily',
  'bm_daniel', 'bm_fable', 'bm_george', 'bm_lewis',
  'ef_dora', 'em_alex', 'em_santa', 'ff_siwis',
  'hf_alpha', 'hf_beta', 'hm_omega', 'hm_psi',
  'if_sara', 'im_nicola',
  'jf_alpha', 'jf_gongitsune', 'jf_nezumi', 'jf_tebukuro', 'jm_kumo',
  'pf_dora', 'pm_alex', 'pm_santa',
  'zf_xiaobei', 'zf_xiaoni', 'zf_xiaoxiao', 'zf_xiaoyi',
  'zm_yunjian', 'zm_yunxi', 'zm_yunxia', 'zm_yunyang',
]

export function voiceLabel(id: string): string {
  const locale = VOICE_LOCALES[id.slice(0, 2)] ?? ''
  const name = id.slice(3)
  return locale === '' ? id : `${name} · ${locale}`
}
