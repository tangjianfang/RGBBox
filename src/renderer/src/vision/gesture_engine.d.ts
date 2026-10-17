// Type bridge for the plain-JS gesture engine (R306/T2). Minimal surface —
// only what TS consumers import; the runtime module is the source of truth.

export interface GeomPoint { x: number; y: number }
export interface HandGeom {
  palm: GeomPoint
  /** thumb-tip↔index-tip distance normalized by hand scale (wrist→middle-MCP) */
  pinch: number
  scale: number
}
export declare function handGeometry(lm: Array<{ x: number; y: number }>): HandGeom
