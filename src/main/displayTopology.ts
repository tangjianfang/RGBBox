import { screen } from 'electron'
import type { DisplayInfo, DisplayTopology, PlatformName, Rect } from '../shared/types'

function getPlatformName(): PlatformName {
  switch (process.platform) {
    case 'win32':
      return 'windows'
    case 'darwin':
      return 'macos'
    case 'linux':
      return 'linux'
    default:
      return 'unknown'
  }
}

function toRect(bounds: Electron.Rectangle): Rect {
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height
  }
}

function calculateVirtualBounds(displays: DisplayInfo[]): Rect {
  const minX = Math.min(...displays.map((display) => display.bounds.x), 0)
  const minY = Math.min(...displays.map((display) => display.bounds.y), 0)
  const maxX = Math.max(...displays.map((display) => display.bounds.x + display.bounds.width), 0)
  const maxY = Math.max(...displays.map((display) => display.bounds.y + display.bounds.height), 0)

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  }
}

export function getDisplayTopology(): DisplayTopology {
  const primaryDisplay = screen.getPrimaryDisplay()
  const displays = screen.getAllDisplays().map<DisplayInfo>((display, index) => ({
    id: display.id,
    label: display.label || `Display ${index + 1}`,
    bounds: toRect(display.bounds),
    workArea: toRect(display.workArea),
    scaleFactor: display.scaleFactor,
    rotation: display.rotation,
    primary: display.id === primaryDisplay.id
  }))

  return {
    platform: getPlatformName(),
    displays,
    virtualBounds: calculateVirtualBounds(displays),
    detectedAt: new Date().toISOString()
  }
}
