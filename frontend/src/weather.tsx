import { useEffect, useState } from 'react'
import { CloudSun, Download, Save } from 'lucide-react'
import { api, post } from './types'
import type { Result, WeatherSettings } from './types'
import { useI18n } from './i18n'
import { Card, ErrorNotice, Pill } from './ui'

export function WeatherSettingsPanel({disabled,demo,hasData,onSaved}:{disabled:boolean;demo:boolean;hasData:boolean;onSaved:()=>void}){
 const {t}=useI18n(),[value,setValue]=useState<WeatherSettings|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[saved,setSaved]=useState(false)
 useEffect(()=>{void api<WeatherSettings>('/weather/settings').then(setValue).catch(e=>setError(e.message))},[])
 async function save(){if(!value)return;setBusy(true);setError('');try{setValue(await api<WeatherSettings>('/weather/settings',post(value)));setSaved(true);onSaved()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <Card title={t('weatherSettings')} sub={t('weatherSettingsDesc')} action={<CloudSun size={22}/>}><div className="settings-body"><ErrorNotice message={error}/>{value&&<>
 {demo?<div className="notice neutral">{t('syntheticSource')}</div>:<label className="setting-switch"><span>{t('weatherEnabled')}</span><input type="checkbox" role="switch" checked={value.enabled} disabled={disabled||busy} onChange={e=>{setSaved(false);setValue({...value,enabled:e.target.checked,origin_mode:e.target.checked?value.origin_mode:'dataset'})}}/></label>}
 <label>{t('csvTimezone')}<input list="station-timezones" value={value.timezone} disabled={disabled||busy||demo||hasData} onChange={e=>{setSaved(false);setValue({...value,timezone:e.target.value as WeatherSettings['timezone']})}}/><datalist id="station-timezones"><option value="Asia/Almaty"/><option value="UTC"/><option value="Europe/Berlin"/><option value="America/Chicago"/></datalist><small>{t(hasData?'timezoneLocked':'timezoneInputHint')}</small></label>
 <label>{t('weatherOriginMode')}<select value={value.origin_mode} disabled={disabled||busy||!value.enabled} onChange={e=>{setSaved(false);setValue({...value,origin_mode:e.target.value as WeatherSettings['origin_mode']})}}><option value="dataset">{t('datasetOrigin')}</option><option value="live">{t('liveOrigin')}</option></select></label>
 <label className="setting-switch"><span>{t('weatherAutoRefresh')}</span><input type="checkbox" role="switch" checked={value.auto_refresh} disabled={disabled||busy||!value.enabled} onChange={e=>{setSaved(false);setValue({...value,auto_refresh:e.target.checked})}}/></label>
 <p className="table-note">{t('weatherAutoHint')}</p><div className="button-row"><button className="button primary" disabled={disabled||busy} onClick={()=>void save()}><Save size={16}/>{t('saveWeather')}</button>{saved&&<Pill>{t('weatherSaved')}</Pill>}</div>
 </>}</div></Card>
}

export function WeatherSummary({result,runID}:{result:Result;runID:string}){
 const {t,date,num,created,model}=useI18n(),weather=result.weather,live=weather?.mode==='live',synthetic=result.data_source==='synthetic'
 if(!weather)return <div className="notice neutral">{t('weatherNote')}</div>
 return <Card title={t('weatherInputs')} sub={synthetic?t('syntheticSource'):'Open-Meteo · DWD ICON Global'} action={<Pill tone="teal">{t(synthetic?'syntheticLabel':live?'modeLive':'weatherArchived')}</Pill>}><div className="notice neutral">{t(result.training.reused?'modelReused':'modelTrained')}</div>{synthetic?<p className="table-note">{t('demoBanner')}</p>:<><div className="weather-facts">
 <div><span>{t('csvTimezone')}</span><b>{weather.source_timezone}</b><small>{t('timezoneAssumption')}</small></div>
 <div><span>{t(live?'weatherRetrieved':'weatherMargin')}</span><b>{live?created(weather.requests.at(-1)?.retrieved_at||''):t('hours',{n:weather.publication_margin_hours})}</b><small>{t(live?'liveWeatherNote':'weatherBoundNote')}</small></div>
 <div><span>{t('weatherWindHeight')}</span><b>100 {t('meters')}</b><small>{t('weatherHeightNote')}</small></div>
 </div><p className="table-note">{t(live?'liveWeatherNote':'weatherInputNote')}</p><div className="weather-links"><a href={live?"https://open-meteo.com/en/docs":"https://open-meteo.com/en/docs/previous-runs-api"} target="_blank" rel="noreferrer">Open-Meteo · CC BY 4.0</a></div></>}<div className="weather-links"><a className="button secondary compact" href={`/api/runs/${runID}/artifacts/weather.json`}><Download size={14}/>{t('weatherManifest')}</a></div>
 <details className="weather-details"><summary>{t('weatherValues')}</summary><div className="table-wrap"><table><thead><tr><th>{t('dateHour')}</th><th>{t('turbineLabel')}</th><th>{t('wind')} · 100 m</th><th>{t('temperature')}</th><th>{t(synthetic?'source':live?'weatherRetrieved':'weatherForecastAge')}</th></tr></thead><tbody>{weather.forecast.map(row=><tr key={`${row.turbine_id}-${row.time}`}><td>{date(row.time,true)}</td><td>{row.turbine_id}</td><td>{num(row.wind_100m,2)} {t('ms')}</td><td>{num(row.temperature_2m,1)} °C</td><td>{synthetic?t('syntheticLabel'):row.previous_days==null?created(weather.requests.at(-1)?.retrieved_at||''):`${row.previous_days*24} ${t('hoursShort')}`}</td></tr>)}</tbody></table></div>{!synthetic&&<p className="table-note">{t('weatherRetrieved')}: {created(weather.requests.at(-1)?.retrieved_at||'')}</p>}</details>
 {result.decisions&&<details className="weather-details"><summary>{t('agentDecisions')}</summary><div className="settings-body">{result.decisions.slice(0,2).map(d=><p key={d.turbine_id}>{t('turbine',{n:d.turbine_id})}: {t(d.reason==='stale_measurements'?'decisionStale':'decisionFresh')} → <b>{model(d.model)}</b></p>)}<p>{t('decisionValidated')}</p></div></details>}
 {result.replay&&result.replay.days>1&&<div className="replay-summary"><div><h3>{t('replayReady',{n:result.replay.days})}</h3><p>{date(result.replay.start)} — {date(result.replay.end_origin)} · {num(result.replay.rows)} {t('rows')}</p><p>{t('replayMethod')} {model(result.fallback_model||'seasonal')}</p></div><a className="button primary" href={`/api/runs/${runID}/artifacts/replay.csv`}><Download size={16}/>{t('replayDownload')}</a></div>}
 </Card>
}
