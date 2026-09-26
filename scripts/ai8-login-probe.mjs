// R129b probe: observe ai8.rcouyi.com inside an embedded BrowserWindow that
// reuses the app's REAL persist:ai8 partition — diagnose the "login window
// closes instantly / credentials rejected" report from 2026-09-26.
import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'

const APP_USER_DATA = join(process.env.APPDATA, 'rgbbox')
app.setPath('userData', APP_USER_DATA)

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1180, height: 800, show: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, partition: 'persist:ai8' },
  })
  const events = []
  const log = (kind, detail = '') => { events.push(`${new Date().toISOString().slice(11, 23)} ${kind} ${detail}`) }
  win.on('closed', () => log('WINDOW-CLOSED'))
  win.webContents.on('did-navigate', (_e, url) => log('did-navigate', url))
  win.webContents.on('did-navigate-in-page', (_e, url) => log('in-page', url))
  win.webContents.on('render-process-gone', (_e, d) => log('RENDER-GONE', `${d.reason} ${d.exitCode}`))
  win.webContents.on('crashed', () => log('CRASHED'))
  win.webContents.on('did-fail-load', (_e, code, desc, url) => log('did-fail-load', `${code} ${desc} ${url}`))
  win.webContents.on('console-message', (_e, _l, msg) => { if (/error|fail|denied|block/i.test(msg)) log('console', msg.slice(0, 160)) })

  const readState = () => win.webContents.executeJavaScript(
    `(() => { try { const raw = localStorage.getItem('userStore'); if (!raw) return { token: '', signedIn: false, keys: Object.keys(localStorage).join(',') }; const u = JSON.parse(raw); const t = u?.auth?.token ?? ''; return { token: t ? t.slice(0, 18) + '…' : '', signedIn: !!(u?.user?.isLogin === true || u?.user?.uid), keys: 'userStore' }; } catch (e) { return { token: '', signedIn: false, keys: 'ERR ' + e.message } } })()`,
  ).catch((e) => ({ token: '', signedIn: false, keys: 'EXEC-ERR ' + e.message }))

  log('loading', 'https://ai8.rcouyi.com/')
  await win.loadURL('https://ai8.rcouyi.com/').catch((e) => log('loadURL-fail', String(e)))

  for (let i = 0; i < 8; i += 1) {
    await new Promise((r) => setTimeout(r, 1500))
    const st = await readState()
    log('poll', JSON.stringify(st))
    if (i === 2) await win.webContents.capturePage().then((img) => {
      const fs = require('node:fs')
      fs.writeFileSync(join(process.cwd(), 'docs', 'screenshots', 'ai8-probe.png'), img.toPNG())
      log('screenshot', 'saved docs/screenshots/ai8-probe.png')
    }).catch(() => log('screenshot', 'failed'))
    if (win.isDestroyed()) break
  }
  if (!win.isDestroyed()) win.close()
  console.log('=== AI8 LOGIN PROBE ===')
  console.log(events.join('\n'))
  console.log('userAgent:', win.webContents.userAgent)
  app.quit()
})
