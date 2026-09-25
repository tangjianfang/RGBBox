import type { JSX } from 'react'
import { useI18n } from '../i18n'

/**
 * R171: AI Lab "SVG Animation" tab — a pelican riding a bicycle, drawn as a
 * pure hand-authored SVG scene animated with CSS keyframes (no canvas, no
 * raster assets, no dependencies). All animation classes are `pelican-*` and
 * defined centrally in app.css; `prefers-reduced-motion` pauses everything.
 *
 * Scene layout (640×400): dusk sky + pulsing sun + drifting clouds, road with
 * scrolling dashes at y=336, bicycle with spinning wheels/crank/chain, and a
 * bobbing pelican pedalling it. The moving background sells the "riding" read.
 */
export function AiLabSvgTab(): JSX.Element {
  const { t } = useI18n()
  return (
    <div className="ai-svg-tab">
      <div className="ai-svg-stage">
        <svg className="ai-svg-scene" viewBox="0 0 640 400" role="img" aria-label={t('ai.lab.svg.title')}>
          <defs>
            <linearGradient id="pelican-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#141d2b" />
              <stop offset="0.62" stopColor="#2a3854" />
              <stop offset="1" stopColor="#41507a" />
            </linearGradient>
            <radialGradient id="pelican-sun">
              <stop offset="0" stopColor="#ffd76e" />
              <stop offset="0.55" stopColor="#f8a94c" stopOpacity="0.85" />
              <stop offset="1" stopColor="#f8a94c" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* sky + sun + clouds */}
          <rect x="0" y="0" width="640" height="400" fill="url(#pelican-sky)" />
          <circle className="pelican-sun" cx="522" cy="86" r="52" fill="url(#pelican-sun)" />
          <g className="pelican-cloud pelican-cloud-a">
            <ellipse cx="0" cy="74" rx="34" ry="13" fill="#8b98b6" opacity="0.5" />
            <ellipse cx="26" cy="66" rx="26" ry="12" fill="#8b98b6" opacity="0.38" />
          </g>
          <g className="pelican-cloud pelican-cloud-b">
            <ellipse cx="0" cy="132" rx="24" ry="9" fill="#8b98b6" opacity="0.34" />
            <ellipse cx="18" cy="126" rx="16" ry="8" fill="#8b98b6" opacity="0.26" />
          </g>

          {/* road */}
          <rect x="0" y="336" width="640" height="64" fill="#151d2b" />
          <line x1="0" y1="336" x2="640" y2="336" stroke="#43547a" strokeWidth="2" />
          <line className="pelican-road" x1="-48" y1="366" x2="688" y2="366" stroke="#93a5c8" strokeWidth="4" strokeLinecap="round" strokeDasharray="30 22" opacity="0.75" />

          {/* bicycle — rear hub (222,292) · front hub (398,292) · crank (300,300) */}
          <g>
            {/* chain: crank sprocket → rear hub */}
            <line x1="300" y1="285" x2="222" y2="287" stroke="#93a5c8" strokeWidth="2.5" strokeDasharray="5 3" className="pelican-chain" />
            <line x1="300" y1="315" x2="222" y2="297" stroke="#93a5c8" strokeWidth="2.5" strokeDasharray="5 3" className="pelican-chain" />

            {/* rear wheel */}
            <g>
              <circle cx="222" cy="292" r="44" fill="none" stroke="#dfe7f4" strokeWidth="7" />
              <circle cx="222" cy="292" r="33" fill="none" stroke="#7d8ba4" strokeWidth="2.5" />
              <g className="pelican-spin">
                {[0, 45, 90, 135, 90 + 45, 180 + 45, 270, 315].map((deg) => (
                  <line
                    key={deg}
                    x1="222" y1="259" x2="222" y2="325"
                    stroke="#7d8ba4" strokeWidth="2"
                    transform={`rotate(${deg} 222 292)`}
                  />
                ))}
              </g>
              <circle cx="222" cy="292" r="6" fill="#dfe7f4" />
            </g>

            {/* front wheel */}
            <g>
              <circle cx="398" cy="292" r="44" fill="none" stroke="#dfe7f4" strokeWidth="7" />
              <circle cx="398" cy="292" r="33" fill="none" stroke="#7d8ba4" strokeWidth="2.5" />
              <g className="pelican-spin">
                {[0, 45, 90, 135, 90 + 45, 180 + 45, 270, 315].map((deg) => (
                  <line
                    key={deg}
                    x1="398" y1="259" x2="398" y2="325"
                    stroke="#7d8ba4" strokeWidth="2"
                    transform={`rotate(${deg} 398 292)`}
                  />
                ))}
              </g>
              <circle cx="398" cy="292" r="6" fill="#dfe7f4" />
            </g>

            {/* frame */}
            <g stroke="#e8703a" strokeWidth="7" strokeLinecap="round" fill="none">
              <line x1="222" y1="292" x2="300" y2="300" />
              <line x1="222" y1="292" x2="270" y2="224" />
              <line x1="270" y1="224" x2="300" y2="300" />
              <line x1="270" y1="224" x2="384" y2="252" />
              <line x1="300" y1="300" x2="384" y2="252" />
              <line x1="384" y1="252" x2="398" y2="292" />
            </g>

            {/* crank + pedals */}
            <g className="pelican-crank">
              <line x1="280" y1="300" x2="320" y2="300" stroke="#cfd8ea" strokeWidth="5" strokeLinecap="round" />
              <rect x="270" y="296" width="12" height="7" rx="2" fill="#e8eef7" />
              <rect x="318" y="296" width="12" height="7" rx="2" fill="#e8eef7" />
            </g>
            <circle cx="300" cy="300" r="16" fill="none" stroke="#cfd8ea" strokeWidth="4" />

            {/* stem + handlebar */}
            <line x1="384" y1="252" x2="380" y2="212" stroke="#e8703a" strokeWidth="6" strokeLinecap="round" />
            <line x1="366" y1="208" x2="394" y2="212" stroke="#2f3b52" strokeWidth="6" strokeLinecap="round" />

            {/* seat */}
            <rect x="252" y="212" width="38" height="9" rx="4.5" fill="#2f3b52" />
          </g>

          {/* pelican (bobs gently; wing flaps; legs to the pedals) */}
          <g className="pelican-bob">
            <path d="M292 226 L297 258 L301 294" stroke="#f0a23c" strokeWidth="6" strokeLinecap="round" fill="none" />
            <path d="M312 226 L314 258 L309 294" stroke="#e2823a" strokeWidth="6" strokeLinecap="round" fill="none" />
            <path d="M250 188 L232 180 L248 198 L230 196 L252 206" fill="#f4f7fd" />
            <ellipse cx="298" cy="194" rx="52" ry="36" fill="#f4f7fd" />
            <path className="pelican-wing" d="M270 184 C300 176 328 186 330 202 C318 216 284 216 268 204 C262 196 264 188 270 184 Z" fill="#dbe4f2" />
            <path d="M330 176 C334 162 340 148 352 136" stroke="#f4f7fd" strokeWidth="16" strokeLinecap="round" fill="none" />
            <circle cx="356" cy="130" r="18" fill="#f4f7fd" />
            <path d="M350 114 C354 108 362 108 364 114" stroke="#dbe4f2" strokeWidth="4" strokeLinecap="round" fill="none" />
            <circle cx="363" cy="125" r="3" fill="#1c2431" />
            <circle cx="364" cy="124" r="1.2" fill="#ffffff" />
            <path d="M370 128 L440 146 L372 144 Z" fill="#f0a23c" />
            <path className="pelican-pouch" d="M372 142 C390 166 420 164 438 147 L372 144 Z" fill="#e2823a" />
          </g>
        </svg>
      </div>
      <p className="ai-svg-caption">{t('ai.lab.svg.caption')}</p>
    </div>
  )
}
