import { CheckCheck, LoaderCircle, ArrowUpRight } from 'lucide-react'
import { useI18n } from '../i18n'
import type { Key } from '../i18n'
import type { Run } from '../types'
import { Card, Empty, Filters, Pager, Pill, useList } from '../ui'

export function RunHistory({
  runs,
  onOpen,
  onCancel,
  cancelling,
}: {
  runs: Run[]
  onOpen: (r: Run) => void
  onCancel: (r: Run) => void
  cancelling: string
}) {
  const { t, date, created, event, error } = useI18n()
  const list = useList(
    runs,
    (r) =>
      `${r.id} ${t(r.status)} ${r.origin} ${t(r.trigger !== 'manual' ? 'automatic' : 'manual')}`,
    (r) => r.created,
    (r, k) => k === 'all' || r.status === k,
  )
  return (
    <Card
      title={t('runHistory')}
      action={<Pill tone="neutral">{t('countRuns', { n: runs.length })}</Pill>}
    >
      <Filters
        state={list}
        options={['running', 'completed', 'failed', 'cancelled'].map((k) => ({
          value: k,
          label: t(k as Key),
        }))}
      />
      {list.visible.map((r) => (
        <div className="run-card" key={r.id}>
          <div className="run-row">
            <span className={`run-icon ${r.status}`}>
              {r.status === 'running' ? (
                <LoaderCircle className="spin" size={20} />
              ) : (
                <CheckCheck size={20} />
              )}
            </span>
            <div className="run-main">
              <h3>
                {t('run')} · {created(r.created)}
              </h3>
              <span>
                {t(r.trigger !== 'manual' ? 'automatic' : 'manual')} ·{' '}
                {t('hours', { n: r.horizon })} · {date(r.origin, true)}
              </span>
            </div>
            <Pill
              tone={r.status === 'completed' ? 'teal' : r.status === 'failed' ? 'amber' : 'neutral'}
            >
              {t(r.status)}
            </Pill>
            {r.status === 'completed' && (
              <button className="button secondary compact" onClick={() => onOpen(r)}>
                {t('open')}
                <ArrowUpRight size={14} />
              </button>
            )}
            {r.status === 'running' && (
              <button
                className="button secondary compact"
                onClick={() => onCancel(r)}
                disabled={cancelling === r.id}
              >
                {t(cancelling === r.id ? 'cancelling' : 'cancel')}
              </button>
            )}
            {(r.status === 'failed' || r.status === 'cancelled') && (
              <button className="button secondary compact" onClick={() => onOpen(r)}>
                {t('retry')}
              </button>
            )}
          </div>
          <details className="run-details">
            <summary>
              {t('stages')} · {event(r.step)}
            </summary>
            <ol>
              {r.events?.map((e, i) => (
                <li key={i}>
                  <time>{created(e.at)}</time>
                  <span>{event(e.message)}</span>
                </li>
              ))}
            </ol>
            {r.error && (
              <div className="notice error">
                <div>
                  {error(r.error)}
                  <details>
                    <summary>{t('diagnostic')}</summary>
                    <code>{r.error}</code>
                  </details>
                </div>
              </div>
            )}
            <small>ID: {r.id}</small>
          </details>
        </div>
      ))}
      {!list.total && <Empty>{t('noMatches')}</Empty>}
      <Pager total={list.total} page={list.page} setPage={list.setPage} />
    </Card>
  )
}
