/**
 * Pure-TypeScript 5×7 bitmap font renderer.
 * Works in both Node.js (main process) and browser (renderer / overlay).
 *
 * Font encoding: each character = 7 numbers (rows top→bottom).
 * Each number = 5-bit mask, bit 4 is leftmost column.
 * e.g. 0b10001 = X . . . X
 */

// Character width (pixels) and height (rows)
const CW = 5
const CH = 7

// ── Font data: uppercase A-Z, 0-9, common punctuation ─────────────────────
// Each entry: 7 row-masks (5 bits each, left=MSB)
const FONT_DATA: Partial<Record<string, readonly number[]>> = {
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '!': [0b00100, 0b00100, 0b00100, 0b00100, 0b00000, 0b00100, 0b00000],
  '"': [0b01010, 0b01010, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000],
  '#': [0b01010, 0b01010, 0b11111, 0b01010, 0b11111, 0b01010, 0b01010],
  '$': [0b00100, 0b01111, 0b10100, 0b01110, 0b00101, 0b11110, 0b00100],
  '%': [0b11000, 0b11001, 0b00010, 0b00100, 0b01000, 0b10011, 0b00011],
  '&': [0b01100, 0b10010, 0b10010, 0b01100, 0b10101, 0b10010, 0b01101],
  "'": [0b00100, 0b00100, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000],
  '(': [0b00010, 0b00100, 0b01000, 0b01000, 0b01000, 0b00100, 0b00010],
  ')': [0b01000, 0b00100, 0b00010, 0b00010, 0b00010, 0b00100, 0b01000],
  '*': [0b00000, 0b01010, 0b00100, 0b11111, 0b00100, 0b01010, 0b00000],
  '+': [0b00000, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0b00000],
  ',': [0b00000, 0b00000, 0b00000, 0b00000, 0b01100, 0b00100, 0b01000],
  '-': [0b00000, 0b00000, 0b00000, 0b11111, 0b00000, 0b00000, 0b00000],
  '.': [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b01100, 0b01100],
  '/': [0b00001, 0b00010, 0b00010, 0b00100, 0b01000, 0b01000, 0b10000],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '3': [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b10000, 0b11110, 0b00001, 0b00001, 0b11110],
  '6': [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],
  ':': [0b00000, 0b01100, 0b01100, 0b00000, 0b01100, 0b01100, 0b00000],
  ';': [0b00000, 0b01100, 0b01100, 0b00000, 0b01100, 0b00100, 0b01000],
  '<': [0b00010, 0b00100, 0b01000, 0b10000, 0b01000, 0b00100, 0b00010],
  '=': [0b00000, 0b00000, 0b11111, 0b00000, 0b11111, 0b00000, 0b00000],
  '>': [0b01000, 0b00100, 0b00010, 0b00001, 0b00010, 0b00100, 0b01000],
  '?': [0b01110, 0b10001, 0b00001, 0b00110, 0b00100, 0b00000, 0b00100],
  '@': [0b01110, 0b10001, 0b00001, 0b01101, 0b10101, 0b10110, 0b01110],
  'A': [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'B': [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  'C': [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  'D': [0b11100, 0b10010, 0b10001, 0b10001, 0b10001, 0b10010, 0b11100],
  'E': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  'F': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  'G': [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01111],
  'H': [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'I': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  'J': [0b00111, 0b00010, 0b00010, 0b00010, 0b10010, 0b10010, 0b01100],
  'K': [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  'L': [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  'M': [0b10001, 0b11011, 0b10101, 0b10001, 0b10001, 0b10001, 0b10001],
  'N': [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  'O': [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'P': [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  'Q': [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  'R': [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  'S': [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  'T': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  'U': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'V': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  'W': [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  'X': [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  'Z': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  '[': [0b01110, 0b01000, 0b01000, 0b01000, 0b01000, 0b01000, 0b01110],
  '\\': [0b10000, 0b01000, 0b01000, 0b00100, 0b00010, 0b00010, 0b00001],
  ']': [0b01110, 0b00010, 0b00010, 0b00010, 0b00010, 0b00010, 0b01110],
  '^': [0b00100, 0b01010, 0b10001, 0b00000, 0b00000, 0b00000, 0b00000],
  '_': [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b11111],
}

// Lowercase mapped to uppercase
function charData(ch: string): readonly number[] {
  const upper = ch.toUpperCase()
  return FONT_DATA[upper] ?? FONT_DATA[ch] ?? FONT_DATA['?']!
}

// ── Cache ─────────────────────────────────────────────────────────────────
const maskCache = new Map<string, boolean[]>()

/**
 * Returns a flat boolean mask of size cols×rows.
 * mask[y*cols + x] === true when that grid cell should show the text foreground.
 *
 * @param text    - characters to render (case-insensitive)
 * @param cols    - grid width
 * @param rows    - grid height
 * @param xNorm   - horizontal anchor 0=left … 1=right (0.5=centre)
 * @param yNorm   - vertical anchor   0=top  … 1=bottom (0.5=centre)
 * @param scale   - pixel-to-cell scale factor (1=smallest, 2=double, …)
 */
export function getTextMask(
  text: string,
  cols: number,
  rows: number,
  xNorm: number,
  yNorm: number,
  scale: number
): boolean[] {
  const s = Math.max(1, Math.round(scale))
  const key = `${text}|${cols}|${rows}|${xNorm.toFixed(3)}|${yNorm.toFixed(3)}|${s}`
  const cached = maskCache.get(key)
  if (cached) return cached

  const letterSpacing = s          // 1 cell gap between characters when scale=1
  const scaledW = CW * s + letterSpacing
  const scaledH = CH * s
  const totalW = Math.max(0, text.length * scaledW - letterSpacing)

  const startX = Math.round(xNorm * cols - totalW / 2)
  const startY = Math.round(yNorm * rows - scaledH / 2)

  const mask = new Array<boolean>(cols * rows).fill(false)

  for (let ci = 0; ci < text.length; ci++) {
    const rows_data = charData(text[ci])
    const charOriginX = startX + ci * scaledW

    for (let row = 0; row < CH; row++) {
      const rowMask = rows_data[row] ?? 0
      for (let col = 0; col < CW; col++) {
        if (!((rowMask >> (CW - 1 - col)) & 1)) continue
        // Fill s×s block for this font pixel
        for (let sy = 0; sy < s; sy++) {
          for (let sx = 0; sx < s; sx++) {
            const px = charOriginX + col * s + sx
            const py = startY + row * s + sy
            if (px >= 0 && px < cols && py >= 0 && py < rows) {
              mask[py * cols + px] = true
            }
          }
        }
      }
    }
  }

  maskCache.set(key, mask)
  return mask
}
