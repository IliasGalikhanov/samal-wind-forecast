import { Activity, Download, Info } from 'lucide-react'
import { useI18n } from '../i18n'
import { Card, Empty, Pager, TurbineTabs } from '../ui'
import { PowerChart } from '../charts'
import { WeatherSummary } from '../weather'

import type { Workspace } from '../hooks/useWorkspace'
export function ForecastPage({ workspace }: { workspace: Workspace }) {
  const {
    data,
    forecastMode,
    setForecastMode,
    origin,
    setOrigin,
    horizon,
    setHorizon,
    running,
    busy,
    runForecast,
    selectedID,
    selected,
    setSelectedID,
    result,
    turbine,
    setTurbine,
    history,
    forecast,
    forecastPage,
    setForecastPage,
    current,
  } = workspace
  const { t, prefs, num, date, created, model } = useI18n()
  if (!data) return null
  const download = current && (
    <a className="button secondary" href={`/api/runs/${current.id}/export`}>
      <Download size={16} />
      {t('csv')}
    </a>
  )
  return (
    <>
      <Card>
        <div className="forecast-controls">
          <label>
            {t('forecastMode')}
            <select
              value={forecastMode}
              onChange={(e) => setForecastMode(e.target.value as 'live' | 'dataset')}
            >
              <option value="live">{t('modeLive')}</option>
              <option value="dataset">{t('modeHistorical')}</option>
            </select>
            <small>{t(forecastMode === 'live' ? 'liveModeHint' : 'historicalModeHint')}</small>
          </label>
          {forecastMode === 'dataset' && (
            <label>
              {t('origin')}
              <input
                type="datetime-local"
                step={3600}
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
              />
              <small>{t('historicalModeHint')}</small>
            </label>
          )}
          <fieldset>
            <legend>{t('horizon')}</legend>
            <div className="segments">
              {[24, 48].map((n) => (
                <button
                  key={n}
                  className={horizon === n ? 'selected' : ''}
                  aria-pressed={horizon === n}
                  onClick={() => setHorizon(n)}
                >
                  {t('hours', { n })}
                </button>
              ))}
            </div>
          </fieldset>
          <p>
            {t(
              data.demo
                ? 'syntheticSource'
                : data.weather_settings?.enabled
                  ? 'weatherForecastNote'
                  : 'seasonalHint',
            )}
          </p>
          {forecastMode === 'dataset' && data.weather_settings?.enabled && (
            <button
              className="button secondary"
              disabled={!!running || busy}
              onClick={() => void runForecast(undefined, 28)}
            >
              {t('replayRun')}
            </button>
          )}
        </div>
      </Card>

      {selectedID && (
        <div className="notice neutral">
          <span>{selected ? t('version', { date: created(selected.created) }) : t('loading')}</span>
          <button className="text-button" onClick={() => setSelectedID('')}>
            {t('latest')}
          </button>
        </div>
      )}
      {result ? (
        <>
          <Card
            title={t('hourly')}
            sub={`${t(result.mode === 'live' ? 'modeLive' : 'modeHistorical')} · ${date(result.origin, true)} · ${t('hours', { n: result.horizon })}`}
            action={<TurbineTabs turbines={data.turbines} value={turbine} onChange={setTurbine} />}
          >
            <PowerChart history={history} forecast={forecast} />
            <div className="legend">
              <span className="blue-dot">{t('actual')}</span>
              <span className="teal-dot">{t('predicted')}</span>
            </div>
          </Card>
          <div className="notice neutral">
            <Activity size={19} />
            {current?.evaluation?.matched
              ? t('evaluated', {
                  matched: current.evaluation.matched,
                  total: current.evaluation.total,
                  mae: num((current.evaluation.mae || 0) * 100, 2),
                  rmse: num((current.evaluation.rmse || 0) * 100, 2),
                })
              : t('factPending')}
          </div>
          {result?.weather && current && <WeatherSummary result={result} runID={current.id} />}
          {result.quality
            .filter(
              (q) =>
                q.age_hours > 0 ||
                result.warnings.some((w) => w.startsWith(`Турбина ${q.turbine_id}:`)),
            )
            .map((q) => (
              <div className="notice warning" key={q.turbine_id}>
                {result.weather
                  ? t('weatherStale', {
                      n: q.turbine_id,
                      model: model(
                        result.forecasts.find((f) => f.turbine_id === q.turbine_id)?.model || '',
                      ),
                    })
                  : t('staleTurbine', { n: q.turbine_id, date: date(q.last_complete_hour, true) })}
              </div>
            ))}
          <Card title={t('values')} action={download}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('dateHour')}</th>
                    {[...new Set(result.forecasts.map((f) => f.turbine_id))].map((id) => (
                      <th key={id}>
                        {data.turbines.find((x) => x.id === id)?.name || t('turbine', { n: id })}
                      </th>
                    ))}
                    <th>{t('source')}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...new Set(result.forecasts.map((f) => f.time))]
                    .slice(0, horizon)
                    .slice((forecastPage - 1) * prefs.pageSize, forecastPage * prefs.pageSize)
                    .map((time) => {
                      const rows = result.forecasts.filter((f) => f.time === time)
                      return (
                        <tr key={time}>
                          <td>{date(time, true)}</td>
                          {[...new Set(result.forecasts.map((f) => f.turbine_id))].map((id) => (
                            <td key={id}>
                              <PowerCell
                                value={rows.find((f) => f.turbine_id === id)?.prediction}
                              />
                            </td>
                          ))}
                          <td>{[...new Set(rows.map((f) => model(f.model)))].join(' / ')}</td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
            <Pager
              total={Math.min(horizon, result.horizon)}
              page={forecastPage}
              setPage={setForecastPage}
            />
          </Card>
          <div className="subtle-note">
            <Info size={16} />
            {t(
              data?.demo
                ? 'syntheticSource'
                : result?.weather || (!result && data?.weather_settings.enabled)
                  ? 'weatherForecastNote'
                  : 'weatherNote',
            )}{' '}
            {t('sourceTime')}
          </div>
        </>
      ) : (
        <Card>
          <Empty>{t('firstRun')}</Empty>
        </Card>
      )}
    </>
  )
}
function PowerCell({ value }: { value?: number }) {
  const { pct } = useI18n()
  return (
    <div className="power-cell">
      <span>{pct(value)}</span>
      <div>
        <i style={{ width: `${(value || 0) * 100}%` }} />
      </div>
    </div>
  )
}
