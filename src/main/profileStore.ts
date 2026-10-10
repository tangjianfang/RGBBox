import { app } from 'electron'
import { mkdir, readdir, readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { defaultProfile } from '../shared/defaultProfile'
import type { EffectLayer, Profile, ProfileMeta, Scene } from '../shared/types'
import { preserveBadFile, readJsonSafe, writeJsonAtomic } from './atomicJson'

const configDir = join(app.getPath('userData'), 'config')
const profilePath = join(configDir, 'profile.json')
const profilesDir = join(configDir, 'profiles')

// ── Working profile (current session) ─────────────────────────────────────
// R221.1（05 T-C1）: 原子写 + 坏 JSON 防清空。loadProfile 对坏文件返回
// defaultProfile 供会话使用，但 saveProfile 直接以传入 profile 覆盖
// （不经「默认合并」把坏残文件当真值）；临时文件 + rename 保证写一半
// 崩溃不再产生截断 JSON。

export async function loadProfile(): Promise<Profile> {
  const r = await readJsonSafe<Profile>(profilePath)
  if (!r.ok) return defaultProfile
  return {
    ...defaultProfile,
    ...r.value,
    sampling: { ...defaultProfile.sampling, ...r.value.sampling }
  }
}

export async function saveProfile(profile: Profile): Promise<Profile> {
  // R221.1: 坏文件先抢救备份,再原子覆盖(免截断/免坏值合并)
  const r = await readJsonSafe<Profile>(profilePath)
  if (!r.ok && r.reason === 'bad') await preserveBadFile(profilePath)
  await writeJsonAtomic(profilePath, profile)
  return profile
}

// ── R264: shape validation + default migration for loaded/imported profiles ─
// REVIEW-workspace-settings A1 / U1·U3·U4: both loadProfileById and the import
// dialog used to be a bare `JSON.parse(raw) as Profile` — zero validation, zero
// default merge. A syntactically valid but wrongly shaped file (empty/missing
// `scenes`, missing sampling fields) sailed straight into the renderer and
// crashed `activeLayer()`/`activeScene()` (`scene.layers` on undefined) into
// the ErrorBoundary, and legacy slots missing non-optional sampling booleans
// flipped controlled checkboxes. normalizeProfile is the single gate both
// paths now share: structural backbone must be present (else null), everything
// else is deep-merged against defaultProfile.

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

const PERFORMANCE_MODES = new Set(['battery', 'balanced', 'extreme'])
const BLEND_MODES = new Set(['normal', 'add', 'multiply', 'screen'])

function normalizeNumber(v: unknown, fallback: number, opts: { int?: boolean; positive?: boolean } = {}): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback
  if (opts.int && !Number.isInteger(v)) return fallback
  if (opts.positive && v <= 0) return fallback
  return v
}

function normalizeLayer(raw: unknown): EffectLayer | null {
  if (!isPlainObject(raw)) return null
  if (typeof raw.id !== 'string' || raw.id === '') return null
  if (typeof raw.kind !== 'string' || raw.kind === '') return null
  const blendMode = typeof raw.blendMode === 'string' && BLEND_MODES.has(raw.blendMode) ? raw.blendMode : 'screen'
  return {
    ...raw,
    id: raw.id,
    name: typeof raw.name === 'string' && raw.name !== '' ? raw.name : 'Layer',
    kind: raw.kind as EffectLayer['kind'],
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : true,
    opacity: normalizeNumber(raw.opacity, 0.75),
    blendMode: blendMode as EffectLayer['blendMode'],
    parameters: isPlainObject(raw.parameters) ? (raw.parameters as EffectLayer['parameters']) : {}
  } as EffectLayer
}

function normalizeScene(raw: unknown): Scene | null {
  if (!isPlainObject(raw)) return null
  if (typeof raw.id !== 'string' || raw.id === '') return null
  if (raw.layers !== undefined && !Array.isArray(raw.layers)) return null
  const layers = (Array.isArray(raw.layers) ? raw.layers : [])
    .map(normalizeLayer)
    .filter((l): l is EffectLayer => l !== null)
  const displayIds = Array.isArray(raw.displayIds) ? raw.displayIds.filter((d): d is number => typeof d === 'number' && Number.isFinite(d)) : []
  const scene = {
    ...raw,
    id: raw.id,
    name: typeof raw.name === 'string' && raw.name !== '' ? raw.name : 'Scene',
    displayIds,
    layers
  } as Scene
  // Optional scene extras: keep only when well-shaped, drop garbage instead of
  // letting it reach the engine/renderer.
  if (scene.videoWall !== undefined && !isPlainObject(raw.videoWall)) delete (scene as { videoWall?: unknown }).videoWall
  if (scene.linkedDisplays !== undefined && typeof raw.linkedDisplays !== 'boolean') delete (scene as { linkedDisplays?: unknown }).linkedDisplays
  return scene
}

function normalizeSampling(raw: unknown): Profile['sampling'] {
  const d = defaultProfile.sampling
  if (!isPlainObject(raw)) return { ...d }
  const renderStyle = raw.renderStyle === 'pixel' || raw.renderStyle === 'smooth' ? raw.renderStyle : d.renderStyle
  return {
    ...d,
    columns: normalizeNumber(raw.columns, d.columns, { int: true, positive: true }),
    rows: normalizeNumber(raw.rows, d.rows, { int: true, positive: true }),
    fps: normalizeNumber(raw.fps, d.fps, { int: true, positive: true }),
    smoothing: normalizeNumber(raw.smoothing, d.smoothing),
    brightnessLimit: normalizeNumber(raw.brightnessLimit, d.brightnessLimit, { positive: true }),
    saturationBoost: normalizeNumber(raw.saturationBoost, d.saturationBoost, { positive: true }),
    usePerformanceGuard: typeof raw.usePerformanceGuard === 'boolean' ? raw.usePerformanceGuard : d.usePerformanceGuard,
    showGap: typeof raw.showGap === 'boolean' ? raw.showGap : d.showGap,
    renderStyle
  }
}

/**
 * R264: validate + migrate an untrusted profile value (file on disk, import
 * dialog pick). Structural backbone (object root, non-empty `scenes` array,
 * object scenes with string ids and array `layers`, object `sampling`) must be
 * present or the profile is rejected as null — callers then skip/report the
 * file instead of crashing the renderer. Everything else is filled in from
 * defaultProfile (deep merge), so legacy slots missing later-added
 * non-optional fields (e.g. `usePerformanceGuard`) come back complete.
 * Unknown extra fields are preserved via spread for forward compatibility.
 */
export function normalizeProfile(raw: unknown): Profile | null {
  if (!isPlainObject(raw)) return null
  if (!Array.isArray(raw.scenes) || raw.scenes.length === 0) return null
  if (raw.sampling !== undefined && !isPlainObject(raw.sampling)) return null
  const scenes: Scene[] = []
  for (const s of raw.scenes) {
    const scene = normalizeScene(s)
    if (!scene) return null
    scenes.push(scene)
  }
  const activeSceneId =
    typeof raw.activeSceneId === 'string' && scenes.some((s) => s.id === raw.activeSceneId)
      ? raw.activeSceneId
      : scenes[0].id
  return {
    ...raw,
    id: typeof raw.id === 'string' && raw.id !== '' ? raw.id : defaultProfile.id,
    name: typeof raw.name === 'string' && raw.name !== '' ? raw.name : defaultProfile.name,
    activeSceneId,
    performanceMode:
      typeof raw.performanceMode === 'string' && PERFORMANCE_MODES.has(raw.performanceMode)
        ? (raw.performanceMode as Profile['performanceMode'])
        : defaultProfile.performanceMode,
    sampling: normalizeSampling(raw.sampling),
    scenes
  } as Profile
}

/** R264/U3: mint a fresh named-slot id (same format as the renderer's
 *  duplicate action) — an import whose file id collides with an existing slot
 *  gets this instead of silently overwriting the slot via auto-save. */
export function mintProfileId(): string {
  return `profile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

/**
 * R264: the import dialog's single entry point. Parses, validates and migrates
 * the picked file's text; null when the file is not JSON or wrongly shaped.
 * When the (possibly migrated) profile's id collides with an existing named
 * slot — including a corrupt-but-present slot file — a fresh id is minted so
 * the renderer's 400ms auto-save can never overwrite the existing slot.
 */
export async function importProfile(rawText: string): Promise<Profile | null> {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch {
    return null
  }
  const profile = normalizeProfile(parsed)
  if (!profile) return null
  const slot = await readJsonSafe<Profile>(join(profilesDir, `${profile.id}.json`))
  if (slot.ok || slot.reason === 'bad') return { ...profile, id: mintProfileId() }
  return profile
}

// ── Named profile slots ────────────────────────────────────────────────────

export async function listProfiles(): Promise<ProfileMeta[]> {
  try {
    await mkdir(profilesDir, { recursive: true })
    const files = await readdir(profilesDir)
    const metas: ProfileMeta[] = []
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      try {
        const raw = await readFile(join(profilesDir, file), 'utf-8')
        const p: Profile & { _savedAt?: string } = JSON.parse(raw)
        metas.push({ id: p.id, name: p.name, savedAt: p._savedAt ?? '' })
      } catch {
        // skip malformed files
      }
    }
    return metas.sort((a, b) => a.savedAt.localeCompare(b.savedAt))
  } catch {
    return []
  }
}

export async function loadProfileById(id: string): Promise<Profile | null> {
  try {
    const raw = await readFile(join(profilesDir, `${id}.json`), 'utf-8')
    // R264: was a bare `JSON.parse(raw) as Profile` — wrong-shaped slots
    // (e.g. `scenes: []`) reached the renderer and crashed activeLayer().
    // normalizeProfile rejects those (null) and deep-merges defaults into
    // legacy slots missing non-optional fields.
    return normalizeProfile(JSON.parse(raw))
  } catch {
    return null
  }
}

export async function saveProfileAs(profile: Profile): Promise<ProfileMeta> {
  // R222.3: 坏文件先抢救备份再原子覆盖——与 saveProfile 对称(T3 缺口)
  const slotPath = join(profilesDir, `${profile.id}.json`)
  const r = await readJsonSafe<Profile>(slotPath)
  if (!r.ok && r.reason === 'bad') await preserveBadFile(slotPath)
  const savedAt = new Date().toISOString()
  const stored = { ...profile, _savedAt: savedAt }
  await writeJsonAtomic(slotPath, stored) // R221.1: 原子写
  return { id: profile.id, name: profile.name, savedAt }
}

export async function deleteProfile(id: string): Promise<void> {
  try {
    await unlink(join(profilesDir, `${id}.json`))
  } catch {
    // ignore if already gone
  }
}

