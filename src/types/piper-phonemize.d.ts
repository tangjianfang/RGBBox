/** R212: piper-phonemize(纯 wasm espeak-ng G2P)——包本体无类型,手写声明。 */
declare module 'piper-phonemize' {
  /** 按句分段音素化(espeak-ng 惯例:每元素为一句的音素串)。 */
  export function phonemize(text: string, voice: string): string[][]
  /** 同上,返回每句拼接后的字符串(我们的用法)。 */
  export function phonemizeToString(text: string, voice: string): string[]
  /** 用指定 espeak 数据目录初始化(默认包内 espeak-ng-data,无需调用)。 */
  export function initialize(dataDir?: string): number
  export function version(): string
}
