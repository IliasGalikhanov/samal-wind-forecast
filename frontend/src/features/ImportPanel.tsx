import { useEffect, useRef, useState } from 'react'
import { Upload, FileText, Info, CheckCheck, LoaderCircle } from 'lucide-react'
import { useI18n } from '../i18n'
import type { Key } from '../i18n'
import { api, uploadForm } from '../types'
import type { Imported, ImportPreview, Turbine } from '../types'
import { Card, ErrorNotice, Pill, Stat } from '../ui'

export function ImportPanel({
  disabled,
  demo,
  turbines,
  onDone,
}: {
  disabled: boolean
  demo: boolean
  turbines: Turbine[]
  onDone: (r: Imported) => Promise<void>
}) {
  const { t, prefs, num, pct, date } = useI18n(),
    [file, setFile] = useState<File | null>(null),
    [tid, setTid] = useState(turbines[0]?.id || 0),
    [auto, setAuto] = useState(prefs.autoRun),
    [phase, setPhase] = useState<'' | 'previewing' | 'importing'>(''),
    [progress, setProgress] = useState(0),
    [error, setError] = useState(''),
    [preview, setPreview] = useState<ImportPreview | null>(null),
    [receipt, setReceipt] = useState<Imported | null>(null),
    [drag, setDrag] = useState(false)
  const [columns, setColumns] = useState<string[]>([]),
    [options, setOptions] = useState({
      delimiter: ',',
      time: '',
      wind: '',
      power: '',
      temperature: '',
      power_unit: 'normalized',
    }),
    [reading, setReading] = useState(false)
  const locked = disabled || !!phase || !tid
  useEffect(() => {
    if (!turbines.some((x) => x.id === tid)) setTid(turbines[0]?.id || 0)
  }, [turbines, tid])
  useEffect(() => {
    setPreview(null)
  }, [options, tid])
  useEffect(() => {
    setColumns([])
    if (!file) return
    const controller = new AbortController(),
      body = new FormData()
    body.append('file', file)
    body.append('options', JSON.stringify({ delimiter: options.delimiter }))
    setReading(true)
    setError('')
    void api<{ columns: string[]; suggested: typeof options }>('/imports/columns', {
      method: 'POST',
      body,
      signal: controller.signal,
    })
      .then((r) => {
        setColumns(r.columns)
        setOptions((old) => ({
          ...old,
          time: r.suggested.time,
          wind: r.suggested.wind,
          power: r.suggested.power,
          temperature: r.suggested.temperature,
        }))
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setReading(false)
      })
    return () => controller.abort()
  }, [file, options.delimiter])
  const mapped =
    columns.length > 0 &&
    [options.time, options.wind, options.power, options.temperature].every(Boolean)
  const input = useRef<HTMLInputElement>(null)
  function choose(f?: File) {
    if (!f || locked) return
    setError('')
    setPreview(null)
    setReceipt(null)
    if (!f.name.toLowerCase().endsWith('.csv') || f.size > 50 * 1024 * 1024) {
      setError(t('fileError'))
      setFile(null)
      return
    }
    setFile(f)
  }
  async function send(commit: boolean) {
    if (!file || locked || !mapped) return
    setPhase(commit ? 'importing' : 'previewing')
    setProgress(0)
    setError('')
    const body = new FormData()
    body.append('file', file)
    body.append('options', JSON.stringify(options))
    body.append('turbine_id', String(tid))
    body.append('auto_run', String(auto))
    body.append('horizon', String(prefs.defaultHorizon))
    try {
      if (commit) {
        const result = await uploadForm<Imported>('/imports', body, setProgress)
        setReceipt(result)
        setPreview(null)
        setFile(null)
        if (input.current) input.current.value = ''
        await onDone(result)
      } else {
        setPreview(await uploadForm<ImportPreview>('/imports/preview', body, setProgress))
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPhase('')
    }
  }
  return (
    <>
      {demo && <div className="notice neutral">{t('demoReadOnly')}</div>}
      <div className="import-grid">
        <Card title={t('newMeasurements')} sub={t('csvHint')} className="upload-card">
          <div className="upload-options">
            <label>
              {t('turbineLabel')}
              <select
                value={tid}
                disabled={locked}
                onChange={(e) => {
                  setTid(Number(e.target.value))
                  setPreview(null)
                  setReceipt(null)
                }}
              >
                {!turbines.length && <option value={0}>{t('stationEmpty')}</option>}
                {turbines.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={auto}
                onChange={(e) => setAuto(e.target.checked)}
                disabled={locked}
              />
              {t('autoRun')}
            </label>
          </div>
          <input
            ref={input}
            id="csv-file"
            type="file"
            accept=".csv"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            disabled={locked}
            onChange={(e) => choose(e.target.files?.[0])}
          />
          <label
            htmlFor="csv-file"
            tabIndex={locked ? -1 : 0}
            role="button"
            aria-disabled={locked}
            onKeyDown={(e) => {
              if (!locked && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault()
                input.current?.click()
              }
            }}
            className={`dropzone ${drag ? 'dragging' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              if (!locked) setDrag(true)
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDrag(false)
              choose(e.dataTransfer.files[0])
            }}
          >
            <span className="drop-icon">
              {file ? <FileText size={30} /> : <Upload size={30} />}
            </span>
            <b>{file ? file.name : t('drop')}</b>
            <span>{file ? `${num(file.size / 1024 / 1024, 2)} MB` : t('choose')}</span>
          </label>
          <div className="csv-mapping">
            <label>
              {t('csvDelimiter')}
              <select
                disabled={locked}
                value={options.delimiter}
                onChange={(e) => setOptions({ ...options, delimiter: e.target.value })}
              >
                <option value=",">{t('delimiterComma')}</option>
                <option value=";">{t('delimiterSemicolon')}</option>
                <option value="\t">{t('delimiterTab')}</option>
              </select>
            </label>
            {file && (
              <>
                <p className="wide table-note">{t('mappingHint')}</p>
                {(['time', 'wind', 'power', 'temperature'] as const).map((key, i) => (
                  <label key={key}>
                    {t((['dateHour', 'wind', 'power', 'temperature'] as const)[i])}
                    <select
                      disabled={locked || reading}
                      value={options[key]}
                      onChange={(e) => setOptions({ ...options, [key]: e.target.value })}
                    >
                      <option value="">{t('chooseColumn')}</option>
                      {columns.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
                <label>
                  {t('powerUnits')}
                  <select
                    value={options.power_unit}
                    disabled={locked}
                    onChange={(e) => setOptions({ ...options, power_unit: e.target.value })}
                  >
                    <option value="normalized">0–1</option>
                    <option value="percent">0–100 %</option>
                    <option value="kw">kW</option>
                    <option value="mw">MW</option>
                  </select>
                </label>
                {reading && <span>{t('loading')}</span>}
              </>
            )}
          </div>
          <div className="upload-bottom">
            <small>
              <Info size={14} />
              {t('duplicatesHint')}
            </small>
            <button
              className="button primary"
              disabled={!file || locked || reading || !mapped}
              onClick={() => void send(false)}
            >
              {phase === 'previewing' ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <FileText size={16} />
              )}{' '}
              {t('preview')}
            </button>
          </div>
          {phase && (
            <div className="operation-progress" role="status">
              <span>
                {t(phase)} {progress < 100 ? `${progress}%` : ''}
              </span>
              <progress value={progress < 100 ? progress : undefined} max={100} />
            </div>
          )}
          <ErrorNotice
            message={error}
            onClose={() => setError('')}
            retry={file ? () => void send(false) : undefined}
          />
          {receipt && (
            <div className="notice success">
              <CheckCheck size={20} />
              <div>
                <b>{t('fileProcessed')}</b>
                <p>
                  {t('importResult', {
                    added: num(receipt.added),
                    duplicates: num(receipt.duplicates),
                  })}
                </p>
              </div>
            </div>
          )}
        </Card>
        <Card title={t('nextSteps')} className="import-guide">
          {(['checkFile', 'updateHistory', 'runModels'] as Key[]).map((key, i) => (
            <div className="guide-step" key={key}>
              <span>{i + 1}</span>
              <p>{t(key)}</p>
            </div>
          ))}
          <div className="guide-tip">
            <Info size={18} />
            {t('minimumHistory')}
          </div>
        </Card>
      </div>
      {preview && (
        <Card
          title={t('previewTitle')}
          sub={`${date(preview.first, true)} — ${date(preview.last, true)}`}
          action={
            <Pill tone={preview.conflicts ? 'amber' : 'teal'}>
              {t('rows')}: {num(preview.rows)}
            </Pill>
          }
        >
          <div className="preview-stats">
            <Stat label={t('new')} value={num(preview.added)} />
            <Stat label={t('duplicate')} value={num(preview.duplicates)} />
            <Stat
              label={t('conflict')}
              value={num(preview.conflicts)}
              tone={preview.conflicts ? 'orange' : 'teal'}
            />
          </div>
          <h3 className="inset-title">{t('firstRows')}</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('dateHour')}</th>
                  <th>{t('wind')}</th>
                  <th>{t('power')}</th>
                  <th>{t('temperature')}</th>
                  <th>{t('status')}</th>
                </tr>
              </thead>
              <tbody>
                {preview.samples.map((s, i) => (
                  <tr key={i}>
                    <td>{date(s.time, true)}</td>
                    <td>
                      {num(s.wind)} {t('ms')}
                    </td>
                    <td>{pct(s.power)}</td>
                    <td>{num(s.temperature)} °C</td>
                    <td>
                      <Pill tone={s.status === 'conflict' ? 'amber' : 'neutral'}>
                        {t(s.status)}
                      </Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="preview-footer">
            {preview.conflicts ? (
              <div className="notice warning">
                <div>
                  {t('conflictHint')}
                  <p>{preview.conflict_times.map((s) => date(s, true)).join(' · ')}</p>
                </div>
              </div>
            ) : (
              <p>{t('previewHint')}</p>
            )}
            <button
              className="button primary"
              disabled={disabled || !!phase || preview.conflicts > 0}
              onClick={() => void send(true)}
            >
              <Upload size={16} />
              {t('importAction')}
            </button>
          </div>
        </Card>
      )}
    </>
  )
}
