import { useEffect, useRef, useState } from 'react'
import { Download, LoaderCircle } from 'lucide-react'
import { useI18n, defaults, validatePrefs } from '../i18n'
import type { Prefs, Key } from '../i18n'
import { api, downloadFile, saveBlob } from '../types'
import type { BackupInfo } from '../types'
import { Card, ErrorNotice, Modal } from '../ui'

import type { Notify } from '../notifications'
export function Settings({
  disabled,
  demo,
  notify,
  onRestored,
  onGuide,
}: {
  disabled: boolean
  demo: boolean
  notify: Notify
  onRestored: () => Promise<void>
  onGuide: () => void
}) {
  const { t, prefs, setPrefs, num, created } = useI18n()
  const [archive, setArchive] = useState<File | null>(null),
    [backupInfo, setBackupInfo] = useState<BackupInfo | null>(null),
    [operation, setOperation] = useState<Key | null>(null),
    [error, setError] = useState(''),
    [confirm, setConfirm] = useState(false),
    [recovery, setRecovery] = useState(false)
  const settingsFile = useRef<HTMLInputElement>(null),
    archiveFile = useRef<HTMLInputElement>(null)
  useEffect(() => {
    void api<{ recovery_available: boolean }>('/backup/status')
      .then((r) => setRecovery(r.recovery_available))
      .catch(() => {})
  }, [])
  const update = <K extends keyof Prefs>(k: K, v: Prefs[K]) => setPrefs({ ...prefs, [k]: v })
  async function backup() {
    setOperation('creatingBackup')
    setError('')
    try {
      await downloadFile('/api/backup', 'samal-backup.zip')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setOperation(null)
    }
  }
  async function inspect(restore = false) {
    if (!archive || demo || disabled) return
    setOperation(restore ? 'restoring' : 'previewing')
    setError('')
    const body = new FormData()
    body.append('file', archive)
    if (restore) body.append('confirm', 'restore')
    try {
      const info = await api<BackupInfo>(`/backup/${restore ? 'restore' : 'preview'}`, {
        method: 'POST',
        body,
      })
      if (restore) {
        setConfirm(false)
        setRecovery(true)
        setBackupInfo(null)
        setArchive(null)
        await onRestored()
        notify('restored')
      } else setBackupInfo(info)
    } catch (e) {
      setError((e as Error).message)
      setConfirm(false)
    } finally {
      setOperation(null)
    }
  }
  async function loadPrefs(file?: File) {
    if (!file) return
    try {
      if (file.size > 65536) throw new Error()
      const p = JSON.parse(await file.text())
      if (p.format !== 'samal-preferences' || p.version !== 1 || !validatePrefs(p.preferences))
        throw new Error()
      setPrefs(p.preferences)
      notify('prefsImported')
    } catch {
      setError(t('invalidPrefs'))
    }
    if (settingsFile.current) settingsFile.current.value = ''
  }
  return (
    <>
      <div className="settings-grid">
        <Card title={t('appearance')} sub={t('savedLocally')}>
          <div className="settings-body">
            <label>
              {t('language')}
              <select
                value={prefs.language}
                onChange={(e) => update('language', e.target.value as Prefs['language'])}
              >
                <option value="kk">Қазақша</option>
                <option value="ru">Русский</option>
                <option value="en">English</option>
              </select>
            </label>
            <fieldset>
              <legend>{t('theme')}</legend>
              <div className="theme-options">
                {(['light', 'dark', 'system'] as const).map((theme) => (
                  <label
                    className={`theme-choice ${prefs.theme === theme ? 'chosen' : ''}`}
                    key={theme}
                  >
                    <input
                      type="radio"
                      name="theme"
                      checked={prefs.theme === theme}
                      onChange={() => update('theme', theme)}
                    />
                    <span className={`theme-swatch ${theme}`}>
                      <i />
                    </span>
                    {t(theme)}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </Card>
        <Card title={t('preferences')}>
          <div className="settings-body">
            <label>
              {t('defaultHorizon')}
              <select
                value={prefs.defaultHorizon}
                onChange={(e) => update('defaultHorizon', Number(e.target.value) as 24 | 48)}
              >
                {[24, 48].map((n) => (
                  <option key={n} value={n}>
                    {t('hours', { n })}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('pageSize')}
              <select
                value={prefs.pageSize}
                onChange={(e) => update('pageSize', Number(e.target.value))}
              >
                {[10, 25, 50].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            {(['autoRun', 'toasts', 'remember'] as const).map((k) => (
              <label className="setting-switch" key={k}>
                <span>{t(k === 'toasts' ? 'toastSetting' : k)}</span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={prefs[k]}
                  onChange={(e) => update(k, e.target.checked)}
                />
              </label>
            ))}
          </div>
        </Card>
      </div>
      <Card title={t('accessibility')}>
        <div className="settings-body">
          {(['reduceMotion', 'largeText'] as const).map((k) => (
            <label className="setting-switch" key={k}>
              <span>{t(k === 'largeText' ? 'textSize' : k)}</span>
              <input
                type="checkbox"
                role="switch"
                checked={prefs[k]}
                onChange={(e) => update(k, e.target.checked)}
              />
            </label>
          ))}
          <div className="button-row">
            <button className="button secondary" onClick={onGuide}>
              {t('showGuide')}
            </button>
            <button
              className="button secondary"
              onClick={() => {
                setPrefs(defaults)
                notify('settingsReset')
              }}
            >
              {t('resetSettings')}
            </button>
            <button
              className="button secondary"
              onClick={() =>
                saveBlob(
                  new Blob(
                    [
                      JSON.stringify(
                        { format: 'samal-preferences', version: 1, preferences: prefs },
                        null,
                        2,
                      ),
                    ],
                    { type: 'application/json' },
                  ),
                  'samal-preferences.json',
                ).catch((e) => setError(e.message))
              }
            >
              {t('exportPrefs')}
            </button>
            <button className="button secondary" onClick={() => settingsFile.current?.click()}>
              {t('importPrefs')}
            </button>
            <input
              ref={settingsFile}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              type="file"
              accept=".json"
              onChange={(e) => void loadPrefs(e.target.files?.[0])}
            />
          </div>
        </div>
      </Card>
      <Card title={t('backup')} sub={t('backupDesc')}>
        <div className="settings-body">
          <div className="button-row">
            <button
              className="button primary"
              disabled={disabled || !!operation}
              onClick={() => void backup()}
            >
              <Download size={17} />
              {t('downloadBackup')}
            </button>
            {recovery && (
              <a className="button secondary" href="/api/backup/recovery">
                {t('recovery')}
              </a>
            )}
          </div>
          {demo && <p className="table-note">{t('demoReadOnly')}</p>}
          <div className="backup-input">
            <p>{t('backupFile')}</p>
            <button
              className="button secondary"
              disabled={demo || disabled || !!operation}
              onClick={() => archiveFile.current?.click()}
            >
              {t('choose')}
            </button>
            {archive && <span>{archive.name}</span>}
            <input
              ref={archiveFile}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              type="file"
              accept=".zip"
              disabled={demo || disabled || !!operation}
              onChange={(e) => {
                setArchive(e.target.files?.[0] || null)
                setBackupInfo(null)
                setError('')
              }}
            />
          </div>
          <button
            className="button secondary"
            disabled={demo || !archive || !!operation || disabled}
            onClick={() => void inspect()}
          >
            {t('inspectBackup')}
          </button>
          {operation && (
            <div className="loading" role="status">
              <LoaderCircle className="spin" size={22} />
              {t(operation)}
            </div>
          )}
          <ErrorNotice message={error} onClose={() => setError('')} />
          {backupInfo && (
            <div className="backup-preview">
              <h3>{created(backupInfo.created)}</h3>
              <p>
                {t('measurements')}: {num(backupInfo.observations)} ·{' '}
                {t('countFiles', { n: backupInfo.imports })} ·{' '}
                {t('countRuns', { n: backupInfo.runs })}
              </p>
              <div className="notice warning">{t('restoreWarning')}</div>
              <button
                className="button primary"
                disabled={disabled || !!operation}
                onClick={() => setConfirm(true)}
              >
                {t('restore')}
              </button>
            </div>
          )}
        </div>
      </Card>
      {confirm && (
        <Modal
          title={t('restore')}
          onClose={() => {
            if (!operation) setConfirm(false)
          }}
        >
          <p>{t('restoreWarning')}</p>
          <div className="button-row">
            <button
              className="button danger"
              disabled={!!operation}
              onClick={() => void inspect(true)}
            >
              {t(operation === 'restoring' ? 'restoring' : 'confirmRestore')}
            </button>
            <button
              className="button secondary"
              disabled={!!operation}
              onClick={() => setConfirm(false)}
            >
              {t('cancel')}
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
