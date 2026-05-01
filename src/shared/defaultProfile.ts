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
    description: 'All zones hold a single calibrated color.',
    defaults: { color: '#37d5ff' }
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
    defaults: { speed: 0.35, spread: 1.2, hueShift: 0 }
  },
  {
    kind: 'wave',
    label: 'Wave',
    description: 'Directional color wave with adjustable width.',
    defaults: { speed: 0.5, width: 0.35, color: '#00ccff' }
  },
  {
    kind: 'zone-gradient',
    label: 'Gradient',
    description: 'Blends two anchor colors across the grid.',
    defaults: { from: '#2cff9a', to: '#ffcf40' }
  },
  {
    kind: 'fire',
    label: 'Fire',
    description: 'Organic flame simulation rising from the bottom edge.',
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
    description: 'Uniform hue that cycles through the full color wheel.',
    defaults: { speed: 0.25, saturation: 0.95, hueShift: 0 }
  },
  {
    kind: 'comet',
    label: 'Comet',
    description: 'Bright streak races across the grid with a glowing tail.',
    defaults: { speed: 0.45, tail: 0.35, color: '#ffffff' }
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
    description: 'Pulses outward from center locked to the bass beat.',
    defaults: { color: '#ff2266', sensitivity: 1.2 }
  },
  {
    kind: 'audio-equalizer',
    label: 'Equalizer',
    description: 'Vertical bar graph reactive to bass/mid/high bands.',
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
    usePerformanceGuard: true
  },
  scenes: [
    {
      id: 'scene-desk',
      name: 'Desk Ambience',
      displayIds: [],
      layers: [
        {
          id: 'layer-screen-ambient',
          name: 'Screen Ambient',
          kind: 'screen-ambient',
          enabled: true,
          opacity: 1,
          blendMode: 'normal',
          parameters: effectPresets[0].defaults
        }
      ]
    }
  ]
}
