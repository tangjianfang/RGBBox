import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { AudioVizProjector } from './components/AudioVizProjector'
import { OverlayCanvas } from './components/OverlayCanvas'
import { ScreensaverView } from './components/ScreensaverView'
import { SnipView } from './components/SnipView'
import { I18nProvider } from './i18n'
import './styles.css'

const params = new URLSearchParams(window.location.search)
const isOverlay = params.get('overlay') === 'true'
const isAudioViz = params.get('audioviz') === 'true'
const isScreensaver = params.get('screensaver') === '1'
const isSnip = params.get('snip') === '1'
const overlayDisplayId = Number(params.get('displayId') ?? 0)
// R65: whether this overlay window was created opaque (fullscreen region —
// see overlayManager.ts#openOverlay) rather than transparent (non-fullscreen
// preset-third/custom region, which needs to show the desktop through its
// letterbox bars). Read from the URL because `transparent` is a BrowserWindow
// creation-time-only property the renderer process has no other way to see.
const overlayOpaque = params.get('opaque') === '1'

const root = ReactDOM.createRoot(document.getElementById('root')!)

if (isAudioViz) {
  // R29.3 (revised): full-resolution audio visualizer projector — a plain
  // opaque window, not the transparent LED overlay.
  document.documentElement.style.overflow = 'hidden'
  document.body.classList.add('audioviz-mode')
  // R70.9: the projector calls useI18n() for its ESC hint — without the
  // provider the context default renders the raw key ('overlay.hint').
  root.render(
    <I18nProvider>
      <AudioVizProjector displayId={overlayDisplayId} />
    </I18nProvider>
  )
} else if (isScreensaver) {
  // R74: light-effect screensaver — opaque fullscreen, renders the saved
  // workspace effect locally. Wrapped in I18nProvider for the ESC hint
  // (R70.9 lesson: bare branches render raw keys).
  document.documentElement.style.overflow = 'hidden'
  document.body.classList.add('audioviz-mode')
  root.render(
    <I18nProvider>
      <ScreensaverView displayId={overlayDisplayId} />
    </I18nProvider>
  )
} else if (isSnip) {
  // R80: standalone global snip — frozen fullscreen frame + region select + annotator
  document.documentElement.style.overflow = 'hidden'
  document.body.classList.add('snip-mode')
  root.render(
    <I18nProvider>
      <SnipView displayId={overlayDisplayId} />
    </I18nProvider>
  )
} else if (isOverlay) {
  // Prevent the OS-theme scrollbars that appear when body min-width/min-height
  // (960px / 640px) exceeds the partial-region overlay window dimensions.
  document.documentElement.style.overflow = 'hidden'
  document.body.classList.add('overlay-mode')
  root.render(<OverlayCanvas displayId={overlayDisplayId} opaque={overlayOpaque} />)
} else {
  root.render(
    <React.StrictMode>
      <I18nProvider>
        <App />
      </I18nProvider>
    </React.StrictMode>
  )
}

