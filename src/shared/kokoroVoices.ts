/**
 * R187/R192/R197: Kokoro 音色目录——主进程(ttsService 校验/状态扫描)与渲染层
 * (音色下拉)共用,故放 shared。
 *
 * R192.2:引擎注册表只认 28 个英语音色(af/am/bf/bm),英语句走 generate()。
 * R197:zf/zm 中文音色经 拼音→IPA 桥 + generate_from_ids 直喂发声(真机实测:
 * zf_xiaobei 合成 6.95s 音频/3.1s 计算),目录恢复 8 个中文音色(标「实验」,
 * 声调映射按听感迭代)。
 */

/** 前缀 → 语言+性别。 */
export const VOICE_LOCALES: Record<string, string> = {
  af: '美式英语 ♀', am: '美式英语 ♂', bf: '英式英语 ♀', bm: '英式英语 ♂',
  zf: '中文 ♀(实验)', zm: '中文 ♂(实验)',
}

/** 引擎支持的 28 英语 + 桥接的 8 中文音色。 */
export const KOKORO_VOICE_CATALOG: readonly string[] = [
  'af_heart', 'af_alloy', 'af_aoede', 'af_bella', 'af_jessica', 'af_kore', 'af_nicole', 'af_nova', 'af_river', 'af_sarah', 'af_sky',
  'am_adam', 'am_echo', 'am_eric', 'am_fenrir', 'am_liam', 'am_michael', 'am_onyx', 'am_puck', 'am_santa',
  'bf_emma', 'bf_isabella', 'bf_alice', 'bf_lily',
  'bm_george', 'bm_lewis', 'bm_daniel', 'bm_fable',
  // R197: 中文桥音色(.bin 在仓库 voices/ 目录,按需下载)
  'zf_xiaobei', 'zf_xiaoni', 'zf_xiaoxiao', 'zf_xiaoyi',
  'zm_yunjian', 'zm_yunxi', 'zm_yunxia', 'zm_yunyang',
]

/** 中文桥音色前缀(ttsService 以此路由到 zh 管线)。 */
export function isZhVoice(id: string): boolean {
  return /^(zf|zm)_/.test(id)
}

export function voiceLabel(id: string): string {
  const locale = VOICE_LOCALES[id.slice(0, 2)] ?? ''
  const name = id.slice(3)
  return locale === '' ? id : `${name} · ${locale}`
}
