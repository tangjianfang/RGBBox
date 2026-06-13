import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
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
      // R12.6: global thresholds set to the R12.6.1 "first-run target" of
      // 60% lines + 50% branches. Well-tested modules (engine 95/76,
      // main 89/74, shared 95/80, workers 100/85, hooks 80/55) all
      // exceed 80% individually. Components that depend on 3D rendering
      // branches (which require a real GPU and are excluded above)
      // cannot reach higher in a headless environment.
      //
      // R13 (Playwright E2E) is the planned next step to push component
      // coverage above 60% by exercising the full view tree end-to-end
      // with a real GPU on a developer machine or CI runner.
      thresholds: {
        lines: 75,
        branches: 60,
        functions: 60,
        statements: 75
      }
    }
  }
})
