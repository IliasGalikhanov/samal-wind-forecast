export type Turbine = {
  id: number
  name: string
  latitude: number
  longitude: number
  sample_minutes: number
  rated_kw: number
  rows: number
  first: string
  last: string
  missing: number
  coverage: number
  power: number
  wind: number
  temperature: number
}
export type Hour = {
  time: string
  power: number | null
  wind: number | null
  temperature: number | null
  samples: number
}
export type Metric = { mae: number | null; rmse: number | null; n: number }
export type Forecast = { time: string; turbine_id: number; prediction: number; model: string }
export type Result = {
  data_source?: 'synthetic' | 'user_import'
  mode?: 'live' | 'dataset'
  decisions?: { origin: string; turbine_id: number; model: string; reason: string }[]
  fallback_model?: string
  weather?: WeatherInfo
  replay?: { days: number; rows: number; start: string; end_origin: string; models: string[] }
  schema_version: number
  origin: string
  horizon: number
  unit: string
  selected_model: string
  model_name: string
  forecasts: Forecast[]
  warnings: string[]
  quality: {
    turbine_id: number
    full_hours: number
    incomplete_hours: number
    hours: number
    last_complete_hour: string
    age_hours: number
  }[]
  training: {
    reused?: boolean
    bundle_id?: string
    trained_at?: string
    rows: number
    cutoff: string
    final_cutoff: string
    seed: number
    input_sha256: string
  }
  validation: {
    start: string
    end_exclusive: string
    models: Record<string, Metric>
    folds?: {
      start: string
      end_exclusive: string
      training_cutoff: string
      models: Record<string, Metric>
    }[]
  }
  backtest: {
    start: string
    end_exclusive: string
    models: Record<string, Metric>
    selected: Metric
    breakdown: ({ turbine_id: number; horizon: string } & Metric)[]
    points: { time: string; turbine_id: number; actual: number; prediction: number }[]
    method: string
  }
}
export type Run = {
  request?: { mode?: 'live' | 'dataset'; horizon: number; origin: string; replay_days?: number }
  id: string
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  created: string
  trigger: string
  horizon: number
  origin: string
  step: string
  error: string
  result?: Result
  events?: { at: string; message: string }[]
  evaluation?: { matched: number; total: number; mae: number | null; rmse: number | null }
}
export type WeatherSettings = {
  enabled: boolean
  timezone: string
  origin_mode: 'dataset' | 'live'
  auto_refresh: boolean
}
export type WeatherInfo = {
  mode?: 'live' | 'dataset' | 'synthetic'
  documentation?: string
  status: string
  provider: string
  model: string
  source_timezone: string
  publication_margin_hours: number
  requests: { url: string; retrieved_at: string; sha256: string }[]
  forecast: {
    time: string
    turbine_id: number
    wind_100m: number
    temperature_2m: number
    previous_days: number | null
  }[]
}
export type Overview = {
  demo?: boolean
  turbines: Turbine[]
  runs: Run[]
  latest_run: Run | null
  timezone: string
  weather_settings: WeatherSettings
}
export type Imported = {
  id: string
  turbine_id: number
  name: string
  created: string
  rows: number
  added: number
  duplicates: number
  sha256: string
  run_id?: string
}
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, init)
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || 'Не удалось выполнить запрос')
  return body as T
}
export const post = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})
export type ImportPreview = {
  rows: number
  added: number
  duplicates: number
  conflicts: number
  first: string
  last: string
  samples: {
    time: string
    wind: number
    power: number
    temperature: number
    status: 'new' | 'duplicate' | 'conflict'
  }[]
  conflict_times: string[]
}
export type BackupInfo = {
  format: string
  version: number
  created: string
  observations: number
  imports: number
  runs: number
}
export function uploadForm<T>(
  path: string,
  body: FormData,
  progress: (n: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api${path}`)
    xhr.responseType = 'json'
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) progress(Math.round((100 * e.loaded) / e.total))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response as T)
      else reject(new Error(xhr.response?.error || `HTTP ${xhr.status}`))
    }
    xhr.onerror = () => reject(new Error('Network error'))
    xhr.send(body)
  })
}
export function downloadFile(url: string, name: string) {
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.hidden = true
  document.body.append(link)
  link.click()
  link.remove()
}
export async function saveBlob(blob: Blob, name: string) {
  const result = await api<{ url: string }>('/exports', post({ name, content: await blob.text() }))
  downloadFile(result.url, name)
}
