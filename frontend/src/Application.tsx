import {
  Wind,
  Upload,
  Bell,
  ChevronRight,
  Download,
  Play,
  ArrowUpRight,
  Database,
  Info,
  X,
  Check,
  LoaderCircle,
  Menu,
  Zap,
  CircleHelp,
  Sun,
  Moon,
} from 'lucide-react'
import { useI18n } from './i18n'
import type { Key } from './i18n'
import { Card, Empty, ErrorNotice, Loading, Modal, Pill } from './ui'
import { Quality } from './charts'
import { Compare, ImportHistory, ImportPanel, RunHistory, Settings } from './panels'
import { StationPanel } from './station'
import { WeatherSettingsPanel } from './weather'

import { NAV } from './navigation'
import { useWorkspace } from './hooks/useWorkspace'
import { OverviewPage } from './pages/OverviewPage'
import { ForecastPage } from './pages/ForecastPage'
import { Notifications } from './pages/NotificationsPage'
export default function App() {
  const workspace = useWorkspace()
  const {
    view,
    turbine,
    setTurbine,
    setSelectedID,
    data,
    imports,
    setHistory,
    setOrigin,
    busy,
    error,
    setError,
    cancelling,
    modal,
    setModal,
    mobile,
    setMobile,
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
    count,
    unread,
    runForecast,
    cancelRun,
    openRun,
  } = workspace
  const { t, prefs, setPrefs, num, pct, date, model, event } = useI18n()
  const runButton = (
    <button
      className="button primary"
      disabled={busy || !!running || !count}
      onClick={() => void runForecast()}
    >
      {busy || running ? <LoaderCircle size={17} className="spin" /> : <Play size={16} />}{' '}
      {t(running ? 'calculating' : 'calculate')}
    </button>
  )
  const download = current && (
    <a className="button secondary" href={`/api/runs/${current.id}/export`}>
      <Download size={16} />
      {t('csv')}
    </a>
  )
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        {t('skip')}
      </a>
      {mobile && <div className="nav-scrim" onClick={() => setMobile(false)} />}
      <aside
        ref={sidebar}
        className={`sidebar ${mobile ? 'open' : ''}`}
        aria-label={t('workspace')}
      >
        <a className="brand" href="#main" onClick={() => go('overview')}>
          <span className="brand-mark">
            <Wind size={27} />
          </span>
          <span>
            SAMAL<small>{t('windEnergy')}</small>
          </span>
        </a>
        <div className="workspace">
          <span className="workspace-icon">
            <Zap size={18} />
          </span>
          <div>
            {t('station')}
            <small>{t('turbineCount', { n: data?.turbines.length || 0 })}</small>
          </div>
        </div>
        <p className="nav-label">{t('workspace')}</p>
        <nav>
          {NAV.map((n) => (
            <button
              key={n.id}
              className={`nav-item ${view === n.id ? 'active' : ''}`}
              aria-current={view === n.id ? 'page' : undefined}
              onClick={() => go(n.id)}
            >
              <n.icon size={19} />
              <span>{t(n.id)}</span>
              {n.id === 'agent' && running && <span className="nav-progress" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-note">
            <Database size={17} />
            <span>{t('localData')}</span>
          </div>
          <button
            className="nav-item"
            onClick={() => {
              setMobile(false)
              setModal('help')
            }}
          >
            <CircleHelp size={18} />
            {t('help')}
          </button>
          <div className="sidebar-footer">
            <span className="avatar">S</span>
            <b>
              SAMAL <small>WORKSPACE</small>
            </b>
            <span className="version">v2.0</span>
          </div>
        </div>
      </aside>
      <div className="main-shell" inert={mobile || undefined}>
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              ref={menuButton}
              className="icon-button mobile-menu"
              aria-label={t('menu')}
              aria-expanded={mobile}
              onClick={() => setMobile(true)}
            >
              <Menu size={21} />
            </button>
            <span>SAMAL</span>
            <ChevronRight size={14} />
            <b>{t(view)}</b>
          </div>
          <div className="topbar-right">
            <span className="local-badge">
              <i />
              {t('local')}
            </span>
            <select
              className="language-select"
              aria-label={t('language')}
              value={prefs.language}
              onChange={(e) =>
                setPrefs({ ...prefs, language: e.target.value as typeof prefs.language })
              }
            >
              <option value="kk">ҚАЗ</option>
              <option value="ru">РУС</option>
              <option value="en">ENG</option>
            </select>
            <button
              className="icon-button"
              aria-label={t('theme')}
              title={t('theme')}
              onClick={() =>
                setPrefs({
                  ...prefs,
                  theme: document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark',
                })
              }
            >
              {prefs.theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <button
              className="icon-button notification-button"
              aria-label={`${t('notifications')}${unread ? `: ${unread}` : ''}`}
              onClick={() => go('notifications')}
            >
              <Bell size={19} />
              {unread > 0 && <span>{unread > 99 ? '99+' : unread}</span>}
            </button>
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          {(data?.demo || result?.data_source === 'synthetic') && (
            <div className="notice warning" role="status">
              <Info size={19} />
              {t('demoBanner')}
            </div>
          )}
          <div className="page-heading">
            <div>
              <div className="eyebrow">SAMAL / {t('windEnergy')}</div>
              <h1>{t(view)}</h1>
              <p>{t(`${view}Desc` as Key)}</p>
            </div>
            <div className="heading-actions">
              {view === 'overview' ? (
                <>
                  <button className="button secondary" onClick={() => go('import')}>
                    <Upload size={16} />
                    {t('upload')}
                  </button>
                  {runButton}
                </>
              ) : view === 'forecast' ? (
                <>
                  {download}
                  {runButton}
                </>
              ) : view === 'import' ? (
                <a className="button secondary" href="/api/template">
                  <Download size={16} />
                  {t('template')}
                </a>
              ) : view === 'agent' ? (
                runButton
              ) : null}
            </div>
          </div>
          <ErrorNotice
            message={error}
            onClose={() => setError('')}
            retry={() => {
              setRevision((v) => v + 1)
              void refresh()
                .then(() => setError(''))
                .catch((e) => setError(e.message))
            }}
          />
          {running && (
            <div className="running-banner" role="status">
              <LoaderCircle size={23} className="spin" />
              <div>
                <b>{t('calculating')}</b>
                <span>{event(running.step)}</span>
              </div>
              <button className="text-button" onClick={() => go('agent')}>
                {t('agent')}
                <ArrowUpRight size={15} />
              </button>
              <button
                className="button secondary compact"
                disabled={!!cancelling}
                onClick={() => void cancelRun(running)}
              >
                {t(cancelling ? 'cancelling' : 'cancel')}
              </button>
            </div>
          )}
          {!data ? (
            <Loading />
          ) : (
            <>
              {view === 'overview' && <OverviewPage workspace={workspace} />}
              {result &&
                ['overview', 'forecast'].includes(view) &&
                result.forecasts.every((f) => !f.model.startsWith('catboost')) && (
                  <div className="notice warning">
                    <Info size={17} />
                    {t('baselineForecast', {
                      model: [...new Set(result.forecasts.map((f) => model(f.model)))].join(' / '),
                    })}
                  </div>
                )}
              {view === 'forecast' && <ForecastPage workspace={workspace} />}
              {view === 'import' && (
                <>
                  <StationPanel
                    turbines={data.turbines}
                    disabled={!!running || !!data.demo}
                    onSaved={refresh}
                  />
                  <ImportPanel
                    turbines={data.turbines}
                    demo={!!data.demo}
                    disabled={!!running || !!data.demo}
                    onDone={async (r) => {
                      await refresh()
                      setRevision((v) => v + 1)
                      notify('importResult', { added: r.added, duplicates: r.duplicates }, r.run_id)
                      if (r.run_id) known.current[r.run_id] = 'running'
                    }}
                  />
                  <div className="section-heading">
                    <h2>{t('dataStatus')}</h2>
                  </div>
                  <div className="turbine-grid">
                    {data.turbines.map((x) => (
                      <Card
                        key={x.id}
                        title={x.name}
                        action={
                          <Pill tone={x.coverage >= 98 ? 'teal' : 'amber'}>
                            {pct(x.coverage / 100)}
                          </Pill>
                        }
                      >
                        <div className="data-status">
                          <div className="coverage-track">
                            <span style={{ width: `${x.coverage}%` }} />
                          </div>
                          <p>
                            {num(x.rows)} · {t('measurements')} /{' '}
                            {t('missing', { n: num(x.missing) })}
                          </p>
                          <small>
                            {date(x.first)} — {date(x.last)}
                          </small>
                        </div>
                      </Card>
                    ))}
                  </div>
                  <ImportHistory items={imports} turbines={data.turbines} />
                </>
              )}
              {view === 'quality' &&
                (result ? (
                  <Quality
                    result={result}
                    turbine={turbine}
                    setTurbine={setTurbine}
                    turbines={data.turbines}
                  />
                ) : (
                  <Card>
                    <Empty>{t('firstRun')}</Empty>
                  </Card>
                ))}
              {view === 'agent' && (
                <RunHistory
                  runs={data.runs}
                  onOpen={openRun}
                  onCancel={(r) => void cancelRun(r)}
                  cancelling={cancelling}
                />
              )}
              {view === 'compare' && (
                <Compare
                  runs={data.runs}
                  turbines={data.turbines}
                  turbine={turbine}
                  setTurbine={setTurbine}
                />
              )}
              {view === 'settings' && (
                <StationPanel
                  turbines={data.turbines}
                  disabled={!!running || !!data.demo}
                  onSaved={refresh}
                />
              )}
              {view === 'settings' && (
                <WeatherSettingsPanel
                  demo={!!data.demo}
                  hasData={!!count}
                  disabled={!!running}
                  onSaved={() => void refresh()}
                />
              )}
              {view === 'settings' && (
                <Settings
                  demo={!!data.demo}
                  disabled={!!running}
                  notify={notify}
                  onRestored={async () => {
                    setSelectedID('')
                    setHistory([])
                    setOrigin('')
                    known.current = {}
                    await refresh()
                    setRevision((v) => v + 1)
                  }}
                  onGuide={() => setModal('welcome')}
                />
              )}
              {view === 'notifications' && (
                <Notifications
                  items={notifications}
                  setItems={setNotifications}
                  onOpen={(n) => {
                    if (n.runID) {
                      const run = data.runs.find((r) => r.id === n.runID)
                      if (run?.status === 'completed') {
                        setSelectedID(run.id)
                        go('forecast')
                      } else go('agent')
                    }
                    setNotifications((old) =>
                      old.map((x) => (x.id === n.id ? { ...x, read: true } : x)),
                    )
                  }}
                />
              )}
            </>
          )}
          <footer className="page-footer">
            <span>SAMAL / {t('windEnergy')}</span>
            <span>{t('sourceTime')}</span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={19} />
          <span>{t(toast.key, toast.values)}</span>
          <button
            className="text-button"
            onClick={() => {
              go('notifications')
              setToast(null)
            }}
          >
            {t('details')}
          </button>
          <button className="icon-button" aria-label={t('close')} onClick={() => setToast(null)}>
            <X size={16} />
          </button>
        </div>
      )}
      {modal && (
        <Modal title={t(modal === 'welcome' ? 'welcome' : 'help')} onClose={closeModal}>
          {modal === 'welcome' ? (
            <>
              <p>{t('welcomeDesc')}</p>
              <label className="welcome-language">
                {t('language')}
                <select
                  value={prefs.language}
                  onChange={(e) =>
                    setPrefs({ ...prefs, language: e.target.value as typeof prefs.language })
                  }
                >
                  <option value="ru">Русский</option>
                  <option value="kk">Қазақша</option>
                  <option value="en">English</option>
                </select>
              </label>
              {data?.demo ? (
                <p>{t('demoBanner')}</p>
              ) : (
                (['welcome1', 'welcome2', 'welcome3'] as Key[]).map((key, i) => (
                  <div className="guide-step" key={key}>
                    <span>{i + 1}</span>
                    <p>{t(key)}</p>
                  </div>
                ))
              )}
              <div className="notice neutral">
                {t(
                  data?.demo
                    ? 'syntheticSource'
                    : result?.weather || (!result && data?.weather_settings.enabled)
                      ? 'weatherForecastNote'
                      : 'weatherNote',
                )}
              </div>
            </>
          ) : (
            <>
              <p>{t('aboutText')}</p>
              <h3>{t('quality')}</h3>
              <p>{t('validationText')}</p>
              <h3>{t('source')}</h3>
              <p>{t('limitations')}</p>
              <p>{t('unitsNote')}</p>
            </>
          )}
          <button className="button primary full" onClick={closeModal}>
            {t(modal === 'welcome' ? 'start' : 'understood')}
          </button>
        </Modal>
      )}
    </div>
  )
}
