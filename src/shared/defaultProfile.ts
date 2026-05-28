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
    defaults: { color: '#ff4f87', speed: 0.35, baseBrightness: 0.16, pulseAmplitude: 0.72, phaseOffset: 0, shimmerIntensity: 0.18 }
  },
  {
    kind: 'rainbow',
    label: 'Rainbow',
    description: 'Full-spectrum gradient sweeps across the canvas.',
    defaults: { speed: 0.42, spread: 1.6, hueShift: 0, angle: 18 }
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
    description: 'Organic flame simulation with discrete gust events, per-column height envelopes, and a 4-stop colour ramp.',
    defaults: { speed: 0.72, intensity: 0.88, spread: 1.28, color: '#ff3d00', heat: 1.08, sparks: 0.22, wind: 0.12, baseHeight: 1.08 }
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
    description: 'Smooth diagonal colour-wash cycling the full hue wheel. Spread controls the spatial gradient range.',
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
    defaults: { speed: 0.14, intensity: 0.92, hueShift: 0, curtainHeight: 1.08, ribbonFrequency: 1.18, shimmerIntensity: 0.52, baseHue: 132, colorSpread: 112, softEdge: 0.68 }
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
    description: 'Radial pulse locked to the bass beat with smooth attack-decay envelope.',
    defaults: { color: '#ff2266', sensitivity: 1.2 }
  },
  {
    kind: 'audio-equalizer',
    label: 'Equalizer',
    description: 'Anti-aliased bar graph across 32 log-spaced FFT bands with smooth peak-hold falloff.',
    defaults: { sensitivity: 1.0, colorLow: '#00ff44', colorHigh: '#ff2200' }
  },
  {
    kind: 'random-color',
    label: 'Random Color',
    description: 'Each block cycles through a unique random hue, smoothly drifting in sync.',
    defaults: { speed: 0.30 }
  },
  // ── Custom & Image ─────────────────────────────────────────────────────────
  {
    kind: 'custom-paint',
    label: 'Custom Paint',
    description: 'Paint each LED pixel individually. Drag to select regions and fill with solid, gradient, or rainbow colors.',
    defaults: { pixelData: '', animateSpeed: 0 }
  },
  {
    kind: 'image-paint',
    label: 'Image Effect',
    description: 'Convert images into LED pixel art. Supports multiple images with slideshow transitions.',
    defaults: { imageDataList: '', activeImageIndex: 0, transitionSpeed: 3, animateTransition: true }
  },
  // ── 3D Visual ──────────────────────────────────────────────────────────────
  {
    kind: 'plasma',
    label: 'Plasma',
    description: 'Classic demoscene multi-wave interference — four sine waves combine into a fluid, endlessly morphing colour field.',
    defaults: { speed: 0.40, frequency: 3.0, saturation: 1.0 }
  },
  {
    kind: 'vortex',
    label: 'Vortex',
    description: 'Counter-rotating spiral arms with depth-fade create a hypnotic 3D spinning portal illusion.',
    defaults: { speed: 0.50, density: 5.0, hueShift: 0 }
  },
  {
    kind: 'tunnel',
    label: 'Tunnel',
    description: '3D zoom tunnel: depth-mapped stripes and radial rings rush toward the viewer in a continuous flythrough.',
    defaults: { speed: 0.60, frequency: 6, hueShift: 0 }
  },
  {
    kind: 'crystal',
    label: 'Crystal',
    description: 'Voronoi crystal facets with specular edge highlights — slowly shifting gemstone planes catch light at every boundary.',
    defaults: { speed: 0.18, density: 0.5, saturation: 0.95 }
  },
  // ── 2D GLSL-style shader effects ──────────────────────────────────────────
  {
    kind: 'glitch',
    label: 'Glitch',
    description: 'Digital monitor glitch — horizontal band corruption, RGB channel splits, and animated scan-line interference.',
    defaults: { speed: 0.50, intensity: 0.70, hueShift: 0 }
  },
  {
    kind: 'matrix-rain',
    label: 'Matrix Rain',
    description: 'Columns of falling streaks (Matrix-style) with per-column speed variation and density control.',
    defaults: { speed: 0.50, density: 0.55, color: '#00ff41' }
  },
  {
    kind: 'neon-pulse',
    label: 'Neon Pulse',
    description: 'Concentric neon rings radiating from centre with colour-shifted interference shimmer.',
    defaults: { speed: 0.50, frequency: 3.0, hueShift: 0 }
  },
  {
    kind: 'nebula',
    label: 'Nebula',
    description: 'Layered cosmic gas clouds with drifting colour veils, star glints, and soft depth falloff.',
    defaults: { speed: 0.28, intensity: 0.86, density: 0.62, hueShift: 250, colorSpread: 135 }
  },
  {
    kind: 'fluid-flow',
    label: 'Fluid Flow',
    description: 'Perlin flow-field ribbons that drift like liquid light, with foam-like high-frequency highlights.',
    defaults: { speed: 0.38, intensity: 0.82, frequency: 4.2, hueShift: 185, spread: 1.35 }
  },
  {
    kind: 'mirror-symmetry',
    label: 'Mirror Symmetry',
    description: 'Kaleidoscopic mirrored ribbons with petal-like symmetry and luminous radial falloff.',
    defaults: { speed: 0.34, intensity: 0.86, frequency: 5.0, hueShift: 310, angle: 45 }
  },
  // ── Scientific visualization effects ─────────────────────────────────────
  {
    kind: 'dna-helix',
    label: 'DNA Double Helix',
    description: 'Scientific double-helix projection with paired strands, glowing base-pair rungs, and thermal molecular breathing.',
    defaults: { speed: 0.36, intensity: 0.88, density: 0.58, hueShift: 0 }
  },
  {
    kind: 'black-hole',
    label: 'Black Hole Accretion',
    description: 'Event horizon silhouette surrounded by a tilted Keplerian accretion disk, thermal color gradient, lens ring, and polar jets.',
    defaults: { speed: 0.34, intensity: 0.92, density: 0.62, hueShift: 0 }
  },
  {
    kind: 'solar-system',
    label: 'Solar System Orbits',
    description: 'Eight planets orbit a central sun on elliptical paths with period ratios inspired by Keplerian motion.',
    defaults: { speed: 0.26, intensity: 0.86, density: 0.55 }
  },
  {
    kind: 'spiral-galaxy',
    label: 'Spiral Galaxy',
    description: 'Milky Way style logarithmic spiral arms with a luminous stellar bulge, dark dust lanes, and clustered star fields.',
    defaults: { speed: 0.20, intensity: 0.90, density: 0.64, hueShift: 0 }
  },
  {
    kind: 'orion-nebula',
    label: 'Orion Nebula',
    description: 'Star-forming molecular cloud using layered dust density, emission gas, young stars, and reflective blue-magenta glow.',
    defaults: { speed: 0.16, intensity: 0.82, density: 0.58, hueShift: 285 }
  },
  {
    kind: 'pulsar-beacon',
    label: 'Pulsar Beacon',
    description: 'Rotating neutron-star lighthouse with opposed radiation beams, bright core pulses, and exponential halo decay.',
    defaults: { speed: 0.82, intensity: 0.90, density: 0.55, hueShift: 0 }
  },
  {
    kind: 'hurricane-eye',
    label: 'Hurricane Eye',
    description: 'Satellite-like cyclone projection with a calm eye, bright eyewall, and rotating spiral rain bands shaped by vorticity.',
    defaults: { speed: 0.32, intensity: 0.84, density: 0.58, hueShift: 0 }
  },
  {
    kind: 'lightning-leader',
    label: 'Lightning Leader',
    description: 'Branching stepped-leader discharge from storm cloud to ground, followed by a bright return-stroke flash.',
    defaults: { speed: 0.38, intensity: 0.94, density: 0.52, hueShift: 0 }
  },
  {
    kind: 'icosahedral-virus',
    label: 'Icosahedral Virus',
    description: 'Rotating viral capsid projection with icosahedral edges, spike proteins, and depth-shaded shell geometry.',
    defaults: { speed: 0.28, intensity: 0.88, density: 0.62, hueShift: 135 }
  },
  {
    kind: 'protein-folding',
    label: 'Protein Folding',
    description: 'Animated protein backbone with alpha-helix bands, glowing residues, and folding depth cues.',
    defaults: { speed: 0.24, intensity: 0.86, density: 0.56, hueShift: 42 }
  },
  {
    kind: 'mitosis-spindle',
    label: 'Mitosis Spindle',
    description: 'Cell division spindle with paired centrosomes, microtubule fibers, chromosomes, and membrane outline.',
    defaults: { speed: 0.30, intensity: 0.84, density: 0.56, hueShift: 0 }
  },
  {
    kind: 'synapse-pulse',
    label: 'Synapse Pulse',
    description: 'Neural action potential crossing a synaptic cleft with vesicle release and neurotransmitter particles.',
    defaults: { speed: 0.44, intensity: 0.88, density: 0.58, hueShift: 0 }
  },
  {
    kind: 'quantum-collapse',
    label: 'Quantum Collapse',
    description: 'Double-source interference probability field collapsing into a bright measurement focus.',
    defaults: { speed: 0.34, intensity: 0.88, density: 0.60, hueShift: 260 }
  },
  {
    kind: 'microvilli-field',
    label: 'Microvilli Field',
    description: 'Brush-border microvilli forest with swaying epithelial projections, tip highlights, and fluid flow.',
    defaults: { speed: 0.18, intensity: 0.82, density: 0.64, hueShift: 0 }
  },
  {
    kind: 'eclipse-alignment',
    label: 'Eclipse Alignment',
    description: 'Solar eclipse alignment with lunar occlusion, white corona, and diamond-ring flare.',
    defaults: { speed: 0.20, intensity: 0.88, density: 0.56, hueShift: 0 }
  },
  {
    kind: 'comet-tail',
    label: 'Comet Tail Physics',
    description: 'Comet nucleus orbiting the sun with dust and ion tails streaming away from solar radiation.',
    defaults: { speed: 0.30, intensity: 0.88, density: 0.58, hueShift: 0 }
  },
  {
    kind: 'magnetosphere-aurora',
    label: 'Magnetosphere Aurora',
    description: 'Earth dipole field lines, solar-wind bow shock, and auroral ovals glowing near magnetic poles.',
    defaults: { speed: 0.24, intensity: 0.86, density: 0.58, hueShift: 0 }
  },
  {
    kind: 'wave-diffraction',
    label: 'Wave Diffraction',
    description: 'Double-slit wave diffraction with incident waves, slit glow, and downstream interference fringes.',
    defaults: { speed: 0.36, intensity: 0.84, density: 0.62, hueShift: 0 }
  },
  {
    kind: 'vortex-flame',
    label: 'Vortex Flame',
    description: 'Fire whirl projection with tapered rotating plume, helical flame bands, and hot ember particles.',
    defaults: { speed: 0.46, intensity: 0.90, density: 0.60, hueShift: 0 }
  },
  {
    kind: 'tokamak-plasma',
    label: 'Tokamak Plasma',
    description: 'Fusion torus with magnetic field striations, hot plasma core, limiter ring, and turbulent color drift.',
    defaults: { speed: 0.34, intensity: 0.90, density: 0.62, hueShift: 280 }
  },
  // ── GPU 3D (WebGL raymarching) ─────────────────────────────────────────────
  {
    kind: 'sphere-pulse',
    label: 'Sphere Pulse',
    description: 'Raymarched sphere with FBM surface displacement. Orbiting camera reveals depth, rim lighting, specular highlight, and volumetric glow halo.',
    defaults: { speed: 0.50, hueShift: 0 }
  },
  {
    kind: 'warp-portal',
    label: 'Warp Portal',
    description: 'Volumetric energy portal — 5 domain-warped concentric rings with spiral tendrils streaming outward along the Z-axis.',
    defaults: { speed: 0.60, hueShift: 0 }
  },
  {
    kind: 'neon-galaxy',
    label: 'Neon Galaxy',
    description: '3D galaxy disc with perspective. Orbiting camera, volumetric spiral arms, galactic core bulge, and rotating point stars.',
    defaults: { speed: 0.40, hueShift: 0 }
  },
  {
    kind: 'lava-sphere',
    label: 'Lava Sphere',
    description: 'Raymarched molten lava globe. Triple-axis domain-warped FBM creates flowing crust patterns with subsurface glow leaking through thin areas.',
    defaults: { speed: 0.30, hueShift: 0 }
  },
  {
    kind: 'laser-show',
    label: 'Laser Show',
    description: 'Concert stage laser beams sweeping from the floor in five independent arcs. Volumetric haze and a floor glow complete the show atmosphere.',
    defaults: { speed: 0.50, hueShift: 0 }
  },
  {
    kind: 'hologram',
    label: 'Hologram',
    description: 'Data-stream holographic sphere with adaptive wire density, scan packets, signal flicker, edge telemetry particles, and controllable projection depth.',
    defaults: {
      speed: 0.42,
      hueShift: 0,
      intensity: 0.95,
      density: 0.68,
      gridDensity: 0.62,
      scanSpeed: 1.25,
      particleIntensity: 1.15,
      glitchAmount: 0.18,
      flickerAmount: 0.42,
      hologramDepth: 0.72,
      saturation: 1.0,
      scanWidth: 0.58
    }
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
          id: 'layer-aurora-veil',
          name: 'Emerald Veil',
          kind: 'aurora',
          enabled: true,
          opacity: 0.9,
          blendMode: 'screen',
          parameters: { ...effectPresets.find((p) => p.kind === 'aurora')!.defaults, _maskZone: 'top' }
        },
        {
          id: 'layer-ember-bed',
          name: 'Ember Bed',
          kind: 'fire',
          enabled: true,
          opacity: 0.56,
          blendMode: 'add',
          parameters: { ...effectPresets.find((p) => p.kind === 'fire')!.defaults, speed: 0.58, heat: 0.92, sparks: 0.34, wind: -0.08, baseHeight: 0.86, _maskZone: 'bottom' }
        },
        {
          id: 'layer-neon-core',
          name: 'Neon Core',
          kind: 'neon-pulse',
          enabled: true,
          opacity: 0.34,
          blendMode: 'screen',
          parameters: { ...effectPresets.find((p) => p.kind === 'neon-pulse')!.defaults, speed: 0.32, frequency: 3.8, hueShift: 265, _maskZone: 'center' }
        },
        {
          id: 'layer-starlight-glint',
          name: 'Starlight Glint',
          kind: 'starlight',
          enabled: true,
          opacity: 0.42,
          blendMode: 'add',
          parameters: { ...effectPresets.find((p) => p.kind === 'starlight')!.defaults, density: 0.18, speed: 0.36, color: '#dbeafe', _maskZone: 'full' }
        },
        {
          id: 'layer-nebula-depth',
          name: 'Nebula Depth',
          kind: 'nebula',
          enabled: true,
          opacity: 0.26,
          blendMode: 'screen',
          parameters: { ...effectPresets.find((p) => p.kind === 'nebula')!.defaults, speed: 0.18, hueShift: 225, density: 0.48, _maskZone: 'full' }
        }
      ]
    }
  ]
}
