/**
 * ocrService — Windows 原生 OCR（PRD R78.3）。
 *
 * 经 PowerShell 子进程调用 WinRT `Windows.Media.Ocr`（微软引擎，离线、
 * 零 npm 依赖）。引擎选择：TryCreateFromUserProfileLanguages()（中文系统
 * 即 zh+en 混识别）；为空时按 AvailableLanguages 依次尝试 zh-Hans / zh-Hant / en。
 * 协议：成功输出 RGBBOX_OCR_BEGIN … RGBBOX_OCR_END 标记行，失败输出
 * RGBBOX_OCR_ERR:<code>（nolangpack / decode / engine / unsupported）。
 * buildOcrScript / parseOcrOutput 为纯函数供单测；真实识别率以实机验收为准。
 */
import { execFile } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Buffer } from 'node:buffer'

type RunFn = (cmd: string, args: string[], opts: Record<string, unknown>) => Promise<{ stdout: string; stderr: string }>

const defaultRun: RunFn = (cmd, args, opts) =>
  new Promise((resolve, reject) => {
    execFile(cmd, args, opts, (err: NodeJS.ErrnoException | null, stdout: string, stderr: string) => {
      if (err) reject(err)
      else resolve({ stdout, stderr })
    })
  })

export function buildOcrScript(imagePath: string): string {
  // PS 里反斜杠转义 + 变量注入
  const psPath = imagePath.replace(/'/g, "''")
  return `
$ErrorActionPreference = 'Stop'
$img = '${psPath}'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Ocr.OcrEngine, Windows.Media.Ocr, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]

function Await ($WinRtTask, $ResultType) {
  $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($WinRtTask))
  $netTask.Wait($null) | Out-Null
  $netTask.Result
}

function AwaitAction ($WinRtAction) {
  $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' })[0]
  $netTask = $asTaskGeneric.Invoke($null, @($WinRtAction))
  $netTask.Wait($null) | Out-Null
}

try {
  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
  if ($null -eq $engine) {
    $langs = [Windows.Media.Ocr.OcrEngine]::AvailableLanguages
    foreach ($tag in @('zh-Hans', 'zh-Hant', 'en')) {
      $hit = $langs | Where-Object { $_.LanguageTag -like ($tag + '*') } | Select-Object -First 1
      if ($null -ne $hit) {
        $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($hit)
        if ($null -ne $engine) { break }
      }
    }
  }
  if ($null -eq $engine) { Write-Output 'RGBBOX_OCR_ERR:nolangpack'; exit 0 }

  $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($img)) ([Windows.Storage.StorageFile])
  $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($file)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $soft = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  if ($null -eq $soft) { Write-Output 'RGBBOX_OCR_ERR:decode'; exit 0 }

  $result = Await ($engine.RecognizeAsync($soft)) ([Windows.Media.Ocr.OcrResult])
  Write-Output 'RGBBOX_OCR_BEGIN'
  foreach ($line in $result.Lines) { Write-Output $line.Text }
  Write-Output 'RGBBOX_OCR_END'
} catch {
  Write-Output ('RGBBOX_OCR_ERR:engine')
}
`
}

export function parseOcrOutput(stdout: string): { ok: boolean; text: string; hint?: string } {
  const lines = stdout.split(/\r?\n/)
  const err = lines.find(l => l.startsWith('RGBBOX_OCR_ERR:'))
  if (err) return { ok: false, text: '', hint: err.slice('RGBBOX_OCR_ERR:'.length).trim() || 'engine' }
  const begin = lines.indexOf('RGBBOX_OCR_BEGIN')
  const end = lines.indexOf('RGBBOX_OCR_END')
  if (begin >= 0 && end > begin) {
    return { ok: true, text: lines.slice(begin + 1, end).join('\n') }
  }
  return { ok: false, text: '', hint: 'engine' }
}

export async function recognizeImage(
  dataUrl: string,
  run: RunFn = defaultRun,
): Promise<{ ok: boolean; text: string; hint?: string }> {
  if (process.platform !== 'win32') return { ok: false, text: '', hint: 'unsupported' }
  const prefix = 'data:image/'
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith(prefix)) return { ok: false, text: '', hint: 'decode' }
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  let buf: Buffer
  try {
    buf = Buffer.from(b64, 'base64')
    if (buf.length === 0) return { ok: false, text: '', hint: 'decode' }
  } catch {
    return { ok: false, text: '', hint: 'decode' }
  }
  let dir: string | null = null
  try {
    dir = mkdtempSync(join(tmpdir(), 'rgbbox-ocr-'))
    const imgPath = join(dir, 'input.png')
    writeFileSync(imgPath, buf)
    const scriptPath = join(dir, 'ocr.ps1')
    writeFileSync(scriptPath, buildOcrScript(imgPath), 'utf-8')
    const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], { timeout: 30_000 })
    return parseOcrOutput(stdout)
  } catch {
    return { ok: false, text: '', hint: 'engine' }
  } finally {
    if (dir) {
      try { rmSync(dir, { recursive: true, force: true }) } catch { /* best-effort */ }
    }
  }
}
