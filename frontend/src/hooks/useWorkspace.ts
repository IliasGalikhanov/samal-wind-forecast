import { useCallback, useEffect, useRef, useState } from 'react'
import { api, post } from '../types'
import type { Hour, Imported, Overview, Run } from '../types'
import { useI18n, useStored, readLocal, writeLocal } from '../i18n'
import { retryRun } from '../panels'

import { views } from '../navigation'
import type { View } from '../navigation'
import { useNotifications } from './useNotifications'
type UIState = { view: View; turbine: number; days: number; horizon: number; selectedID: string }
export function useWorkspace() {
  const { t, prefs } = useI18n()
  const [initial] = useState<UIState>(() => {
    const saved = readLocal<Partial<UIState>>('samal.workspace', {})
    return {
      view: prefs.remember && views.includes(saved.view || '') ? saved.view! : 'overview',
      turbine:
        prefs.remember && Number.isInteger(saved.turbine) && saved.turbine! > 0
          ? saved.turbine!
          : 0,
      days: prefs.remember && [7, 30, 90].includes(saved.days || 0) ? saved.days! : 7,
      horizon:
        prefs.remember && [24, 48].includes(saved.horizon || 0)
          ? saved.horizon!
          : prefs.defaultHorizon,
      selectedID: prefs.remember && typeof saved.selectedID === 'string' ? saved.selectedID : '',
    }
  })
  const [view, setView] = useState<View>(initial.view),
    [turbine, setTurbine] = useState(initial.turbine),
    [days, setDays] = useState(initial.days),
    [horizon, setHorizon] = useState(initial.horizon),
    [selectedID, setSelectedID] = useState(initial.selectedID)
  const [data, setData] = useState<Overview | null>(null),
    [imports, setImports] = useState<Imported[]>([]),
    [history, setHistory] = useState<Hour[]>([]),
    [historyLoading, setHistoryLoading] = useState(false),
    [selected, setSelected] = useState<Run | null>(null),
    [forecastMode, setForecastMode] = useState<'live' | 'dataset'>('live'),
    [origin, setOrigin] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [cancelling, setCancelling] = useState(''),
    [modal, setModal] = useState<'help' | 'welcome' | null>(null),
    [mobile, setMobile] = useState(false),
    [forecastPage, setForecastPage] = useState(1),
    [revision, setRevision] = useState(0)
  const [onboarded, setOnboarded] = useStored('samal.onboarded', false)
  const { notifications, setNotifications, toast, setToast, notify } = useNotifications()
  const known = useRef<Record<string, string>>(readLocal('samal.run-statuses', {})),
    priorDefault = useRef(prefs.defaultHorizon),
    sidebar = useRef<HTMLElement>(null),
    menuButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (data && !data.turbines.some((x) => x.id === turbine)) setTurbine(data.turbines[0]?.id || 0)
  }, [data, turbine])
  const refresh = useCallback(async () => {
    const [overview, uploads] = await Promise.all([
      api<Overview>('/overview'),
      api<Imported[]>('/imports'),
    ])
    setData(overview)
    setImports(uploads)
    return overview
  }, [])
  useEffect(() => {
    void refresh().catch((e) => setError(e.message))
  }, [refresh])
  useEffect(() => {
    if (!onboarded) setModal('welcome')
  }, [onboarded])
  useEffect(() => {
    if (prefs.remember) writeLocal('samal.workspace', { view, turbine, days, horizon, selectedID })
    else writeLocal('samal.workspace', {})
  }, [view, turbine, days, horizon, selectedID, prefs.remember])
  useEffect(() => {
    if (priorDefault.current !== prefs.defaultHorizon) {
      setHorizon(prefs.defaultHorizon)
      priorDefault.current = prefs.defaultHorizon
    }
  }, [prefs.defaultHorizon])
  useEffect(() => {
    document.title = `${t(view)} · SAMAL`
  }, [view, prefs.language])
  useEffect(() => {
    setForecastPage(1)
  }, [horizon, selectedID, prefs.pageSize, data?.latest_run?.id])
  const running = data?.runs.find((r) => r.status === 'running')
  useEffect(() => {
    let disposed = false,
      inFlight = false
    const poll = setInterval(
      () => {
        if (inFlight) return
        inFlight = true
        void refresh()
          .catch((e) => {
            if (!disposed) setError(e.message)
          })
          .finally(() => {
            inFlight = false
          })
      },
      running ? 2000 : 15000,
    )
    return () => {
      disposed = true
      clearInterval(poll)
    }
  }, [running?.id, refresh])
  useEffect(() => {
    if (!data) return
    for (const r of data.runs) {
      const previous = known.current[r.id]
      if (previous && previous !== r.status && r.status !== 'running') {
        notify(
          r.status === 'completed'
            ? 'runReady'
            : r.status === 'cancelled'
              ? 'cancelledStage'
              : 'runFailed',
          undefined,
          r.id,
          r.error || undefined,
          `run-${r.id}-${r.status}`,
        )
        if (r.status === 'completed') setSelectedID('')
        if (cancelling === r.id) setCancelling('')
      }
      known.current[r.id] = r.status
    }
    writeLocal('samal.run-statuses', known.current)
  }, [data, notify, cancelling])
  useEffect(() => {
    if (!data?.turbines.some((x) => x.id === turbine)) {
      setHistory([])
      setHistoryLoading(false)
      return
    }
    const controller = new AbortController()
    setHistory([])
    setHistoryLoading(true)
    void api<Hour[]>(`/history?turbine=${turbine}&days=${days}`, { signal: controller.signal })
      .then(setHistory)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setHistoryLoading(false)
      })
    return () => controller.abort()
  }, [
    turbine,
    days,
    revision,
    data?.turbines.map((t) => `${t.rows}:${t.last}:${t.power}`).join(','),
  ])
  useEffect(() => {
    setSelected(null)
    if (!selectedID) return
    const controller = new AbortController()
    void api<Run>(`/runs/${selectedID}`, { signal: controller.signal })
      .then(setSelected)
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(e.message)
          setSelectedID('')
        }
      })
    return () => controller.abort()
  }, [selectedID, revision])
  useEffect(() => {
    if (!mobile) return
    sidebar.current?.querySelector<HTMLElement>('a,button')?.focus()
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobile(false)
      if (e.key === 'Tab') {
        const nodes = sidebar.current?.querySelectorAll<HTMLElement>('a,button')
        if (!nodes?.length) return
        const first = nodes[0],
          last = nodes[nodes.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', handle)
    return () => {
      document.removeEventListener('keydown', handle)
      menuButton.current?.focus()
    }
  }, [mobile])
  const go = (next: View) => {
    setView(next)
    setMobile(false)
    setError('')
    window.scrollTo({ top: 0, behavior: 'auto' })
  }
  const closeModal = () => {
    if (modal === 'welcome') setOnboarded(true)
    setModal(null)
  }
  const current = selectedID ? selected : data?.latest_run,
    result = current?.result,
    detail = data?.turbines.find((t) => t.id === turbine),
    count = data?.turbines.reduce((s, t) => s + t.rows, 0) || 0,
    missing = data?.turbines.reduce((s, t) => s + t.missing, 0) || 0,
    coverage = count ? count / (count + missing) : 0
  const last =
      data?.turbines
        .map((t) => t.last)
        .filter(Boolean)
        .sort()
        .at(-1) || '',
    first =
      data?.turbines
        .map((t) => t.first)
        .filter(Boolean)
        .sort()[0] || '',
    forecast = result?.forecasts.filter((f) => f.turbine_id === turbine).slice(0, horizon) || [],
    unread = notifications.filter((n) => !n.read).length
  const age = last
    ? Math.max(0, Math.floor((Date.now() - Date.parse(last.replace(' ', 'T') + 'Z')) / 86400000))
    : 0
  async function runForecast(retry?: Run, replayDays = 1) {
    setBusy(true)
    setError('')
    try {
      const r = retry
        ? await retryRun(retry)
        : await api<Run>(
            '/runs',
            post({
              horizon,
              mode: view === 'forecast' ? forecastMode : 'live',
              origin:
                view === 'forecast' && forecastMode === 'dataset' ? origin || undefined : undefined,
              replay_days: replayDays,
            }),
          )
      known.current[r.id] = 'running'
      setSelectedID('')
      await refresh()
      notify('started', undefined, r.id)
    } catch (e) {
      setError((e as Error).message)
      notify('errorTitle', undefined, undefined, (e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function cancelRun(r: Run) {
    setCancelling(r.id)
    try {
      await api(`/runs/${r.id}/cancel`, post({}))
      await refresh()
    } catch (e) {
      setError((e as Error).message)
      setCancelling('')
    }
  }
  function openRun(r: Run) {
    if (r.status === 'failed' || r.status === 'cancelled') {
      void runForecast(r)
      return
    }
    setSelectedID(r.id)
    go('forecast')
  }
  return {
    view,
    setView,
    turbine,
    setTurbine,
    days,
    setDays,
    horizon,
    setHorizon,
    selectedID,
    setSelectedID,
    data,
    imports,
    history,
    setHistory,
    historyLoading,
    selected,
    forecastMode,
    setForecastMode,
    origin,
    setOrigin,
    busy,
    error,
    setError,
    cancelling,
    modal,
    setModal,
    mobile,
    setMobile,
    forecastPage,
    setForecastPage,
    setRevision,
    notifications,
    setNotifications,
    toast,
    setToast,
    known,
    sidebar,
    menuButton,
    notify,
    refresh,
    running,
    go,
    closeModal,
    current,
    result,
    detail,
    count,
    missing,
    coverage,
    last,
    first,
    forecast,
    unread,
    age,
    runForecast,
    cancelRun,
    openRun,
  }
}
export type Workspace = ReturnType<typeof useWorkspace>
