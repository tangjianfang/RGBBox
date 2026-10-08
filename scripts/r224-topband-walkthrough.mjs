/**
 * R224: topband walkthrough — proves both halves end-to-end on a real window.
 *
 *  1. layout (R224.4): topbar IS the window's first 40px (titlebar-drag gone,
 *     brand-mark snug at top), gear/user menus still open;
 *  2. WCO theming (R224.3): the NATIVE min/max/close strip recolors with the
 *     theme — verified by OS-level screen capture (CDP page shots cannot see
 *     native controls) + dominant-color assertion per theme.
 *
 * Port 9297. Cleans the theme key before kill (late writes are dropped).
 */
import { assertFreshOut, launchElectron, connectRenderer } from './lib/cdp.mjs'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 9297
const OUT = 'docs/ui-review/r224'

assertFreshOut()
mkdirSync(OUT, { recursive: true })
const electron = launchElectron({ port: PORT })
const { page } = await connectRenderer({ port: PORT })

// ── helpers ────────────────────────────────────────────────────────────────
async function setTheme (t) {
  await page.evaluate((theme) => {
    const doomed = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith('rgbbox:')) doomed.push(k)
    }
    for (const k of doomed) localStorage.removeItem(k)
    if (theme) localStorage.setItem('rgbbox:theme', theme)
  }, t)
  await page.reload()
  await page.waitForSelector('.module-rail', { timeout: 15000 })
  await sleep(700)
}

/** OS-level capture of the RGBBox window via Win32 PrintWindow(PW_RENDERFULLCONTENT)
 *  — copies the window's rendered content INCLUDING the native WCO controls,
 *  regardless of z-order/occlusion (CopyFromScreen grabbed whatever sat on top). */
function osShot (pid, path) {
  const ps1 = `${OUT}/_shot.ps1`
  writeFileSync(ps1, `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class W {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr dc, uint flags);
  public struct R { public int L; public int T; public int Rt; public int B; }
}
"@
[W]::SetProcessDPIAware() | Out-Null
$p = Get-Process -Id ${pid} -ErrorAction Stop
$h = [IntPtr]$p.MainWindowHandle
if ($h -eq [IntPtr]::Zero) { Write-Error "no main window handle for pid ${pid}"; exit 1 }
$r = New-Object W+R
[W]::GetWindowRect($h, [ref]$r) | Out-Null
$w = $r.Rt - $r.L; $ht = $r.B - $r.T
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap($w, $ht)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$dc = $g.GetHdc()
# 3 = PW_RENDERFULLCONTENT — required for GPU-rendered (Chromium) windows
[W]::PrintWindow($h, $dc, 3) | Out-Null
$g.ReleaseHdc($dc)
$bmp.Save('${path.replace(/\\/g, '/')}', [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output "printwindow $w x $ht"
`)
  try {
    return execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1], { encoding: 'utf8' }).trim()
  } finally {
    rmSync(ps1, { force: true })
  }
}

/** Dominant color of the top-right WCO strip region (mode over sampled pixels, via PIL). */
function stripDominant (pngPath) {
  const out = execFileSync('python', ['-I', '-c', `
from PIL import Image
from collections import Counter
im = Image.open(r'${pngPath}').convert('RGB')
w, h = im.size
c = Counter(im.getpixel((x, y)) for y in range(8, min(36, h)) for x in range(w - 150, w - 10))
(total, rgb) = c.most_common(1)[0][0], None
(rgb, n) = c.most_common(1)[0]
print(','.join(map(str, rgb)), n / sum(c.values()))
`], { encoding: 'utf8' }).trim().split(/\s+/)
  return { rgb: out[0].split(',').map(Number), share: Number(out[1]) }
}

const near = (rgb, hex) => {
  const t = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
  return rgb.every((v, i) => Math.abs(v - t[i]) <= 4)
}

let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

// ── 1. light theme ─────────────────────────────────────────────────────────
await setTheme('light')
check('light applied on <html>', (await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'light')
check('preload bridge exposes setTitleBarTheme', await page.evaluate(() => typeof window.rgbbox?.setTitleBarTheme === 'function'))

// layout probes (R224.4)
const layout = await page.evaluate(() => {
  const bar = document.querySelector('.topbar')?.getBoundingClientRect()
  const mark = document.querySelector('.brand-mark')?.getBoundingClientRect()
  return {
    dragDivGone: document.querySelector('.titlebar-drag') === null,
    barTop: bar?.top, barH: bar?.height,
    markTop: mark?.top, markH: mark?.height, markW: mark?.width,
  }
})
check('titlebar-drag div removed', layout.dragDivGone)
check('topbar occupies window top (y≈0)', Math.abs(layout.barTop) < 1, `y=${layout.barTop}`)
check('topbar is the 40px WCO band', Math.abs(layout.barH - 40) < 1, `h=${layout.barH}`)
check('brand-mark 24px, snug at top', layout.markH === 24 && layout.markW === 24 && layout.markTop < 10,
  `top=${layout.markTop} ${layout.markW}x${layout.markH}`)

// gear menu still opens inside the (now draggable) topbar
const menuOk = await page.evaluate(() => {
  const d = document.querySelector('.topbar-menu[data-menu="settings"]')
  d?.setAttribute('open', '')
  const opened = d?.hasAttribute('open') && !!d?.querySelector('.topbar-menu-items')
  const style = d?.querySelector('.topbar-menu-items') ? getComputedStyle(d.querySelector('.topbar-menu-items')).backgroundColor : ''
  d?.removeAttribute('open')
  return { opened, style }
})
check('gear menu opens; panel background is the light rail token', menuOk.opened && menuOk.style === 'rgb(221, 229, 233)', menuOk.style)
await page.screenshot({ path: `${OUT}/light-page.png` })

await await osShot(electron.pid, `${OUT}/light-window.png`)
const light = stripDominant(`${OUT}/light-window.png`)
check('WCO strip follows LIGHT theme (OS-level pixels)', near(light.rgb, '#e9eff2'), `dominant rgb(${light.rgb}) share=${(light.share * 100).toFixed(0)}%`)

// ── 2. dark theme (no regression) ──────────────────────────────────────────
await setTheme('dark')
check('dark resolves (data-theme absent)', (await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === null)
await page.screenshot({ path: `${OUT}/dark-page.png` })
await await osShot(electron.pid, `${OUT}/dark-window.png`)
const dark = stripDominant(`${OUT}/dark-window.png`)
check('WCO strip stays DARK (OS-level pixels)', near(dark.rgb, '#11191f'), `dominant rgb(${dark.rgb}) share=${(dark.share * 100).toFixed(0)}%`)

// ── 3. clean state, verdict ────────────────────────────────────────────────
await page.evaluate(() => localStorage.removeItem('rgbbox:theme')).catch(() => {})
console.log(failures === 0 ? '\nR224 walkthrough: ALL PASS' : `\nR224 walkthrough: ${failures} FAIL`)
process.exit(failures === 0 ? 0 : 1)
