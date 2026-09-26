/**
 * afterPack hook:
 *  1. embed icon into the Windows executable using rcedit (signAndEditExecutable
 *     =false skips electron-builder's built-in rcedit step, which needs
 *     winCodeSign — fails on Windows without Developer Mode due to symlink
 *     permissions).
 *  2. R95: prune onnxruntime-node's cross-platform native binaries — the
 *     package ships win/linux/darwin × x64/arm64 (~276MB); only the current
 *     build's platform/arch dir is kept (~64MB for win-x64).
 */
import { existsSync, rmSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
// Arch enum via the SAME app-builder-lib electron-builder uses — reverse
// mapping gives the name regardless of numeric ordering (26.x: ia32=0, x64=1,
// armv7l=2, arm64=3, universal=4 — DIFFERENT from the old 1-based order).
const { Arch } = require('app-builder-lib')

/** @param {import('electron-builder').AfterPackContext} context */
export default async function afterPack(context) {
  const { appOutDir, packager, electronPlatformName } = context
  const archRaw = context.arch
  const arch = typeof archRaw === 'string' ? archRaw : Arch[archRaw] ?? String(archRaw)

  // ── R95: platform pruning (all platforms) ─────────────────────────────
  const ortNapiBin = join(
    appOutDir, 'resources', 'app.asar.unpacked', 'node_modules',
    'onnxruntime-node', 'bin',
  )
  if (existsSync(ortNapiBin)) {
    for (const napiDir of readdirSync(ortNapiBin)) {
      const platformRoot = join(ortNapiBin, napiDir)
      for (const platform of readdirSync(platformRoot)) {
        const keep = platform === electronPlatformName
        if (!keep) {
          rmSync(join(platformRoot, platform), { recursive: true, force: true })
          continue
        }
        // within the current platform, drop other architectures
        for (const archDir of readdirSync(join(platformRoot, platform))) {
          if (archDir !== arch) {
            rmSync(join(platformRoot, platform, archDir), { recursive: true, force: true })
          }
        }
      }
    }
    console.log(`[afterPack] pruned onnxruntime-node to ${electronPlatformName}/${arch}`)
  }

  // ── R176.3: prune the NESTED onnxruntime-node that ships inside
  // @huggingface/transformers (kokoro-js → transformers.js) — same all-platform
  // bloat (~208MB), same fix. Also drop the optional image stack (@img/sharp
  // binaries): the TTS pipeline never processes images.
  const hfOrtBin = join(
    appOutDir, 'resources', 'app.asar.unpacked', 'node_modules',
    '@huggingface', 'transformers', 'node_modules', 'onnxruntime-node', 'bin',
  )
  if (existsSync(hfOrtBin)) {
    for (const napiDir of readdirSync(hfOrtBin)) {
      const platformRoot = join(hfOrtBin, napiDir)
      for (const platform of readdirSync(platformRoot)) {
        if (platform !== electronPlatformName) {
          rmSync(join(platformRoot, platform), { recursive: true, force: true })
          continue
        }
        for (const archDir of readdirSync(join(platformRoot, platform))) {
          if (archDir !== arch) {
            rmSync(join(platformRoot, platform, archDir), { recursive: true, force: true })
          }
        }
      }
    }
    console.log(`[afterPack] pruned @huggingface/transformers onnxruntime-node to ${electronPlatformName}/${arch}`)
  }
  for (const imgDir of ['node_modules/@img', 'node_modules/sharp']) {
    const p = join(appOutDir, 'resources', 'app.asar.unpacked', 'node_modules', imgDir)
    if (existsSync(p)) {
      rmSync(p, { recursive: true, force: true })
      console.log(`[afterPack] removed unused image stack: ${imgDir}`)
    }
  }

  // ── icon embedding (Windows only) ─────────────────────────────────────
  if (electronPlatformName !== 'win32') return

  const productName = packager.appInfo.productFilename
  const exePath = join(appOutDir, `${productName}.exe`)

  if (!existsSync(exePath)) {
    console.warn(`[afterPack] exe not found: ${exePath}`)
    return
  }

  // Resolve icon relative to project root
  const iconPath = resolve(packager.projectDir, 'build', 'icon.ico')
  if (!existsSync(iconPath)) {
    console.warn(`[afterPack] icon not found: ${iconPath}`)
    return
  }

  // rcedit v2 is CJS: require() returns the function directly
  const rcedit = require('rcedit')
  console.log(`[afterPack] embedding icon into ${exePath}`)
  await rcedit(exePath, { icon: iconPath })
  console.log('[afterPack] icon embedded successfully')
}
