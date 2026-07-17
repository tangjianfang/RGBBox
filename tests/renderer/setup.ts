// Global setup for renderer tests.
// Runs once per test file (vitest setupFiles). Here we register:
//   - @testing-library/jest-dom matchers
//   - Shared vi.mock for i18n / lucide-react / GL classes
//   - Polyfills (window.rgbbox) at globalThis scope
//
// Per-test mock returns (specific return values) are configured in each test
// file via `setupRendererMocks()` from `tests/renderer/_helpers.tsx`.

import '@testing-library/jest-dom/vitest'
import { beforeEach, vi } from 'vitest'

class MockBroadcastChannel {
  static channels = new Map<string, Set<MockBroadcastChannel>>()
  onmessage: ((event: MessageEvent) => void) | null = null
  constructor(public readonly name: string) {
    const channels = MockBroadcastChannel.channels.get(name) ?? new Set<MockBroadcastChannel>()
    channels.add(this)
    MockBroadcastChannel.channels.set(name, channels)
  }
  postMessage(data: unknown): void {
    for (const channel of MockBroadcastChannel.channels.get(this.name) ?? []) {
      if (channel !== this) channel.onmessage?.({ data } as MessageEvent)
    }
  }
  close(): void {
    MockBroadcastChannel.channels.get(this.name)?.delete(this)
  }
}

;(globalThis as any).BroadcastChannel = MockBroadcastChannel

// ─── i18n (return key as-is, deterministic) ───────────────────────────────
vi.mock('../../src/renderer/src/i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, lang: 'en', setLang: vi.fn() })
}))

// ─── lucide-react: every icon → a tiny stub component ─────────────────────
// A plain object of stub components. Most-used icons listed explicitly so
// destructured imports (`import { Star, Play } from 'lucide-react'`) work.
// Any icon NOT in this list returns the catchAll stub.
vi.mock('lucide-react', () => {
  const catchAll: any = (props: any) => null
  catchAll.displayName = 'IconStub'
  // Plain object (no Proxy — V8 in some envs rejects Proxy as a module export shape).
  // To handle unknown icon names we pre-create ~200 common ones by replicating
  // catchAll — but since the bulk of icons used in the app are known statically,
  // we list them here. The Proxy fallback was tried and rejected; the explicit
  // list is more robust.
  const icons: Record<string, any> = { __esModule: true, default: catchAll }
  const NAMES = [
    'Activity','AlertCircle','AlertTriangle','AlignCenter','AlignJustify','AlignLeft','AlignRight',
    'AppWindow','ArrowDown','ArrowLeft','ArrowRight','ArrowUp','AtSign','Award',
    'Battery','BatteryCharging','Bell','BellOff','Bluetooth','Bold','Book','BookOpen','Bookmark','Box',
    'Briefcase','Calendar','Camera','CameraOff','Cast','Check','ChevronDown','ChevronLeft',
    'ChevronRight','ChevronUp','Circle','Clipboard','Clock','Cloud','CloudOff','Code','Codepen',
    'Coffee','Command','Compass','Copy','Cpu','Crop','Crosshair','Database','Delete','Disc',
    'Download','Droplet','Edit','Edit2','Eye','EyeOff','Facebook','File','FilePlus','FileText','Film',
    'Filter','Flag','FlipHorizontal','FlipVertical','Folder','FolderOpen','Frown','Gift','GitBranch','GitCommit','GitMerge',
    'GitPullRequest','Globe','Grid','Gauge','HardDrive','Hash','Headphones','Heart','HelpCircle',
    'Hexagon','Home','Image','Inbox','Info','Instagram','Italic','Key','Languages','Layers','Layout',
    'LifeBuoy','Link','Link2','Link2Off','Linkedin','List','Loader','Lock','LogIn','LogOut','Mail','Map','MapPin',
    'Maximize','Maximize2','Menu','MessageCircle','MessageSquare','Mic','MicOff','Minimize','Minimize2','Minus',
    'Monitor','MonitorPlay','Moon','MoreHorizontal','MoreVertical','Mouse','Music','Navigation',
    'Octagon','Package','Paperclip','Pause','PenTool','Pencil','Percent','Phone','PhoneCall','PhoneOff',
    'PieChart','Play','PlayCircle','Plus','PlusCircle','Pocket','Power','Printer','Radio',
    'RefreshCw','Repeat','Reply','Rewind','RotateCcw','RotateCw','Rss','Save','Scissors',
    'Search','Send','Server','Settings','Share','Share2','Shield','ShieldOff','ShoppingBag',
    'ShoppingCart','Shuffle','Sidebar','SkipBack','SkipForward','Slack','Slash','Sliders',
    'Smartphone','Smile','Sparkles','Speaker','Square','Star','StopCircle','Sun','Sunrise','Sunset',
    'Tablet','Tag','Target','Terminal','Thermometer','ThumbsDown','ThumbsUp','ToggleLeft',
    'ToggleRight','Tool','Trash','Trash2','Trello','TrendingDown','TrendingUp','Triangle',
    'Truck','Tv','Twitter','Type','Umbrella','Underline','Unlock','Upload','User','UserCheck',
    'UserMinus','UserPlus','Users','UserX','Video','VideoOff','Voicemail','Volume','Volume1',
    'Volume2','VolumeX','Watch','Wifi','WifiOff','Wind','X','XCircle','Youtube','Zap','ZoomIn','ZoomOut',
    'Gamepad2','FolderPlus','FolderMinus','FilePlus','FileMinus','FastForward','Rewind',
    'CastOff','ScreenShare','BellRing','Clock2','Clock3','Clock4','PlaySquare'
  ]
  for (const n of NAMES) icons[n] = catchAll
  return icons
})

// ─── GL classes: stub public surface so components can call them safely ──
class MockEffect3DGl {
  public kind = 'sphere-pulse'
  public loaded = true
  static instances: MockEffect3DGl[] = []
  constructor() { MockEffect3DGl.instances.push(this) }
  init = vi.fn().mockResolvedValue(undefined)
  draw = vi.fn().mockReturnValue(true)
  render = vi.fn().mockReturnValue(true)
  resize = vi.fn()
  dispose = vi.fn()
}
class MockEffectGl {
  static instances: MockEffectGl[] = []
  init = vi.fn().mockResolvedValue(undefined)
  draw = vi.fn().mockReturnValue(true)
  render = vi.fn().mockReturnValue(true)
  resize = vi.fn()
  dispose = vi.fn()
  constructor() { MockEffectGl.instances.push(this) }
}
class MockPreviewGl {
  static instances: MockPreviewGl[] = []
  init = vi.fn().mockResolvedValue(undefined)
  draw = vi.fn().mockReturnValue(true)
  drawFrame = vi.fn().mockReturnValue(true)
  render = vi.fn().mockReturnValue(true)
  setGap = vi.fn()
  setRenderStyle = vi.fn()
  setFit = vi.fn()
  resize = vi.fn()
  dispose = vi.fn()
  constructor() { MockPreviewGl.instances.push(this) }
}
(globalThis as any).__rgbboxTestMocks = { MockEffectGl, MockPreviewGl }

beforeEach(() => {
  MockBroadcastChannel.channels.clear()
  MockEffect3DGl.instances = []
  MockEffectGl.instances = []
  MockPreviewGl.instances = []
})
vi.mock('../../src/renderer/src/gl/effect3dGl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/renderer/src/gl/effect3dGl')>()
  return { ...actual, Effect3DGl: MockEffect3DGl }
})
vi.mock('../../src/renderer/src/gl/effectGl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/renderer/src/gl/effectGl')>()
  return { ...actual, EffectGl: MockEffectGl }
})
// R63: partial mock — keep `PreviewGl` stubbed (no real WebGL context needed
// for component tests), but pass through the module's other real named
// exports (e.g. `computeContainLayout`, a pure function with no GL/DOM
// dependency) unmodified, so tests can exercise the actual implementation.
vi.mock('../../src/renderer/src/gl/previewGl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/renderer/src/gl/previewGl')>()
  return { ...actual, PreviewGl: MockPreviewGl }
})
