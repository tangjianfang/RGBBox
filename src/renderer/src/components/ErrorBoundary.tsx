import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * R227.3: last-resort render crash containment. Before this, ANY render-time
 * exception in a view whited out the whole window (zero ErrorBoundary in the
 * renderer — REVIEW-VISION-2026-10-09 04-V1). Deliberately self-contained:
 * inline styles only (a broken stylesheet must not break the fallback), no
 * i18n dependency (the crash may be inside the provider), bilingual copy.
 */
interface State { error: Error | null }

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // loud + structured — R230 wires this into the file logger via IPC
    console.error('[RGBBox] render crash caught:', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div style={{
        alignItems: 'center', boxSizing: 'border-box', color: '#e8f0f3',
        display: 'flex', flexDirection: 'column', gap: '16px', height: '100vh',
        justifyContent: 'center', padding: '32px', textAlign: 'center',
      }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>
          界面渲染出错 · UI render error
        </h2>
        <pre style={{
          background: '#161d23', borderRadius: '8px', color: '#9cb7c3', fontSize: '12px',
          margin: 0, maxWidth: '640px', overflow: 'auto', padding: '12px 16px', textAlign: 'left',
          whiteSpace: 'pre-wrap',
        }}>
          {String(this.state.error?.message ?? this.state.error).slice(0, 400)}
        </pre>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            background: '#42e8a9', border: 'none', borderRadius: '6px', color: '#0a1418',
            cursor: 'pointer', fontSize: '14px', padding: '8px 24px',
          }}
        >
          重新加载 · Reload
        </button>
      </div>
    )
  }
}
