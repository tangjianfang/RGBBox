/**
 * R226.9: fetch real hand-gesture test videos from online sources into
 * testdata/vision/videos/downloaded/ (gitignored — videos never enter git).
 *
 *   yarn vision:fetch [--max 8] [--query "extra query"] [--source wikimedia|curated|pexels|all]
 *
 * Sources (in order, per-source failures degrade gracefully):
 *   1. curated   — testdata/vision/sources.curated.json (user-extensible; ships
 *                  a few verified Wikimedia CC0/CC-BY entries as defaults)
 *   2. wikimedia — Commons API search over several hand/gesture queries
 *                  (video/webm only, size-capped; license+author recorded)
 *   3. pexels    — only when PEXELS_API_KEY is set (free key, stock footage)
 *
 * Every download is recorded in downloaded/manifest.json (url / license /
 * author / sha256 / size) — attribution survives for any later commercial use.
 */
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { basename, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const VIDEOS_DIR = 'testdata/vision/videos/downloaded'
const CURATED = 'scripts/vision-sources.curated.json'          // repo-committed defaults
const CURATED_LOCAL = 'testdata/vision/sources.curated.json'   // optional user extras
const MAX_BYTES = 20 * 1024 * 1024 // per file
const UA = 'RGBBox-testdata/1.0 (dev test-data fetcher; contact: repo maintainer)'

const argv = process.argv.slice(2)
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d }
const max = Number(flag('max', 8))
const onlySource = flag('source', 'all')
const extraQuery = flag('query', '')

mkdirSync(VIDEOS_DIR, { recursive: true })
const manifestPath = resolve(VIDEOS_DIR, 'manifest.json')
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : []
const canonUrl = (u) => u.split('?')[0]
const known = new Set(manifest.map((e) => canonUrl(e.url)))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchJson (url, headers = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers } })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url.slice(0, 90)}`)
  return res.json()
}

function slug (title) {
  return title.replace(/^File:/, '').replace(/\.[^.]+$/, '').replace(/[^\w\-]+/g, '_').slice(0, 60)
}

async function download (entry) {
  if (known.has(canonUrl(entry.url))) { console.log(`skip (have): ${entry.name}`); return false }
  const name = `${entry.name}.${entry.ext}`
  const path = resolve(VIDEOS_DIR, name)
  const res = await fetch(entry.url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`download HTTP ${res.status}`)
  const len = Number(res.headers.get('content-length') || 0)
  if (len > MAX_BYTES) throw new Error(`too large (${(len / 1e6).toFixed(1)}MB > ${(MAX_BYTES / 1e6).toFixed(0)}MB cap)`)
  const hash = createHash('sha256')
  const sink = createWriteStream(path)
  await pipeline(Readable.fromWeb(res.body), async function* (src) {
    let total = 0
    for await (const chunk of src) {
      total += chunk.length
      if (total > MAX_BYTES) { sink.destroy(); throw new Error('stream exceeded size cap') }
      hash.update(chunk)
      yield chunk
    }
  }, sink)
  manifest.push({ ...entry, file: name, size: len, sha256: hash.digest('hex').slice(0, 16), fetchedAt: new Date().toISOString() })
  known.add(canonUrl(entry.url))
  console.log(`saved ${name} (${(len / 1e6).toFixed(1)}MB, ${entry.license})`)
  return true
}

async function sourceCurated () {
  const entries = []
  for (const path of [CURATED, CURATED_LOCAL]) {
    if (!existsSync(path)) continue
    entries.push(...JSON.parse(readFileSync(path, 'utf8')))
  }
  return entries.map((e) => ({ ext: e.url.split('.').pop(), ...e }))
}

async function sourceWikimedia () {
  const queries = ['hand gesture', 'gesture hand', 'fingers video', 'hand palm video', 'waving hand']
  if (extraQuery) queries.unshift(extraQuery)
  const found = []
  for (const q of queries) {
    if (found.length >= max * 2) break
    const u = new URL('https://commons.wikimedia.org/w/api.php')
    u.search = new URLSearchParams({
      action: 'query', generator: 'search', gsrsearch: `${q} filemime:video/webm`,
      gsrnamespace: '6', gsrlimit: '10', prop: 'imageinfo',
      iiprop: 'url|mime|size|extmetadata', format: 'json',
    })
    let data
    try { data = await fetchJson(u) } catch (e) { console.warn(`wikimedia query "${q}" failed: ${e.message}`); continue }
    for (const p of Object.values(data.query?.pages ?? {})) {
      const ii = p.imageinfo?.[0]
      if (!ii || !ii.mime?.startsWith('video/')) continue
      if ((ii.size ?? 0) > MAX_BYTES) continue
      const meta = ii.extmetadata ?? {}
      found.push({
        name: slug(p.title),
        url: ii.url,
        ext: 'webm',
        license: meta.LicenseShortName?.value ?? 'unknown',
        author: (meta.Artist?.value ?? '').replace(/<[^>]+>/g, '').trim().slice(0, 80) || 'unknown',
        origin: `wikimedia:${p.title}`,
      })
    }
    await sleep(400) // be polite to the API
  }
  return found
}

async function sourcePexels () {
  const key = process.env.PEXELS_API_KEY
  if (!key) { console.log('pexels: skipped (set PEXELS_API_KEY to enable stock-footage source)'); return [] }
  const data = await fetchJson(
    `https://api.pexels.com/videos/search?query=${encodeURIComponent('hand gesture')}&per_page=${max}&size=small`,
    { Authorization: key })
  return (data.videos ?? []).flatMap((v) => {
    const f = v.video_files?.filter((x) => x.width <= 1280 && ['mp4', 'webm'].includes(x.file_type.split('/').pop())).sort((a, b) => b.width - a.width)[0]
    return f ? [{
      name: `pexels_${v.id}`, url: f.link, ext: f.file_type.split('/').pop(),
      license: 'Pexels License', author: v.user?.name ?? 'unknown', origin: `pexels:${v.id}`,
    }] : []
  })
}

const sources = { curated: sourceCurated, wikimedia: sourceWikimedia, pexels: sourcePexels }
const order = onlySource === 'all' ? ['curated', 'wikimedia', 'pexels'] : [onlySource]

let saved = 0
outer: for (const name of order) {
  let entries = []
  try { entries = await sources[name]() } catch (e) { console.warn(`${name} source failed: ${e.message}`); continue }
  console.log(`-- ${name}: ${entries.length} candidate(s)`)
  // CC0/CC-BY preferred first, unknown licenses still allowed (local test use)
  entries.sort((a, b) => rank(a.license) - rank(b.license))
  for (const e of entries) {
    if (saved >= max) break outer
    try { if (await download(e)) saved++ } catch (err) { console.warn(`  skip ${e.name}: ${err.message}`) }
  }
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
console.log(`\n${saved} video(s) → ${VIDEOS_DIR}/ (manifest: ${manifest.length} total)`)
if (saved > 0) {
  console.log('next:\n  yarn vision:extract testdata/vision/videos/downloaded/<file> --auto   # 抽 landmark 夹具\n  yarn vision:smoke                                                    # 检测级指标表 + 门禁')
}
function rank (lic) { return /cc0|public domain/i.test(lic) ? 0 : /cc by/i.test(lic) ? 1 : 2 }
