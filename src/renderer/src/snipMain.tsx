/**
 * snipMain — R130.1 轻量截图窗口入口（snip.html）。
 * 只装 I18nProvider + SnipView（R70.9 教训：裸分支会渲染出原始 key），
 * 与主入口 main.tsx 的 isSnip 分支渲染等价 —— 该分支保留作回退。
 */
import ReactDOM from 'react-dom/client'
import { SnipView } from './components/SnipView'
import { I18nProvider } from './i18n'
import './styles.css'

const params = new URLSearchParams(window.location.search)
const displayId = Number(params.get('displayId') ?? 0)

document.documentElement.style.overflow = 'hidden'
document.body.classList.add('snip-mode')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <I18nProvider>
    <SnipView displayId={displayId} />
  </I18nProvider>,
)
