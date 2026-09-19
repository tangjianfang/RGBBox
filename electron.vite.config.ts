import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

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
    plugins: [react()],
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
