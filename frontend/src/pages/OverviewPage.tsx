import { Wind, ArrowUpRight, Clock3, Info, Zap, Thermometer } from 'lucide-react'
import type { Turbine } from '../types'
import { useI18n } from '../i18n'
import { Card, Loading, Pill, Stat, TurbineTabs } from '../ui'
import { PowerChart, SeriesChart } from '../charts'

import type { Workspace } from '../hooks/useWorkspace'
export function OverviewPage({ workspace }: { workspace: Workspace }) {
  const {
    data,
    count,
    age,
    last,
    first,
    missing,
    coverage,
    result,
    forecast,
    horizon,
    setHorizon,
    turbine,
    setTurbine,
    historyLoading,
    history,
    detail,
    days,
    setDays,
    go,
  } = workspace
  const { t, num, pct, date, model } = useI18n()
  if (!data) return null
  return (
    <>
      {!count && !data.demo && (
        <Card title={t('setupWelcome')} sub={t('setupWelcomeHint')}>
          <div className="settings-body">
            <button className="button primary" onClick={() => go('settings')}>
              {t('stationSetup')}
            </button>
          </div>
        </Card>
      )}
      <div className="data-age">
        <div>
          <span className={`status-dot ${age > 2 ? 'stale' : ''}`} />
          <b>{t(age > 2 ? 'stale' : 'fresh')}</b>
          <span>
            {t('lastReading')}: {date(last, true)}
          </span>
        </div>
        <span>{t('age', { n: num(age) })}</span>
        <p>{t('ageNote')}</p>
      </div>
      <div className="stats-grid">
        <Stat
          label={t('turbines')}
          value={`${data.turbines.filter((x) => x.rows).length} / ${data.turbines.length}`}
          note={t('perTurbine')}
        />
        <Stat
          label={t('measurements')}
          value={num(count)}
          note={`${date(first)} — ${date(last)}`}
          tone="teal"
        />
        <Stat
          label={t('completeness')}
          value={pct(coverage)}
          note={t('missing', { n: num(missing) })}
        />
        <Stat
          label={t('testMAE')}
          value={
            result?.backtest.selected.mae != null
              ? `${num(result.backtest.selected.mae * 100, 1)} ${t('pp')}`
              : '—'
          }
          note={
            result
              ? `${date(result.backtest.start)} — ${date(result.backtest.end_exclusive)}`
              : t('afterRun')
          }
          tone="orange"
        />
      </div>
      <div className="dashboard-grid">
        <Card
          title={t('powerTime')}
          sub={t(forecast.length ? 'last24' : 'historyGaps')}
          action={
            <div className="segments">
              {[24, 48].map((n) => (
                <button
                  key={n}
                  aria-pressed={horizon === n}
                  className={horizon === n ? 'selected' : ''}
                  onClick={() => setHorizon(n)}
                >
                  {t('hours', { n })}
                </button>
              ))}
            </div>
          }
        >
          <div className="chart-tools">
            <TurbineTabs turbines={data.turbines} value={turbine} onChange={setTurbine} />
            <div className="legend">
              <span className="blue-dot">{t('actual')}</span>
              <span className="teal-dot">{t('predicted')}</span>
            </div>
          </div>
          {historyLoading ? <Loading /> : <PowerChart history={history} forecast={forecast} />}
          <div className="chart-footer">
            <Clock3 size={14} />
            <span>
              {t('lastReading')}: {date(detail?.last || '', true)}
            </span>
            <button className="text-button" onClick={() => go('forecast')}>
              {t('details')}
              <ArrowUpRight size={15} />
            </button>
          </div>
        </Card>
        <aside className="forecast-summary">
          <div className="summary-top">
            <Wind size={30} />
            <Pill tone="light">{t(forecast.length ? 'forecastReady' : 'history')}</Pill>
          </div>
          <h2>{t('nextHours', { n: forecast.length || horizon })}</h2>
          <p>
            {forecast.length
              ? `${date(forecast[0].time)} — ${date(forecast.at(-1)!.time)}`
              : t('firstRun')}
          </p>
          <div className="summary-value">
            {forecast.length
              ? pct(forecast.reduce((s, f) => s + f.prediction, 0) / forecast.length)
              : '—'}
            <span>{t('meanPower')}</span>
          </div>
          <div className="summary-detail">
            <span>{t('turbineLabel')}</span>
            <b>{detail?.name || '—'}</b>
          </div>
          <div className="summary-detail">
            <span>{t('model')}</span>
            <b>{forecast.length ? model(forecast[0].model) : '—'}</b>
          </div>
          <button className="button summary-button" onClick={() => go('forecast')}>
            {t('forecast')}
            <ArrowUpRight size={17} />
          </button>
          <div className="summary-note">
            <Info size={16} />
            <span>
              {t(
                data?.demo
                  ? 'syntheticSource'
                  : result?.weather || (!result && data?.weather_settings.enabled)
                    ? 'weatherForecastNote'
                    : 'weatherNote',
              )}
            </span>
          </div>
        </aside>
      </div>
      <div className="section-heading">
        <h2>{t('turbines')}</h2>
        <button className="text-button" onClick={() => go('import')}>
          {t('import')}
          <ArrowUpRight size={15} />
        </button>
      </div>
      <div className="turbine-grid">
        {data.turbines.map((x) => (
          <TurbineCard
            key={x.id}
            turbine={x}
            onOpen={() => {
              setTurbine(x.id)
              go('forecast')
            }}
          />
        ))}
      </div>
      <div className="subtle-note">
        <Info size={16} />
        {t('unitsNote')}
      </div>
      <Card
        title={t('history')}
        sub={t('historyGaps')}
        action={
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            aria-label={t('period')}
          >
            {[7, 30, 90].map((n) => (
              <option key={n} value={n}>
                {t('days', { n })}
              </option>
            ))}
          </select>
        }
      >
        {historyLoading ? (
          <Loading />
        ) : (
          <SeriesChart points={history.map((h) => ({ time: h.time, actual: h.power }))} area />
        )}
      </Card>
    </>
  )
}
function TurbineCard({ turbine: x, onOpen }: { turbine: Turbine; onOpen: () => void }) {
  const { t, pct, num, date } = useI18n()
  return (
    <Card className="turbine-card">
      <div className="turbine-card-top">
        <div className="turbine-identity">
          <span className="turbine-symbol">
            <Wind size={25} />
          </span>
          <div>
            <h3>{x.name}</h3>
            <small>
              {num(x.latitude, 4)}°, {num(x.longitude, 4)}°
            </small>
          </div>
        </div>
        <button
          className="icon-button"
          onClick={onOpen}
          aria-label={`${t('forecast')} · ${x.name}`}
        >
          <ArrowUpRight size={19} />
        </button>
      </div>
      <div className="turbine-readings">
        <div>
          <span>
            <Zap size={14} />
            {t('power')}
          </span>
          <b>{x.rows ? pct(x.power) : '—'}</b>
        </div>
        <div>
          <span>
            <Wind size={14} />
            {t('wind')}
          </span>
          <b>
            {x.rows ? num(x.wind, 1) : '—'}
            <small>{t('ms')}</small>
          </b>
        </div>
        <div>
          <span>
            <Thermometer size={14} />
            {t('temperature')}
          </span>
          <b>
            {x.rows ? num(x.temperature, 1) : '—'}
            <small>°C</small>
          </b>
        </div>
      </div>
      <div className="turbine-card-footer">
        <span>{date(x.last, true)}</span>
        <span>
          {num(x.rows)} · {t('rows')}
        </span>
      </div>
    </Card>
  )
}
