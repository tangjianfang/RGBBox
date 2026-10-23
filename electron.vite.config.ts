import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import type { Plugin } from 'vite'

/**
 * R306/T16: production-only CSP — injected into every renderer html entry at
 * build time (dev keeps vite HMR unblocked). Locked to self + the app's own
 * media:// protocol (vision bundle + models) + the blob/data URLs the app
 * legitimately produces (workers, canvas exports, recording downloads) +
 * 'wasm-unsafe-eval' for MediaPipe (wasm only — no JS eval is allowed).
 *
 * R307 correction (T16 regression): the AI8 workbench is renderer-direct BY
 * DESIGN ("site CORS is `*`", Ai8Tab header) — the first cut omitted its
 * origin from connect-src and silently killed every AI8 fetch in packaged
 * builds (model lists, chat, draw, login). connect-src now names it
 * explicitly; img-src allows remote https because chat markdown embeds
 * arbitrary user-content images (passive content — script-src stays locked).
 * Everything else stays main-process IPC (generic AI providers, model
 * downloads) and is unaffected by this policy.
 *
 * R316 correction (REVIEW_2026-10-24, T16 线第三次 CSP 回归): media-src /
 * img-src 漏了自有 `media:` scheme——打包版所有 media://local 视频/音频
 * (VideoStudio/AudioStudio playlist)与胶片栏缩略图被 CSP 拒载,R94 自动
 * 恢复使其表现为「打开视频工作站即报错」(dev 不注入 CSP 故不受影响)。
 * R307 教训复用:给一个 scheme 定 CSP 前必须枚举渲染层**全部**消费面——
 * 这次的漏点是 media 元素出口(video/audio/img)。
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' media: 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https: media:",
  "connect-src 'self' media: blob: https://ai8.rcouyi.com",
  "media-src 'self' media: blob:",
  "worker-src 'self' blob:",
  "font-src 'self' data:",
  "object-src 'none'",
].join('; ')
const prodCspPlugin: Plugin = {
  name: 'rgbbox-prod-csp',
  apply: 'build',
  transformIndexHtml(html) {
    return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}">`)
  },
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          // R91.3b: utility-process entry — forked by denoiseService at runtime
          denoiseProcessor: resolve(__dirname, 'src/main/denoiseProcessor.ts'),
        },
        external: ['electron']
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/preload/index.ts'),
        external: ['electron']
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react(), prodCspPlugin],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          // R130.1: 轻量截图入口 —— 只装 SnipView 栈（~250KB vs 主入口 4.6MB），
          // 让热键→冻结画面出现摆脱 God Component 全家桶的解析成本
          snip: resolve(__dirname, 'src/renderer/snip.html'),
          // R136: hidden vision pipeline host — the whole vision stack runs in
          // this window's renderer process (off the game window's main thread)
          visionHost: resolve(__dirname, 'src/renderer/visionHost.html'),
        },
        output: {
          manualChunks(id: string) {
            if (id.includes('@mkkellogg/gaussian-splats-3d')) return 'vendor-splat'
            if (id.includes('node_modules/three/')) return 'vendor-three'
          }
        }
      }
    },
    server: {
      headers: {
        // Required for SharedArrayBuffer (used by gaussian-splats-3d sort worker)
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp'
      }
    }
  }
})
