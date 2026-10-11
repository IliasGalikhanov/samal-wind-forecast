import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { useI18n } from '../i18n'
import type { Key } from '../i18n'
import { api, saveBlob } from '../types'
import type { Run, Turbine } from '../types'
import { Card, Empty, ErrorNotice, Loading, Pager, Stat, TurbineTabs } from '../ui'
import { SeriesChart } from '../charts'

export function Compare({
  runs,
  turbines,
  turbine,
  setTurbine,
}: {
  runs: Run[]
  turbines: Turbine[]
  turbine: number
  setTurbine: (n: number) => void
}) {
  const { t, prefs, date, created, pct, num } = useI18n(),
    completed = runs.filter((r) => r.status === 'completed'),
    [a, setA] = useState(''),
    [b, setB] = useState(''),
    [pair, setPair] = useState<Run[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false),
    [page, setPage] = useState(1)
  useEffect(() => {
    if (!a && completed.length) setA(completed[Math.min(1, completed.length - 1)].id)
    if (!b && completed.length) setB(completed[0].id)
  }, [runs, a, b])
  useEffect(() => {
    setPage(1)
    if (!a || !b || a === b) {
      setPair([])
      return
    }
    const controller = new AbortController()
    setPair([])
    setLoading(true)
    setError('')
    void Promise.all([
      api<Run>(`/runs/${a}`, { signal: controller.signal }),
      api<Run>(`/runs/${b}`, { signal: controller.signal }),
    ])
      .then(setPair)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [a, b])
  useEffect(() => setPage(1), [turbine, prefs.pageSize])
  const af = pair[0]?.result?.forecasts.filter((f) => f.turbine_id === turbine) || [],
    bf = new Map(
      pair[1]?.result?.forecasts
        .filter((f) => f.turbine_id === turbine)
        .map((f) => [f.time, f.prediction]) || [],
    ),
    points = af
      .filter((f) => bf.has(f.time))
      .map((f) => ({ time: f.time, a: f.prediction, b: bf.get(f.time)! }))
  const mean = points.length
    ? points.reduce((s, p) => s + Math.abs(p.b - p.a), 0) / points.length
    : 0
  const download = () => {
    const csv = [
      'time,turbine_id,run_a,run_b,power_a,power_b,difference_b_minus_a',
      ...points.map((p) => [p.time, turbine, a, b, p.a, p.b, p.b - p.a].join(',')),
    ].join('\r\n')
    saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'samal-comparison.csv').catch(
      (e) => setError(e.message),
    )
  }
  return (
    <>
      <Card>
        <div className="comparison-controls">
          {[
            { label: 'compareA' as Key, value: a, set: setA },
            { label: 'compareB' as Key, value: b, set: setB },
          ].map((c) => (
            <label key={c.label}>
              {t(c.label)}
              <select value={c.value} onChange={(e) => c.set(e.target.value)}>
                <option value="">{t('chooseRun')}</option>
                {completed.map((r) => (
                  <option key={r.id} value={r.id}>
                    {created(r.created)} · {t('hours', { n: r.horizon })} · {r.id.slice(-5)}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <TurbineTabs turbines={turbines} value={turbine} onChange={setTurbine} />
        </div>
      </Card>
      <ErrorNotice message={error} />
      {loading ? (
        <Loading />
      ) : completed.length < 2 ? (
        <Card>
          <Empty>{t('compareNeed')}</Empty>
        </Card>
      ) : a === b ? (
        <Card>
          <Empty>{t('sameRun')}</Empty>
        </Card>
      ) : !points.length ? (
        <Card>
          <Empty>{t('noOverlap')}</Empty>
        </Card>
      ) : (
        <>
          <div className="stats-grid two">
            <Stat label={t('overlap')} value={num(points.length)} />
            <Stat
              label={t('meanDifference')}
              value={`${num(mean * 100, 2)} ${t('pp')}`}
              tone="teal"
            />
          </div>
          <Card
            title={t('compare')}
            sub={t('compareNote')}
            action={
              <button className="button secondary" onClick={download}>
                <Download size={16} />
                {t('csv')}
              </button>
            }
          >
            <SeriesChart points={points} comparison />
            <div className="legend">
              <span className="blue-dot">A · {created(pair[0].created)}</span>
              <span className="teal-dot">B · {created(pair[1].created)}</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('dateHour')}</th>
                    <th>A</th>
                    <th>B</th>
                    <th>{t('difference')}</th>
                  </tr>
                </thead>
                <tbody>
                  {points.slice((page - 1) * prefs.pageSize, page * prefs.pageSize).map((p) => (
                    <tr key={p.time}>
                      <td>{date(p.time, true)}</td>
                      <td>{pct(p.a)}</td>
                      <td>{pct(p.b)}</td>
                      <td>
                        {num((p.b - p.a) * 100, 2)} {t('pp')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager total={points.length} page={page} setPage={setPage} />
          </Card>
        </>
      )}
    </>
  )
}
