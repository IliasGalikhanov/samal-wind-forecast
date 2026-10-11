import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts'
import { useI18n } from './i18n'
import type { Forecast, Hour, Result, Turbine } from './types'
import { Card, Empty, Pill, Stat, TurbineTabs } from './ui'
import type { ReactNode } from 'react'

export type Point = {
  time: string
  actual?: number | null
  prediction?: number | null
  a?: number
  b?: number
}
function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: readonly {
    name?: string
    value?: number | string
    dataKey?: string | number
    color?: string
  }[]
  label?: ReactNode
}) {
  const { date, pct } = useI18n()
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tooltip">
      <strong>{typeof label === 'string' ? date(label, true) : label}</strong>
      {payload
        .filter((p) => p.value != null)
        .map((p) => (
          <div key={p.dataKey}>
            <i style={{ background: p.color }} />
            {p.name}
            <b>{pct(Number(p.value))}</b>
          </div>
        ))}
    </div>
  )
}
export function SeriesChart({
  points,
  origin,
  comparison = false,
  area = false,
}: {
  points: Point[]
  origin?: string
  comparison?: boolean
  area?: boolean
}) {
  const { t, date, pct } = useI18n()
  if (!points.length) return <Empty>{t('noData')}</Empty>
  const lines = comparison
    ? [
        { key: 'a', name: 'A', color: 'var(--chart-blue)' },
        { key: 'b', name: 'B', color: 'var(--chart-teal)' },
      ]
    : [
        { key: 'actual', name: t('actual'), color: 'var(--chart-blue)' },
        { key: 'prediction', name: t('predicted'), color: 'var(--chart-teal)' },
      ]
  const Chart = area ? AreaChart : LineChart
  return (
    <div className="power-chart" role="img" aria-label={comparison ? t('compare') : t('powerTime')}>
      <ResponsiveContainer width="100%" height="100%">
        <Chart data={points} margin={{ top: 18, right: 20, left: 0, bottom: 8 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="4 4" />
          <XAxis
            dataKey="time"
            tickFormatter={(s) => date(s, true, true)}
            minTickGap={70}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: 'var(--muted)' }}
          />
          <YAxis
            domain={[0, 1]}
            ticks={[0, 0.25, 0.5, 0.75, 1]}
            tickFormatter={(s) => pct(s, 0)}
            width={53}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: 'var(--muted)' }}
          />
          <Tooltip content={<ChartTooltip />} />
          {origin && (
            <ReferenceLine
              x={origin}
              stroke="var(--muted)"
              strokeDasharray="4 4"
              label={{
                value: t('predicted'),
                fill: 'var(--muted)',
                fontSize: 11,
                position: 'insideTopRight',
              }}
            />
          )}
          {lines.map((l) =>
            area ? (
              <Area
                key={l.key}
                dataKey={l.key}
                name={l.name}
                stroke={l.color}
                strokeWidth={2}
                fill={l.color}
                fillOpacity={0.07}
                isAnimationActive={false}
              />
            ) : (
              <Line
                key={l.key}
                dataKey={l.key}
                name={l.name}
                stroke={l.color}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            ),
          )}
        </Chart>
      </ResponsiveContainer>
    </div>
  )
}
export function PowerChart({ history, forecast }: { history: Hour[]; forecast: Forecast[] }) {
  const origin = forecast[0]?.time
  const cutoff = origin
    ? new Date(Date.parse(origin.replace(' ', 'T') + 'Z') - 24 * 3600_000)
        .toISOString()
        .slice(0, 19)
        .replace('T', ' ')
    : ''
  const prior = origin
    ? history.filter((h) => h.time < origin && h.time >= cutoff)
    : history.slice(-72)
  return (
    <SeriesChart
      points={[
        ...prior.map((h) => ({ time: h.time, actual: h.power })),
        ...forecast.map((f) => ({ time: f.time, prediction: f.prediction })),
      ]}
      origin={origin}
      area
    />
  )
}
export function Quality({
  result: r,
  turbine,
  setTurbine,
  turbines,
}: {
  result: Result
  turbine: number
  setTurbine: (n: number) => void
  turbines: Turbine[]
}) {
  const { t, date, num, model } = useI18n(),
    m = r.backtest.selected
  return (
    <>
      <div className="validation-timeline">
        <div>
          <b>{t(r.validation.folds ? 'rollingTraining' : 'training')}</b>
          <small>{t('trainUntil', { date: date(r.training.cutoff) })}</small>
        </div>
        <div>
          <b>{t('validation')}</b>
          <small>
            {date(r.validation.start)} — {date(r.validation.end_exclusive)}
          </small>
        </div>
        <div>
          <b>{t('test')}</b>
          <small>
            {date(r.backtest.start)} — {date(r.backtest.end_exclusive)}
          </small>
        </div>
      </div>
      {r.validation.folds && (
        <Card title={t('rollingValidation')} sub={t('rollingNote')}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('period')}</th>
                  {Object.keys(r.validation.models).map((key) => (
                    <th key={key}>
                      {model(key)} · MAE, {t('pp')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.validation.folds.map((f) => (
                  <tr key={f.start}>
                    <td>
                      {date(f.start)} — {date(f.end_exclusive)}
                    </td>
                    {Object.keys(r.validation.models).map((key) => (
                      <td key={key}>
                        {f.models[key].mae == null ? '—' : num(f.models[key].mae! * 100, 2)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {r.backtest.start.startsWith('2026-01-18') &&
            r.backtest.end_exclusive.startsWith('2026-02-01') && (
              <p className="table-note">{t('auditReuse')}</p>
            )}
        </Card>
      )}
      <div className="stats-grid three">
        <Stat
          label={t('mae')}
          value={m.mae == null ? '—' : `${num(m.mae * 100, 2)} ${t('pp')}`}
          note={t('lowerBetter')}
        />
        <Stat
          label={t('rmse')}
          value={m.rmse == null ? '—' : `${num(m.rmse * 100, 2)} ${t('pp')}`}
          note={t('lowerBetter')}
          tone="teal"
        />
        <Stat label={t('checked')} value={num(m.n)} note={t('targetPairs')} />
      </div>
      <Card
        title={t('actualVsForecast')}
        sub={t('first24')}
        action={<TurbineTabs turbines={turbines} value={turbine} onChange={setTurbine} />}
      >
        <SeriesChart points={r.backtest.points.filter((p) => p.turbine_id === turbine)} />
        <div className="legend">
          <span className="blue-dot">{t('actual')}</span>
          <span className="teal-dot">{t('predicted')}</span>
        </div>
      </Card>
      <div className="quality-grid">
        <Card title={t('models')}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('model')}</th>
                  <th>{t('validationMAE')}</th>
                  <th>{t('testMAE')}</th>
                  <th>{t('testRMSE')}</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(r.backtest.models).map(([key, v]) => (
                  <tr key={key}>
                    <td>
                      {model(key)} {key === r.selected_model && <Pill>{t('selected')}</Pill>}
                    </td>
                    <td>
                      {r.validation.models[key].mae == null
                        ? '—'
                        : num(r.validation.models[key].mae! * 100, 2)}
                    </td>
                    <td>{v.mae == null ? '—' : num(v.mae * 100, 2)}</td>
                    <td>{v.rmse == null ? '—' : num(v.rmse * 100, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="table-note">{t('modelNote')}</p>
        </Card>
        <Card title={t('breakdown')}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('turbineLabel')}</th>
                  <th>{t('horizon')}</th>
                  <th>MAE, {t('pp')}</th>
                </tr>
              </thead>
              <tbody>
                {r.backtest.breakdown.map((b) => (
                  <tr key={`${b.turbine_id}-${b.horizon}`}>
                    <td>{t('turbine', { n: b.turbine_id })}</td>
                    <td>{b.horizon}</td>
                    <td>{b.mae == null ? '—' : num(b.mae * 100, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      <div className="notice neutral">{t('limitations')}</div>
    </>
  )
}
