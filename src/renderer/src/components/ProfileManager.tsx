import { BookOpen, Download, FilePlus, Trash2, Upload } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { useI18n } from '../i18n'
import type { Profile, ProfileMeta } from '../../../shared/types'

interface ProfileManagerProps {
  currentProfile: Profile
  onLoad: (profile: Profile) => void
  onClose: () => void
}

export function ProfileManager({ currentProfile, onLoad, onClose }: ProfileManagerProps): JSX.Element {
  const { t } = useI18n()
  const [profiles, setProfiles] = useState<ProfileMeta[]>([])
  const [profileName, setProfileName] = useState(currentProfile.name)
  const [message, setMessage] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const importRef = useRef<HTMLInputElement | null>(null)

  const flash = (msg: string) => {
    setMessage(msg)
    window.setTimeout(() => setMessage(''), 2400)
  }

  const refreshList = useCallback(() => {
    window.rgbbox.listProfiles().then(setProfiles)
  }, [])

  useEffect(() => { refreshList() }, [refreshList])

  const handleSave = useCallback(async () => {
    const profile: Profile = { ...currentProfile, name: profileName.trim() || currentProfile.name }
    await window.rgbbox.saveProfileAs(profile)
    refreshList()
    flash(t('profile.saveCurrent'))
  }, [currentProfile, profileName, refreshList, t])

  const handleLoad = useCallback(async (id: string) => {
    const loaded = await window.rgbbox.loadProfileById(id)
    if (loaded) { onLoad(loaded); onClose() }
  }, [onLoad, onClose])

  const handleDelete = useCallback(async (id: string) => {
    await window.rgbbox.deleteProfile(id)
    setConfirmDeleteId(null)
    refreshList()
  }, [refreshList])

  const handleExport = useCallback(async (meta: ProfileMeta) => {
    const loaded = await window.rgbbox.loadProfileById(meta.id)
    if (!loaded) return
    const ok = await window.rgbbox.exportProfileDialog(loaded)
    if (ok) flash(t('profile.export'))
  }, [t])

  const handleExportCurrent = useCallback(async () => {
    const ok = await window.rgbbox.exportProfileDialog({ ...currentProfile, name: profileName || currentProfile.name })
    if (ok) flash(t('profile.export'))
  }, [currentProfile, profileName, t])

  const handleImport = useCallback(async () => {
    const loaded = await window.rgbbox.importProfileDialog()
    if (loaded) {
      onLoad(loaded)
      flash(t('profile.importSuccess'))
      onClose()
    } else if (loaded === null) {
      // user cancelled — do nothing
    }
  }, [onLoad, onClose, t])

  // File-based import fallback (hidden input)
  const handleFileImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string) as Profile
        if (!parsed.id || !parsed.scenes) throw new Error('invalid')
        onLoad(parsed)
        flash(t('profile.importSuccess'))
        onClose()
      } catch {
        flash(t('profile.importError'))
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }, [onLoad, onClose, t])

  return (
    <div className="profile-modal-overlay" onClick={onClose}>
      <div className="profile-modal" onClick={(e) => e.stopPropagation()}>
        <div className="profile-modal-header">
          <div>
            <p className="eyebrow">{t('profile.eyebrow')}</p>
            <h2>{t('profile.title')}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* ── Current profile ──────────────────────────────────────────── */}
        <section className="profile-section">
          <div className="profile-section-label">{t('profile.current')}</div>
          <div className="profile-current-row">
            <input
              className="profile-name-input"
              type="text"
              value={profileName}
              placeholder={t('profile.namePlaceholder')}
              onChange={(e) => setProfileName(e.target.value)}
            />
            <button className="profile-btn primary" type="button" onClick={handleSave}>
              <BookOpen size={14} /> {t('profile.saveCurrent')}
            </button>
            <button className="profile-btn" type="button" onClick={handleExportCurrent}>
              <Download size={14} /> {t('profile.export')}
            </button>
          </div>
        </section>

        {/* ── Saved profiles list ──────────────────────────────────────── */}
        <section className="profile-section">
          <div className="profile-section-label-row">
            <span className="profile-section-label">{t('profile.saved')}</span>
            <button className="profile-btn small" type="button" onClick={handleImport}>
              <Upload size={13} /> {t('profile.import')}
            </button>
            {/* hidden file input fallback */}
            <input
              ref={importRef}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleFileImport}
            />
          </div>

          {profiles.length === 0 ? (
            <p className="profile-empty">{t('profile.noSaved')}</p>
          ) : (
            <ul className="profile-list">
              {profiles.map((meta) => (
                <li
                  key={meta.id}
                  className={`profile-list-item ${meta.id === currentProfile.id ? 'active' : ''}`}
                >
                  <div className="profile-list-info">
                    <strong>{meta.name}</strong>
                    <span>{meta.savedAt ? new Date(meta.savedAt).toLocaleString() : ''}</span>
                  </div>
                  <div className="profile-list-actions">
                    {confirmDeleteId === meta.id ? (
                      <>
                        <button className="profile-btn danger small" type="button" onClick={() => handleDelete(meta.id)}>
                          {t('common.ok')}
                        </button>
                        <button className="profile-btn small" type="button" onClick={() => setConfirmDeleteId(null)}>
                          {t('common.cancel')}
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="profile-btn small" type="button" onClick={() => handleLoad(meta.id)}>
                          <FilePlus size={13} /> {t('profile.load')}
                        </button>
                        <button className="profile-btn small" type="button" onClick={() => handleExport(meta)}>
                          <Download size={13} />
                        </button>
                        <button
                          className="profile-btn danger small"
                          type="button"
                          onClick={() => setConfirmDeleteId(meta.id)}
                          title={t('profile.delete')}
                        >
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {message && <div className="profile-flash">{message}</div>}
      </div>
    </div>
  )
}
