// R226.3: electron entry for the vision-dataset extraction tool.
// Usage: electron tools/vision-dataset/main.cjs -- --src <video> [--out dir]
//        [--gestures pinch,dir-up,...] [--auto]
// CJS on purpose: this repo's package.json "main" points at the real app, and
// passing an ESM entry on the CLI proved unreliable here — CJS runs clean.
//
// R226.9: the page + vendored mediapipe are served over a custom `vd://`
// protocol (mirroring the product's media:// approach) — Chromium blocks
// fetch()/module-import on file:// URLs, which silently killed wasm loading.
const { app, BrowserWindow, ipcMain, protocol, net } = require('electron')
const { appendFileSync, mkdirSync, writeFileSync } = require('node:fs')
const { dirname, relative, resolve } = require('node:path')
const { pathToFileURL } = require('node:url')

// Windows GUI subsystem: stdout is detached — logs go to a file so wrapper
// scripts (vision:extract / vision:smoke) can observe progress.
const LOG = resolve(process.env.TEMP || '.', 'vision-dataset.log')
const log = (s) => { try { appendFileSync(LOG, `${new Date().toISOString()} ${s}\n`) } catch { /* best effort */ } }
log('main module evaluating')
process.on('uncaughtException', (e) => { log(`UNCAUGHT ${e && e.stack}`); app.exit(3) })

const ROOT = resolve(__dirname, '..', '..') // repo root
protocol.registerSchemesAsPrivileged([
  { scheme: 'vd', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
])

const argv = process.argv.slice(2).filter((a) => a !== '--')
const arg = (name) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : undefined
}

const src = arg('src')
const outDir = resolve(arg('out') || 'testdata/vision/fixtures')
const gestures = arg('gestures') || ''
const auto = argv.includes('--auto') || arg('auto') === '1'
if (!src) { log('usage: --src <video> missing'); app.exit(1) }

ipcMain.handle('vision-dataset:save', async (_e, files) => {
  const saved = []
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content)
    saved.push(path)
    log(`wrote ${path} (${content.length} bytes)`)
  }
  return saved
})
ipcMain.on('vision-dataset:log', (_e, msg) => log(`[page] ${msg}`))

app.whenReady().then(() => {
  // vd://app/<repo-relative-path> → file under the repo root (no escape)
  protocol.handle('vd', (req) => {
    const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '')
    const filePath = resolve(ROOT, rel)
    if (relative(ROOT, filePath).startsWith('..')) return new Response('forbidden', { status: 403 })
    return net.fetch(pathToFileURL(filePath).toString(), { bypassCustomProtocolHandlers: true })
  })

  const win = new BrowserWindow({
    width: 900, height: 760, show: true,
    webPreferences: {
      preload: resolve(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false,
    },
  })
  win.on('closed', () => app.quit())
  win.webContents.on('did-fail-load', (_e, code, desc, url) => { log(`[page] LOAD FAIL ${code} ${desc} ${url}`); app.exit(2) })

  // Serve the video over vd:// too when it lives inside the repo (testdata) —
  // same-origin media, no file:// quirks. Fall back to file:// for outside paths.
  const srcAbs = resolve(src)
  const relToRoot = relative(ROOT, srcAbs)
  const videoUrl = relToRoot.startsWith('..') ? pathToFileURL(srcAbs).href : `vd://app/${relToRoot.split('\\').join('/')}`

  log(`${auto ? 'auto' : 'interactive'} mode — src=${src} (vd=${videoUrl})`)
  const q = new URLSearchParams({ src: videoUrl, out: outDir, gestures, auto: auto ? '1' : '0' })
  win.loadURL(`vd://app/tools/vision-dataset/index.html?${q.toString()}`)
    .then(() => log('page loaded'))
    .catch((e) => { log(`page load error ${e && e.message}`); app.exit(4) })
})
