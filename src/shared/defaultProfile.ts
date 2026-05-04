import type { PresetDefinition, Profile } from './types'

export const effectPresets: PresetDefinition[] = [
  {
    kind: 'screen-ambient',
    label: 'Screen Ambient',
    description: 'Maps the display region into a virtual RGB grid using edge colors.',
    defaults: { saturation: 1.1, contrast: 1.05 }
  },
  {
    kind: 'static',
    label: 'Static',
    description: 'All zones hold a single calibrated color. Optionally render dot-matrix text.',
    defaults: { color: '#37d5ff', text: '', textColor: '#ffffff', textX: 0.5, textY: 0.5, textScale: 1, textWeight: 400 }
  },
  {
    kind: 'breathing',
    label: 'Breathing',
    description: 'Pulses brightness smoothly on a single hue.',
    defaults: { color: '#ff4f87', speed: 0.45 }
  },
  {
    kind: 'rainbow',
    label: 'Rainbow',
    description: 'Full-spectrum gradient sweeps across the canvas.',
    defaults: { speed: 0.35, spread: 1.2, hueShift: 0, angle: 0 }
  },
  {
    kind: 'wave',
    label: 'Wave',
    description: 'Directional color wave with adjustable width.',
    defaults: { speed: 0.5, width: 0.35, color: '#00ccff', angle: 45 }
  },
  {
    kind: 'zone-gradient',
    label: 'Gradient',
    description: 'Blends two anchor colors across the grid.',
    defaults: { from: '#2cff9a', to: '#ffcf40', angle: 45 }
  },
  {
    kind: 'fire',
    label: 'Fire',
    description: 'Organic flame simulation with discrete gust events, per-column height envelopes, and a 4-stop colour rampper-column height envelopes, and a 4-stop colour ramp.',
    defaults: { speed: 0.7, intensity: 0.85, spread: 1.2, color: '#ff4400' }
  },
  {
    kind: 'starlight',
    label: 'Starlight',
    description: 'Random twinkling stars scattered across the field.',
    defaults: { density: 0.25, speed: 0.5, color: '#ffffff' }
  },
  {
    kind: 'ripple',
    label: 'Ripple',
    description: 'Concentric waves expanding from the center.',
    defaults: { speed: 0.45, frequency: 3.5, color: '#00e5ff' }
  },
  {
    kind: 'spectrum',
    label: 'Spectrum',
    description: 'Smooth diagonal colour-wash cycling the full hue wheel. Spread controls the spatial gradient rangeel. Spread controls the spatial gradient range.',
    defaults: { speed: 0.25, saturation: 0.95, hueShift: 0, spread: 1.0 }
  },
  {
    kind: 'comet',
    label: 'Comet',
    description: 'Bright streak races across the grid with a glowing tail.',
    defaults: { speed: 0.45, tail: 0.35, color: '#ffffff', angle: 0 }
  },
  {
    kind: 'lightning',
    label: 'Lightning',
    description: 'Electrical arc bolt flashes with jagged branching.',
    defaults: { speed: 0.2, intensity: 0.9, color: '#a8c8ff' }
  },
  {
    kind: 'aurora',
    label: 'Aurora',
    description: 'Northern lights curtain sweeping across the top edge.',
    defaults: { speed: 0.12, intensity: 0.88, hueShift: 0 }
  },
  {
    kind: 'explode',
    label: 'Explode',
    description: 'Burst ring expands outward from the center repeatedly.',
    defaults: { speed: 0.4, color: '#ff6020' }
  },
  {
    kind: 'audio-beat',
    label: 'Audio Beat',
    description: 'Radial pulse locked to the bass beat with smooth attack-decay envelopettack-decay envelope.',
    defaults: { color: '#ff2266', sensitivity: 1.2 }
  },
  {
    kind: 'audio-equalizer',
    label: 'Equalizer',
    description: 'Anti-aliased bar graph across 32 log-spaced FFT bands with smooth peak-hold falloffnds with smooth peak-hold falloff.',
    defaults: { sensitivity: 1.0, colorLow: '#00ff44', colorHigh: '#ff2200' }
  },
  {
    kind: 'random-color',
    label: 'Random Color',
    description: 'Each block cycles through a unique random hue, smoothly drifting in sync.',
    defaults: { speed: 0.30 }
  }
]

export const defaultProfile: Profile = {
  id: 'default-profile',
  name: 'RGBBox Default',
  activeSceneId: 'scene-desk',
  performanceMode: 'balanced',
  sampling: {
    columns: 24,
    rows: 14,
    fps: 30,
    smoothing: 0.35,
    brightnessLimit: 1.0,
    saturationBoost: 1.5,
    usePerformanceGuard: true,
    showGap: false
  },
  scenes: [
    {
      id: 'scene-desk',
      name: 'Desk Ambience',
      displayIds: [],
      layers: [
        {
          id: 'layer-rainbow',
          name: 'Rainbow',
          kind: 'rainbow',
          enabled: true,
          opacity: 1,
          blendMode: 'normal',
          parameters: { ...effectPresets.find((p) => p.kind === 'rainbow')!.defaults }
        }
      ]
    }
  ]
}
