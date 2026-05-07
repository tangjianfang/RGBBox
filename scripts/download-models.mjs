/**
 * download-models.mjs
 *
 * Downloads 3D model assets listed in scripts/models-manifest.json.
 * Files are saved to the path specified by the manifest's `outputDir`.
 *
 * Usage:
 *   node scripts/download-models.mjs            # download all missing files
 *   node scripts/download-models.mjs --force    # re-download even if file exists
 *
 * Called automatically by the `postinstall` npm hook.
 */

import { createWriteStream, existsSync, mkdirSync, statSync, unlinkSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { get as httpsGet } from 'node:https'
import { get as httpGet } from 'node:http'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const MANIFEST_PATH = join(__dirname, 'models-manifest.json')

const require = createRequire(import.meta.url)
const manifest = require(MANIFEST_PATH)

const force = process.argv.includes('--force')
/** Exit with error code when downloads fail. Pass --strict to enable. */
const strict = process.argv.includes('--strict')

const outputDir = resolve(ROOT, manifest.outputDir)
mkdirSync(outputDir, { recursive: true })

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Follow HTTP/HTTPS redirects and stream the response body to `dest`.
 * Returns the final HTTP status code.
 */
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const getter = url.startsWith('https://') ? httpsGet : httpGet

    const attempt = (currentUrl, redirects = 0) => {
      if (redirects > 10) {
        reject(new Error(`Too many redirects for ${currentUrl}`))
        return
      }

      getter(currentUrl, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // Follow redirect
          res.resume()
          attempt(res.headers.location, redirects + 1)
          return
        }

        if (res.statusCode !== 200) {
          res.resume()
          reject(new Error(`HTTP ${res.statusCode} for ${currentUrl}`))
          return
        }

        const totalBytes = parseInt(res.headers['content-length'] ?? '0', 10)
        let downloaded = 0
        let lastPct = -1

        res.on('data', (chunk) => {
          downloaded += chunk.length
          if (totalBytes > 0) {
            const pct = Math.floor((downloaded / totalBytes) * 100)
            if (pct !== lastPct && pct % 10 === 0) {
              process.stdout.write(`\r  ${pct}%  (${(downloaded / 1_048_576).toFixed(1)} MB)   `)
              lastPct = pct
            }
          }
        })

        const out = createWriteStream(dest)
        pipeline(res, out)
          .then(() => {
            process.stdout.write('\r  100% done                            \n')
            resolve()
          })
          .catch(reject)
      }).on('error', reject)
    }

    attempt(url)
  })
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

let skipped = 0
let downloaded = 0
let failed = 0

for (const model of manifest.models) {
  const destPath = join(outputDir, model.file)

  if (!force && existsSync(destPath)) {
    const size = statSync(destPath).size
    if (size > 0) {
      console.log(`  [skip]  ${model.file}  (${(size / 1_048_576).toFixed(1)} MB already present)`)
      skipped++
      continue
    }
  }

  console.log(`  [fetch] ${model.name}`)
  console.log(`          ${model.url}`)

  try {
    // Remove a partially written file if it exists
    if (existsSync(destPath)) unlinkSync(destPath)

    await downloadFile(model.url, destPath)
    downloaded++
  } catch (err) {
    console.error(`  [fail]  ${model.file}: ${err.message}`)
    // Remove empty / partial file so the next run retries
    if (existsSync(destPath)) {
      try { unlinkSync(destPath) } catch { /* ignore */ }
    }
    failed++
  }
}

console.log(`\nModels: ${downloaded} downloaded, ${skipped} skipped, ${failed} failed.`)

if (failed > 0) {
  const msg =
    '\nSome models failed to download. ' +
    'Update the URLs in scripts/models-manifest.json and re-run:\n' +
    '  node scripts/download-models.mjs\n'
  if (strict) {
    console.error(msg)
    process.exit(1)
  } else {
    console.warn('[warn]' + msg)
  }
}
