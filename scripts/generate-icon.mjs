/**
 * Generates build/icon.png (512×512 RGBA) and build/icon.ico (multi-size)
 *
 * Design: A rounded square filled with three organic, irregular RGB regions.
 * Algorithm: Voronoi decomposition with multi-octave sine turbulence applied to
 * the distance metric, giving each boundary a fluid, paint-pour character.
 * A thin dark seam separates the regions for visual clarity.
 *
 * ICO contains: 16×16, 32×32, 48×48 (32-bit BMP) + 256×256 (PNG).
 * This satisfies Windows Explorer, taskbar, title bar, and Alt+Tab.
 *
 * No external dependencies — pure Node.js (zlib + fs).
 */
import zlib from 'zlib'
import fs from 'fs'

// ── CRC32 ─────────────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    t[i] = c
  }
  return t
})()

function crc32(buf) {
  let crc = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function pngChunk(type, data) {
  const t = Buffer.from(type, 'ascii')
  const lenBuf = Buffer.alloc(4); lenBuf.writeUInt32BE(data.length)
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([lenBuf, t, data, crcBuf])
}

// ── Multi-octave sine turbulence ──────────────────────────────────────────────
function noiseOctave(x, y, freq, ox, oy) {
  return Math.sin(x * freq + ox) * Math.cos(y * freq * 1.31 + oy)
}

function turbulence(x, y) {
  return (
    noiseOctave(x, y,  3.7,  0.00,  0.00) * 0.500 +
    noiseOctave(x, y,  7.9,  1.30,  2.10) * 0.250 +
    noiseOctave(x, y, 15.3,  2.70,  4.30) * 0.125 +
    noiseOctave(x, y, 31.1,  5.10,  8.70) * 0.0625
  )
}

// ── Voronoi distance with turbulence warp ─────────────────────────────────────
const WARP = 0.34

function perturbedDist(px, py, sx, sy) {
  const wx = turbulence(px + 0.13, py + 0.71)
  const wy = turbulence(px + 0.89, py + 0.37)
  const dx = (px - sx) + wx * WARP
  const dy = (py - sy) + wy * WARP * 0.85
  return Math.sqrt(dx * dx + dy * dy)
}

// ── Rounded-square mask (iOS-style) ───────────────────────────────────────────
const CORNER_R = 0.22

function inRoundedSquare(px, py, size) {
  const r = CORNER_R
  const nx = px / size, ny = py / size
  if (nx < r && ny < r) return (nx - r) ** 2 + (ny - r) ** 2 <= r * r
  if (nx > 1 - r && ny < r) return (nx - (1 - r)) ** 2 + (ny - r) ** 2 <= r * r
  if (nx < r && ny > 1 - r) return (nx - r) ** 2 + (ny - (1 - r)) ** 2 <= r * r
  if (nx > 1 - r && ny > 1 - r) return (nx - (1 - r)) ** 2 + (ny - (1 - r)) ** 2 <= r * r
  return true
}

// ── Three RGB seeds in a balanced triangle arrangement ────────────────────────
const SEEDS = [
  { nx: 0.27, ny: 0.26, r: 0xff, g: 0x1a, b: 0x3a },  // vivid red   – top-left
  { nx: 0.73, ny: 0.30, r: 0x00, g: 0xff, b: 0x55 },  // vivid green – top-right
  { nx: 0.50, ny: 0.74, r: 0x11, g: 0x77, b: 0xff },  // vivid blue  – bottom
]

const SEAM = 0.022  // seam half-width in normalised units

// ── Raw RGBA pixel buffer (shared by PNG and ICO encoders) ────────────────────
function generatePixels(size) {
  const CH = 4
  const pixels = Buffer.alloc(size * size * CH, 0)
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      if (!inRoundedSquare(px, py, size)) continue
      const nx = px / size
      const ny = py / size
      const dists = SEEDS.map((s) => perturbedDist(nx, ny, s.nx, s.ny))
      const sorted = [...dists].sort((a, b) => a - b)
      const d1 = sorted[0], d2 = sorted[1]
      const idx = dists.indexOf(d1)
      const seed = SEEDS[idx]
      const seam = Math.max(0, 1 - (d2 - d1) / SEAM)
      const seamBlend = Math.pow(seam, 1.4)
      const r = Math.round(seed.r * (1 - seamBlend * 0.90))
      const g = Math.round(seed.g * (1 - seamBlend * 0.90))
      const b = Math.round(seed.b * (1 - seamBlend * 0.90))
      const i = (py * size + px) * CH
      pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b; pixels[i + 3] = 255
    }
  }
  return pixels
}

// ── PNG encoder (RGBA) ────────────────────────────────────────────────────────
function pixelsToPng(pixels, size) {
  const CH = 4
  const rowBytes = size * CH + 1
  const scanlines = Buffer.alloc(size * rowBytes)
  for (let y = 0; y < size; y++) {
    scanlines[y * rowBytes] = 0
    pixels.copy(scanlines, y * rowBytes + 1, y * size * CH, (y + 1) * size * CH)
  }
  const compressed = zlib.deflateSync(scanlines, { level: 9 })
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 6  // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

function generatePng(size) {
  return pixelsToPng(generatePixels(size), size)
}

// ── BMP ICO entry (32-bit BGRA, bottom-up, with AND mask) ────────────────────
// Used for 16×16, 32×32, 48×48 — these must be BMP inside ICO on Windows.
function pixelsToBmpIcoEntry(pixels, size) {
  const xorDataSize = size * size * 4
  const andRowBytes = Math.ceil(size / 8) * 4   // row padded to 4 bytes
  const andDataSize = andRowBytes * size
  const bmp = Buffer.alloc(40 + xorDataSize + andDataSize, 0)

  // BITMAPINFOHEADER
  bmp.writeUInt32LE(40, 0)             // biSize
  bmp.writeInt32LE(size, 4)            // biWidth
  bmp.writeInt32LE(size * 2, 8)        // biHeight (×2: XOR + AND masks)
  bmp.writeUInt16LE(1, 12)             // biPlanes
  bmp.writeUInt16LE(32, 14)            // biBitCount
  bmp.writeUInt32LE(0, 16)             // biCompression (BI_RGB)
  bmp.writeUInt32LE(xorDataSize, 20)   // biSizeImage

  // XOR mask — 32-bit BGRA, stored bottom-up
  let off = 40
  for (let y = size - 1; y >= 0; y--) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      bmp[off++] = pixels[i + 2]  // B
      bmp[off++] = pixels[i + 1]  // G
      bmp[off++] = pixels[i]      // R
      bmp[off++] = pixels[i + 3]  // A
    }
  }
  // AND mask — all zeros (fully opaque), already zero-initialised
  return bmp
}

// ── Multi-size ICO builder ────────────────────────────────────────────────────
// sizes: array of pixel sizes; 256 is stored as PNG, others as 32-bit BMP.
function generateIco(sizes) {
  const images = sizes.map((size) => {
    const px = generatePixels(size)
    const data = size === 256 ? pixelsToPng(px, size) : pixelsToBmpIcoEntry(px, size)
    return { size, data }
  })

  const count = images.length
  let imageOffset = 6 + 16 * count   // ICONDIR header + ICONDIRENTRY[]

  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)      // reserved
  header.writeUInt16LE(1, 2)      // type = ICO
  header.writeUInt16LE(count, 4)  // image count

  const dirs = images.map(({ size, data }) => {
    const dir = Buffer.alloc(16)
    dir[0] = size === 256 ? 0 : size   // 0 encodes 256
    dir[1] = size === 256 ? 0 : size
    dir[2] = 0; dir[3] = 0
    dir.writeUInt16LE(1, 4)            // planes
    dir.writeUInt16LE(32, 6)           // bit depth
    dir.writeUInt32LE(data.length, 8)  // data size
    dir.writeUInt32LE(imageOffset, 12) // data offset
    imageOffset += data.length
    return dir
  })

  return Buffer.concat([header, ...dirs, ...images.map((i) => i.data)])
}

// ── Main ──────────────────────────────────────────────────────────────────────
fs.mkdirSync('build', { recursive: true })

const png512 = generatePng(512)
fs.writeFileSync('build/icon.png', png512)
console.log('✓ build/icon.png  (512×512 RGBA – Voronoi+turbulence)')

const ico = generateIco([16, 32, 48, 256])
fs.writeFileSync('build/icon.ico', ico)
console.log('✓ build/icon.ico  (16×16 + 32×32 + 48×48 BMP + 256×256 PNG)')
