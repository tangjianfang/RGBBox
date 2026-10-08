// R226.3: electron entry for the vision-dataset extraction tool.
// Usage: electron tools/vision-dataset/main.mjs -- --src <video> [--out dir]
//        [--gestures pinch,dir-up,...] [--auto]
// Disposable BrowserWindow loading index.html with the args as query params.
import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const argv = process.argv.slice(process.execPath.endsWith('electron') || process.argv[0].endsWith('electron') ? 2 : 1)
const arg = (name) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : undefined
}

const src = arg('src')
const outDir = resolve(arg('out') || 'testdata/vision/fixtures')
const gestures = arg('gestures') || ''
const auto = arg('auto') === '1'
if (!src) { console.error('usage: electron tools/vision-dataset/main.mjs -- --src <video> [--out dir] [--gestures a,b] [--auto]'); app.exit(1) }

ipcMain.handle('vision-dataset:save', async (_e, files) => {
  const saved = []
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content)
    saved.push(path)
    console.log(`[vision-dataset] wrote ${path} (${content.length} bytes)`)
  }
  return saved
})

await app.whenReady()
const win = new BrowserWindow({
  width: 900, height: 760, show: true,
  webPreferences: {
    preload: resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'preload.mjs'),
    contextIsolation: true, nodeIntegration: false,
  },
})
win.on('closed', () => app.quit())
const page = pathToFileURL(resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'index.html'))
const q = new URLSearchParams({ src: pathToFileURL(resolve(src)).href, out: outDir, gestures, auto: auto ? '1' : '0' })
await win.loadURL(`${page}?${q}`)
// never block the machine on this tool
dialog.showMessageBox(win, { message: `抽取窗口已打开：${auto ? '自动模式——点 ▶ 后自动导出' : '点 ▶ 播放，用 1-9 打标注，结束后导出'}。完成后直接关窗。`, buttons: ['OK'] }).catch(() => {})
