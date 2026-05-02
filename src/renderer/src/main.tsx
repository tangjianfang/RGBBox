import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { OverlayCanvas } from './components/OverlayCanvas'
import { I18nProvider } from './i18n'
import './styles.css'

const params = new URLSearchParams(window.location.search)
const isOverlay = params.get('overlay') === 'true'
const overlayDisplayId = Number(params.get('displayId') ?? 0)

const root = ReactDOM.createRoot(document.getElementById('root')!)

if (isOverlay) {
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
