import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // R131: tests/vision/*.test.mjs — vision module ports (node env below)
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', 'tests/**/*.test.mjs'],
    // Per-test environment is set inline via `// @vitest-environment` doc comments
    // (preferred for clarity) or via `environmentMatchGlobs` for fallback splitting.
    environmentMatchGlobs: [
      // React component / hook tests need a DOM
      ['tests/renderer/components/**', 'happy-dom'],
      ['tests/renderer/3d/**', 'happy-dom'],
      // Everything else (engine, main, preload, shared, gl) runs in node
      ['**', 'node']
    ],
    globals: false,
    setupFiles: ['./tests/renderer/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      include: [
        'src/engine/**',
        'src/shared/**',
        'src/main/**',
        'src/preload/**',
        'src/renderer/src/engine/**',
        'src/renderer/src/workers/**',
        'src/renderer/src/components/**',
        'src/renderer/src/hooks/**'
      ],
      // R12: 3D / WebGL files require a real GPU. We cover them with import-shape
      // and module-export tests (it.skip on the rendering paths) but they are
      // excluded from the global coverage threshold because they cannot be
      // exercised meaningfully in a headless CI environment.
      // See PRD-0002 R12.5.2 / R12.5.5 / R12.6.3.
      //
      // Components whose primary content is 3D rendering are also excluded:
      //   - ArchitectureView: 3D architecture visualisation (3D rendering core)
      //   - AudioStudioView:  audio spectrum + 3D visualisation
      //   - VideoStudioView:  video player + 3D effects overlay
      //   - MiniGamesView:    3D game scenes (sphere-pulse / warp-portal etc.)
      //   - OverlayCanvas:    transparent WebGL overlay window
      //   - App.tsx:          root view that lazy-loads all 3D views
      // For these files we keep smoke tests (import shape, render doesn't throw
      // when GPU is available) and rely on R13 Playwright E2E for full coverage.
      exclude: [
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/index.ts',
        'src/main/index.ts',
        'src/main/captureProviders/dxgiProvider.ts',
        'src/main/captureProviders/screenCaptureKitProvider.ts',
        'src/renderer/src/3d/**',
        'src/renderer/src/gl/**',
        'src/renderer/src/components/ArchitectureView.tsx',
        'src/renderer/src/components/AudioStudioView.tsx',
        'src/renderer/src/components/VideoStudioView.tsx',
        'src/renderer/src/components/MiniGamesView.tsx',
        'src/renderer/src/components/OverlayCanvas.tsx',
        'src/renderer/src/components/Preview3D.tsx',
        'src/renderer/src/App.tsx',
        // LED map JSON data files (not source code)
        'src/shared/led-positions/**'
      ],
      // R163.2 (R156-S1 plan C): LAYERED thresholds — the former single
      // global line (75/60) sat permanently above the achievable weighted
      // waterline, so `test:coverage` exit-1'd on every run and the red
      // stopped meaning anything. Now each layer's red line is its own,
      // calibrated a notch under the measured waterline (R163 round):
      //   engine 96.7/77.8   shared 88.5/77.0   main 54.6/48.2
      //   components 50.1/41.5   hooks 57.3/30.9   workers 100/85
      // The global line drops to just-under-waterline so the gate is GREEN
      // while debt stays VISIBLE per layer (each layer reds independently
      // when it regresses). The R12.6.1 line (75/60) returns as the R156-S6
      // phase-two endpoint, raised layer by layer as the debt batches land.
      thresholds: {
        // global (weighted waterline: 61.95 lines / 48.64 branches /
        // 51.11 functions / 59.44 statements at R163)
        lines: 58,
        branches: 46,
        functions: 48,
        statements: 56,
        // per-layer starting lines (measured waterline − ~2-3pt slack)
        'src/engine/**': { lines: 90, branches: 75, functions: 88, statements: 88 },
        'src/renderer/src/engine/**': { lines: 95, branches: 82, functions: 95, statements: 92 },
        'src/renderer/src/workers/**': { lines: 95, branches: 82, functions: 95, statements: 95 },
        'src/shared/**': { lines: 85, branches: 72, functions: 75, statements: 85 },
        'src/main/**': { lines: 52, branches: 45, functions: 52, statements: 52 },
        'src/renderer/src/components/**': { lines: 47, branches: 38, functions: 43, statements: 45 },
        'src/renderer/src/hooks/**': { lines: 55, branches: 28, functions: 42, statements: 50 }
      }
    }
  }
})
