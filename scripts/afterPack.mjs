/**
 * afterPack hook: embed icon into the Windows executable using rcedit.
 * Runs after electron-builder packs the app but before archiving.
 * Required because signAndEditExecutable=false skips electron-builder's
 * built-in rcedit step (which needs winCodeSign, failing on Windows
 * without Developer Mode due to symlink permissions).
 */
import { existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/** @param {import('electron-builder').AfterPackContext} context */
export default async function afterPack(context) {
  // Only run for Windows targets
  if (context.electronPlatformName !== 'win32') return

  const { appOutDir, packager } = context
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
