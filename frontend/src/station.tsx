import { useState } from 'react'
import { Plus, Save, Wind, MapPin, Pencil } from 'lucide-react'
import { api, post } from './types'
import type { Turbine } from './types'
import { useI18n } from './i18n'
import { Card, Empty, ErrorNotice, Pill } from './ui'

export function StationPanel({
  turbines,
  disabled,
  onSaved,
}: {
  turbines: Turbine[]
  disabled: boolean
  onSaved: () => Promise<unknown>
}) {
  const { t, num } = useI18n()
  const blank = { id: 0, name: '', latitude: '', longitude: '', sample_minutes: 10, rated_kw: '' }
  const [form, setForm] = useState(blank),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const locked = !!turbines.find((x) => x.id === form.id)?.rows
  const change = (key: 'name' | 'latitude' | 'longitude' | 'rated_kw', value: string) =>
    setForm({ ...form, [key]: value })
  function edit(x: Turbine) {
    setForm({
      id: x.id,
      name: x.name,
      latitude: String(x.latitude),
      longitude: String(x.longitude),
      sample_minutes: x.sample_minutes,
      rated_kw: x.rated_kw ? String(x.rated_kw) : '',
    })
    setError('')
    setOpen(true)
  }
  async function save() {
    setBusy(true)
    setError('')
    try {
      await api(
        '/turbines',
        post({
          ...form,
          latitude: Number(form.latitude),
          longitude: Number(form.longitude),
          rated_kw: Number(form.rated_kw),
        }),
      )
      await onSaved()
      setOpen(false)
      setForm(blank)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card
      title={t('stationSetup')}
      sub={t('stationSetupHint')}
      action={
        <button
          className="button secondary compact"
          disabled={disabled || busy}
          onClick={() => {
            setForm(blank)
            setOpen(true)
            setError('')
          }}
        >
          <Plus size={16} />
          {t('addTurbine')}
        </button>
      }
    >
      <div className="station-list">
        {turbines.map((x) => (
          <div className="station-row" key={x.id}>
            <span className="turbine-symbol">
              <Wind size={23} />
            </span>
            <div className="station-description">
              <b>{x.name}</b>
              <small>
                <MapPin size={13} />
                {num(x.latitude, 5)}°, {num(x.longitude, 5)}° ·{' '}
                {t('minutes', { n: x.sample_minutes })}
                {x.rated_kw ? ` · ${num(x.rated_kw)} kW` : ''}
              </small>
            </div>
            <Pill tone={x.rows ? 'teal' : 'neutral'}>
              {t(x.rows ? 'stationHasData' : 'stationNeedsData')}
            </Pill>
            <button
              className="icon-button"
              disabled={disabled || busy}
              aria-label={`${t('editTurbine')} · ${x.name}`}
              onClick={() => edit(x)}
            >
              <Pencil size={16} />
            </button>
          </div>
        ))}
      </div>
      {!turbines.length && !open && <Empty>{t('stationEmpty')}</Empty>}
      {open && (
        <form
          className="station-form"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <fieldset disabled={disabled || busy} className="station-fields">
            <legend>{t(form.id ? 'editTurbine' : 'addTurbine')}</legend>
            <label className="wide">
              {t('turbineName')}
              <input
                required
                maxLength={100}
                value={form.name}
                onChange={(e) => change('name', e.target.value)}
              />
            </label>
            <label>
              {t('latitude')}
              <input
                required
                type="number"
                min={-90}
                max={90}
                step="any"
                value={form.latitude}
                onChange={(e) => change('latitude', e.target.value)}
              />
            </label>
            <label>
              {t('longitude')}
              <input
                required
                type="number"
                min={-180}
                max={180}
                step="any"
                value={form.longitude}
                onChange={(e) => change('longitude', e.target.value)}
              />
            </label>
            <label>
              {t('sampleInterval')}
              <select
                disabled={locked}
                value={form.sample_minutes}
                onChange={(e) => setForm({ ...form, sample_minutes: Number(e.target.value) })}
              >
                {[5, 10, 15, 20, 30, 60].map((n) => (
                  <option key={n} value={n}>
                    {t('minutes', { n })}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('ratedPower')}
              <input
                disabled={locked}
                type="number"
                min={0}
                max={1000000}
                step="any"
                value={form.rated_kw}
                placeholder={t('optionalField')}
                onChange={(e) => change('rated_kw', e.target.value)}
              />
            </label>
            <p className="wide table-note">{t(locked ? 'stationLockedHint' : 'ratedPowerHint')}</p>
            <ErrorNotice message={error} />
            <div className="wide button-row">
              <button type="submit" className="button primary">
                <Save size={16} />
                {t(busy ? 'savingStation' : 'saveStation')}
              </button>
              <button type="button" className="button secondary" onClick={() => setOpen(false)}>
                {t('cancel')}
              </button>
            </div>
          </fieldset>
        </form>
      )}
    </Card>
  )
}
