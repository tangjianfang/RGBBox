/**
 * Generates build/icon.png (512×512) and build/icon.ico (256×256 PNG-in-ICO)
 * Design: three vivid RGB rounded-rectangle blocks on dark background.
 * No external dependencies — uses only Node.js built-in zlib and fs.
 */
import zlib from 'zlib'
import fs from 'fs'

// ── CRC32 for PNG chunks ──────────────────────────────────────────────────────
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

// ── Rounded rectangle hit-test ────────────────────────────────────────────────
function inRoundedRect(px, py, rx, ry, rw, rh, r) {
  if (px < rx || px >= rx + rw || py < ry || py >= ry + rh) return false
  if (px < rx + r && py < ry + r) return (px - rx - r) ** 2 + (py - ry - r) ** 2 <= r * r
  if (px >= rx + rw - r && py < ry + r) return (px - rx - rw + r) ** 2 + (py - ry - r) ** 2 <= r * r
  if (px < rx + r && py >= ry + rh - r) return (px - rx - r) ** 2 + (py - ry - rh + r) ** 2 <= r * r
  if (px >= rx + rw - r && py >= ry + rh - r) return (px - rx - rw + r) ** 2 + (py - ry - rh + r) ** 2 <= r * r
  return true
}

// ── PNG generator ─────────────────────────────────────────────────────────────
function generatePng(size) {
  // Background: #0f1418
  const pixels = Buffer.alloc(size * size * 3)
  for (let i = 0; i < pixels.length; i += 3) {
    pixels[i] = 0x0f; pixels[i + 1] = 0x14; pixels[i + 2] = 0x18
  }

  // Three equal blocks arranged horizontally, square proportions
  const margin = Math.round(size * 0.1)
  const gap = Math.round(size * 0.05)
  const blockW = Math.round((size - margin * 2 - gap * 2) / 3)
  const blockH = blockW  // square
  const blockY = Math.round((size - blockH) / 2)  // vertically centred
  const radius = Math.round(blockW * 0.18)

  const blocks = [
    { x: margin,                     color: [0xff, 0x22, 0x44] },  // R – vivid red
    { x: margin + blockW + gap,      color: [0x11, 0xff, 0x66] },  // G – vivid green
    { x: margin + (blockW + gap) * 2, color: [0x22, 0x88, 0xff] }  // B – vivid blue
  ]

  for (const block of blocks) {
    for (let y = blockY; y < blockY + blockH; y++) {
      for (let x = block.x; x < block.x + blockW; x++) {
        if (!inRoundedRect(x, y, block.x, blockY, blockW, blockH, radius)) continue
        const i = (y * size + x) * 3
        pixels[i] = block.color[0]; pixels[i + 1] = block.color[1]; pixels[i + 2] = block.color[2]
      }
    }
  }

  // Build scanlines (filter byte 0 per row)
  const scanlines = Buffer.alloc(size * (size * 3 + 1))
  for (let y = 0; y < size; y++) {
    scanlines[y * (size * 3 + 1)] = 0
    pixels.copy(scanlines, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3)
  }
  const compressed = zlib.deflateSync(scanlines, { level: 9 })

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 2  // 8-bit RGB, no alpha

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

// ── ICO wrapper (embeds a PNG directly — supported on Vista+) ─────────────────
function pngToIco(pngBuf) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)  // reserved
  header.writeUInt16LE(1, 2)  // type = ICO
  header.writeUInt16LE(1, 4)  // 1 image

  const entry = Buffer.alloc(16)
  entry[0] = 0; entry[1] = 0          // width/height = 0 → means 256
  entry[2] = 0; entry[3] = 0          // colorCount, reserved
  entry.writeUInt16LE(1, 4)           // planes
  entry.writeUInt16LE(32, 6)          // bit count
  entry.writeUInt32LE(pngBuf.length, 8)
  entry.writeUInt32LE(6 + 16, 12)     // image offset

  return Buffer.concat([header, entry, pngBuf])
}

// ── Main ──────────────────────────────────────────────────────────────────────
fs.mkdirSync('build', { recursive: true })

const png512 = generatePng(512)
fs.writeFileSync('build/icon.png', png512)
console.log('✓ build/icon.png  (512×512)')

const png256 = generatePng(256)
fs.writeFileSync('build/icon.ico', pngToIco(png256))
console.log('✓ build/icon.ico  (256×256 PNG-in-ICO)')
