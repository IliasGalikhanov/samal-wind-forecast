import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Search,
  X,
  Wind,
} from 'lucide-react'
import { useI18n } from './i18n'
import type { Key } from './i18n'
import type { Turbine } from './types'

export function Card({
  title,
  sub,
  action,
  children,
  className = '',
}: {
  title?: string
  sub?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <div className="card-heading">
          <div>
            <h2>{title}</h2>
            {sub && <p>{sub}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}
export function Pill({ children, tone = 'blue' }: { children: ReactNode; tone?: string }) {
  return <span className={`pill ${tone}`}>{children}</span>
}
export function Loading() {
  const { t } = useI18n()
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={24} />
      <span>{t('loading')}</span>
    </div>
  )
}
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <Wind size={30} />
      <p>{children}</p>
    </div>
  )
}
export function ErrorNotice({
  message,
  onClose,
  retry,
}: {
  message: string
  onClose?: () => void
  retry?: () => void
}) {
  const { t, error } = useI18n()
  if (!message) return null
  const text = error(message)
  return (
    <div className="notice error" role="alert">
      <AlertTriangle size={19} />
      <div>
        <b>{text}</b>
        {text !== message && (
          <details>
            <summary>{t('diagnostic')}</summary>
            <code>{message}</code>
          </details>
        )}
        {retry && (
          <button className="text-button" onClick={retry}>
            {t('retry')}
          </button>
        )}
      </div>
      {onClose && (
        <button className="icon-button" onClick={onClose} aria-label={t('close')}>
          <X size={18} />
        </button>
      )}
    </div>
  )
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string
  children: ReactNode
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const { t } = useI18n()
  useEffect(() => {
    const previous = document.activeElement as HTMLElement
    ref.current?.showModal()
    return () => {
      ref.current?.close()
      previous?.focus()
    }
  }, [])
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === ref.current) {
          const rect = ref.current.getBoundingClientRect()
          if (
            e.clientX < rect.left ||
            e.clientX > rect.right ||
            e.clientY < rect.top ||
            e.clientY > rect.bottom
          )
            onClose()
        }
      }}
      aria-labelledby="dialog-title"
    >
      <div className="card-heading">
        <h2 id="dialog-title">{title}</h2>
        <button autoFocus className="icon-button" aria-label={t('close')} onClick={onClose}>
          <X size={21} />
        </button>
      </div>
      <div className="modal-content">{children}</div>
    </dialog>
  )
}
export function TurbineTabs({
  turbines,
  value,
  onChange,
}: {
  turbines: Turbine[]
  value: number
  onChange: (v: number) => void
}) {
  const { t } = useI18n()
  return (
    <div className="turbine-tabs" aria-label={t('turbineLabel')}>
      {turbines.map((x) => (
        <button
          key={x.id}
          aria-pressed={value === x.id}
          className={value === x.id ? 'active' : ''}
          onClick={() => onChange(x.id)}
        >
          <Wind size={15} />
          {x.name}
        </button>
      ))}
    </div>
  )
}
export function Stat({
  label,
  value,
  note,
  tone = 'blue',
}: {
  label: string
  value: string
  note?: string
  tone?: string
}) {
  return (
    <div className={`stat-card ${tone}`}>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {note && <small>{note}</small>}
    </div>
  )
}
export function Pager({
  total,
  page,
  setPage,
}: {
  total: number
  page: number
  setPage: (p: number) => void
}) {
  const { t, prefs } = useI18n(),
    pages = Math.max(1, Math.ceil(total / prefs.pageSize))
  return (
    <div className="pager">
      <span>{t('page', { page, pages, total })}</span>
      <div>
        <button
          className="icon-button"
          disabled={page <= 1}
          aria-label={t('prev')}
          onClick={() => setPage(page - 1)}
        >
          <ChevronLeft size={18} />
        </button>
        <button
          className="icon-button"
          disabled={page >= pages}
          aria-label={t('next')}
          onClick={() => setPage(page + 1)}
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  )
}
export function useList<T>(
  items: T[],
  text: (x: T) => string,
  stamp: (x: T) => string,
  filter: (x: T, value: string) => boolean,
  sortValue?: (x: T) => number,
) {
  const { prefs } = useI18n()
  const [query, setQuery] = useState(''),
    [kind, setKind] = useState('all'),
    [sort, setSort] = useState('newest'),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [requestedPage, setPage] = useState(1)
  const localDay = (x: T) => {
    const d = new Date(stamp(x))
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const filtered = items
    .filter(
      (x) =>
        (!query || text(x).toLocaleLowerCase().includes(query.toLocaleLowerCase())) &&
        filter(x, kind) &&
        (!from || localDay(x) >= from) &&
        (!to || localDay(x) <= to),
    )
    .sort((a, b) =>
      sort === 'mostAdded' && sortValue
        ? sortValue(b) - sortValue(a)
        : sort === 'oldest'
          ? stamp(a).localeCompare(stamp(b))
          : stamp(b).localeCompare(stamp(a)),
    )
  const page = Math.max(1, Math.min(requestedPage, Math.ceil(filtered.length / prefs.pageSize)))
  useEffect(() => setPage(1), [query, kind, sort, from, to, prefs.pageSize])
  return {
    query,
    setQuery,
    kind,
    setKind,
    sort,
    setSort,
    from,
    setFrom,
    to,
    setTo,
    page,
    setPage,
    total: filtered.length,
    visible: filtered.slice((page - 1) * prefs.pageSize, page * prefs.pageSize),
    reset: () => {
      setQuery('')
      setKind('all')
      setSort('newest')
      setFrom('')
      setTo('')
    },
  }
}
type FilterState = {
  query: string
  setQuery: (v: string) => void
  kind: string
  setKind: (v: string) => void
  sort: string
  setSort: (v: string) => void
  from: string
  setFrom: (v: string) => void
  to: string
  setTo: (v: string) => void
  reset: () => void
}
export function Filters({
  state: s,
  options,
  extraSort = false,
  dates = true,
}: {
  state: FilterState
  options: { value: string; label: string }[]
  extraSort?: boolean
  dates?: boolean
}) {
  const { t } = useI18n()
  return (
    <div className="filters">
      <label className="search-box">
        <Search size={16} />
        <input
          aria-label={t('search')}
          placeholder={t('search')}
          value={s.query}
          onChange={(e) => s.setQuery(e.target.value)}
        />
      </label>
      <select aria-label={t('status')} value={s.kind} onChange={(e) => s.setKind(e.target.value)}>
        <option value="all">{t('all')}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select aria-label={t('sort')} value={s.sort} onChange={(e) => s.setSort(e.target.value)}>
        {(['newest', 'oldest', ...(extraSort ? ['mostAdded'] : [])] as Key[]).map((k) => (
          <option key={k} value={k}>
            {t(k)}
          </option>
        ))}
      </select>
      {dates && (
        <>
          <label className="date-filter">
            {t('from')}
            <input type="date" value={s.from} onChange={(e) => s.setFrom(e.target.value)} />
          </label>
          <label className="date-filter">
            {t('to')}
            <input type="date" value={s.to} onChange={(e) => s.setTo(e.target.value)} />
          </label>
        </>
      )}
      <button
        className="icon-button"
        aria-label={t('resetFilters')}
        title={t('resetFilters')}
        onClick={s.reset}
      >
        <X size={17} />
      </button>
    </div>
  )
}
