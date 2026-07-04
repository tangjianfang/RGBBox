import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { AudioVizProjector } from './components/AudioVizProjector'
import { OverlayCanvas } from './components/OverlayCanvas'
import { I18nProvider } from './i18n'
import './styles.css'

const params = new URLSearchParams(window.location.search)
const isOverlay = params.get('overlay') === 'true'
const isAudioViz = params.get('audioviz') === 'true'
const overlayDisplayId = Number(params.get('displayId') ?? 0)

const root = ReactDOM.createRoot(document.getElementById('root')!)

if (isAudioViz) {
  // R29.3 (revised): full-resolution audio visualizer projector — a plain
  // opaque window, not the transparent LED overlay.
  document.documentElement.style.overflow = 'hidden'
  document.body.classList.add('audioviz-mode')
  root.render(<AudioVizProjector displayId={overlayDisplayId} />)
} else if (isOverlay) {
  // Prevent the OS-theme scrollbars that appear when body min-width/min-height
  // (960px / 640px) exceeds the partial-region overlay window dimensions.
  document.documentElement.style.overflow = 'hidden'
  document.body.classList.add('overlay-mode')
  root.render(<OverlayCanvas displayId={overlayDisplayId} />)
} else {
  root.render(
    <React.StrictMode>
      <I18nProvider>
        <App />
      </I18nProvider>
    </React.StrictMode>
  )
}

