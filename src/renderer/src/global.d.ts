import type { RgbBoxApi } from '../../preload'

declare global {
  interface Window {
    rgbbox: RgbBoxApi
  }
}

export {}
