import { useCallback, useEffect, useRef, useState, type ChangeEvent, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { defaultProfile } from '../../../../shared/defaultProfile'
import type { BlendMode, EffectKind, EffectLayer, Profile, ProfileMeta } from '../../../../shared/types'
import { nextLayerId } from '../../domain/profileUtils'
import type { TranslationKey } from '../../i18n'

/**
 * R147 P3b: profile-slot management domain, moved verbatim from App.tsx —
 * the named-profile list + menu (duplicate/rename/delete/import/export), the
 * debounced auto-save of the working profile, and the layer-pack
 * import/export. The working profile itself stays in App (every domain
 * writes to it); this hook takes it as an argument.
 */
export function useProfileManager(args: {
  profile: Profile | null
  setProfile: Dispatch<SetStateAction<Profile | null>>
  selectedLayer: EffectLayer | null
  setSelectedLayerId: (id: string) => void
  t: (key: TranslationKey) => string
}) {
  const { profile, setProfile, selectedLayer, setSelectedLayerId, t } = args
  const [savedProfiles, setSavedProfiles] = useState<ProfileMeta[]>([])
  // Ref lets the auto-save effect read savedProfiles without listing it as a dep
  const savedProfilesRef = useRef<ProfileMeta[]>([])
  savedProfilesRef.current = savedProfiles
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [profileEditMode, setProfileEditMode] = useState<'duplicate' | 'rename' | null>(null)
  const [profileEditName, setProfileEditName] = useState('')
  const profileMenuRef = useRef<HTMLDivElement | null>(null)
  const editInputRef = useRef<HTMLInputElement | null>(null)

  const refreshProfiles = useCallback(() => {
    window.rgbbox.listProfiles().then(setSavedProfiles)
  }, [])

  // Note: initial load is done inside App's boot Promise.all to allow
  // ensuring the working profile is always registered as a named slot.

  // Close profile menu on outside click
  useEffect(() => {
    if (!profileMenuOpen) return undefined
    const handler = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [profileMenuOpen])

  // Debounced auto-save: always persist working state to the quick-save slot,
  // and also update the named profile slot so switching away and back
  // preserves the latest changes.
  useEffect(() => {
    if (!profile) return undefined
    const timer = window.setTimeout(() => {
      // Always persist working state to the quick-save slot
      window.rgbbox.saveProfile(profile)
      // Also update the named profile slot so that switching away and back
      // preserves the latest changes.
      if (savedProfilesRef.current.find((p) => p.id === profile.id)) {
        window.rgbbox.saveProfileAs(profile).then((meta) => {
          setSavedProfiles((prev) => prev.map((p) => p.id === meta.id ? meta : p))
        })
      }
    }, 400)
    return () => window.clearTimeout(timer)
  }, [profile])

  // ── Profile menu actions ─────────────────────────────────────────────────
  const handleProfileDuplicate = useCallback(() => {
    if (!profile) return
    setProfileMenuOpen(false)
    setProfileEditName(`${profile.name} Copy`)
    setProfileEditMode('duplicate')
    window.setTimeout(() => editInputRef.current?.focus(), 30)
  }, [profile])

  const handleProfileRename = useCallback(() => {
    if (!profile) return
    setProfileMenuOpen(false)
    setProfileEditName(profile.name)
    setProfileEditMode('rename')
    window.setTimeout(() => editInputRef.current?.focus(), 30)
  }, [profile])

  const handleProfileEditConfirm = useCallback(async () => {
    const name = profileEditName.trim()
    if (!name || !profile) { setProfileEditMode(null); return }
    if (profileEditMode === 'duplicate') {
      const newId = `profile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
      const newProfile: Profile = { ...profile, id: newId, name }
      await window.rgbbox.saveProfileAs(newProfile)
      setProfile(newProfile)
      refreshProfiles()
    } else if (profileEditMode === 'rename' && profile) {
      const renamed: Profile = { ...profile, name }
      if (savedProfiles.find((p) => p.id === profile.id)) {
        await window.rgbbox.saveProfileAs(renamed)
        refreshProfiles()
      }
      setProfile(renamed)
    }
    setProfileEditMode(null)
  }, [profileEditMode, profileEditName, profile, savedProfiles, refreshProfiles])

  const handleProfileDelete = useCallback(async () => {
    if (!profile) return
    setProfileMenuOpen(false)
    if (!savedProfiles.find((p) => p.id === profile.id)) return
    await window.rgbbox.deleteProfile(profile.id)
    const remaining = savedProfiles.filter((p) => p.id !== profile.id)
    setSavedProfiles(remaining)
    if (remaining.length > 0) {
      const first = await window.rgbbox.loadProfileById(remaining[0].id)
      if (first) { setProfile(first); return }
    }
    setProfile({ ...defaultProfile })
  }, [profile, savedProfiles])

  const handleProfileImport = useCallback(async () => {
    setProfileMenuOpen(false)
    const loaded = await window.rgbbox.importProfileDialog()
    if (loaded) { setProfile(loaded); refreshProfiles() }
  }, [refreshProfiles])

  const handleProfileExport = useCallback(async () => {
    if (!profile) return
    setProfileMenuOpen(false)
    await window.rgbbox.exportProfileDialog(profile)
  }, [profile])

  // ── Layer pack import/export ──────────────────────────────────────────────
  const exportLayerPack = useCallback(() => {
    if (!selectedLayer) return
    const pack = {
      rgbboxEffectPack: '1.0',
      layer: {
        name: selectedLayer.name,
        kind: selectedLayer.kind,
        enabled: selectedLayer.enabled,
        opacity: selectedLayer.opacity,
        blendMode: selectedLayer.blendMode,
        parameters: selectedLayer.parameters,
      },
    }
    const json = JSON.stringify(pack, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${selectedLayer.name.replace(/\s+/g, '_')}.rgbbox.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [selectedLayer])

  const importLayerPackRef = useRef<HTMLInputElement>(null)

  const handleImportLayerPack = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const pack = JSON.parse(ev.target?.result as string)
        if (!pack?.rgbboxEffectPack || !pack?.layer) throw new Error('Invalid pack')
        const src = pack.layer as Partial<EffectLayer>
        const imported: EffectLayer = {
          id: nextLayerId(),
          name: typeof src.name === 'string' ? src.name : 'Imported',
          kind: (src.kind as EffectKind) ?? 'rainbow',
          enabled: true,
          opacity: typeof src.opacity === 'number' ? src.opacity : 0.75,
          blendMode: (src.blendMode as BlendMode) ?? 'screen',
          parameters: src.parameters && typeof src.parameters === 'object' ? src.parameters : {},
        }
        setProfile((cur) => {
          if (!cur) return cur
          const sceneId = (cur.scenes.find((s) => s.id === cur.activeSceneId) ?? cur.scenes[0]).id
          return {
            ...cur,
            scenes: cur.scenes.map((s) =>
              s.id !== sceneId ? s : { ...s, layers: [...s.layers, imported] }
            ),
          }
        })
        setSelectedLayerId(imported.id)
      } catch {
        alert(t('pack.importError'))
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }, [t, setProfile, setSelectedLayerId])

  return {
    savedProfiles, setSavedProfiles, refreshProfiles,
    profileMenuOpen, setProfileMenuOpen,
    profileEditMode, setProfileEditMode,
    profileEditName, setProfileEditName,
    profileMenuRef: profileMenuRef as RefObject<HTMLDivElement | null>,
    editInputRef: editInputRef as RefObject<HTMLInputElement | null>,
    handleProfileDuplicate, handleProfileRename, handleProfileEditConfirm,
    handleProfileDelete, handleProfileImport, handleProfileExport,
    exportLayerPack, importLayerPackRef: importLayerPackRef as RefObject<HTMLInputElement | null>, handleImportLayerPack,
  }
}
