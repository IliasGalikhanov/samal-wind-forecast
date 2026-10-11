# HTTP API

Machine-readable contract: [OpenAPI 3.1](openapi.json). Import the file into an OpenAPI viewer or API client. Base URL: `http://127.0.0.1:8080`; JSON requests use `Content-Type: application/json`.

The API belongs to a local single-user installation and has no authentication. Compose binds it to loopback. Examples below use invented coordinates and the public synthetic CSV. Shell examples use Bash; on PowerShell use `curl.exe` and adapt quoting.

## Configure and import

```sh
curl -fsS http://127.0.0.1:8080/api/health
curl -fsS -X POST http://127.0.0.1:8080/api/weather/settings \
  -H 'Content-Type: application/json' \
  -d '{"enabled":true,"timezone":"Asia/Almaty","origin_mode":"live","auto_refresh":false}'
curl -fsS -X POST http://127.0.0.1:8080/api/turbines \
  -H 'Content-Type: application/json' \
  -d '{"name":"Example turbine","latitude":51.2,"longitude":71.4,"sample_minutes":10,"rated_kw":2000}'
```

Use the returned turbine `id` in the following requests. The example assumes `1`, valid for a fresh installation. Turbine creation and update both return **200**; a positive `id` updates an existing turbine.

```sh
curl -fsS -X POST http://127.0.0.1:8080/api/imports/preview \
  -F turbine_id=1 -F file=@data/demo/turbine.csv
curl -fsS -X POST http://127.0.0.1:8080/api/imports \
  -F turbine_id=1 -F auto_run=false -F file=@data/demo/turbine.csv
```

Preview returns `rows`, `added`, `duplicates`, `conflicts`, a time range and sample rows. It writes no observations. Import revalidates transactionally and returns **201**. Duplicate rows are skipped; any conflicting value at the same `(turbine_id, time)` rejects the whole import. The small fixture contains two hours and is insufficient for training.

For custom headers, send `options` as a JSON string in the multipart form, for example:

```json
{"delimiter":";","time":"timestamp","wind":"wind_ms","power":"output","temperature":"temp_c","power_unit":"mw"}
```

`POST /api/imports/columns` accepts `file` and optional `options`, returning `columns` and `suggested`. Supported power units: `normalized`, `percent`, `kw`, `mw`. kW/MW require a positive rated capacity. UTF-8 is required; the request limit is 50 MiB. Timezone, interval and rated capacity become fixed after import.

## Start, poll and export

After importing enough history, start an asynchronous job:

```sh
curl -fsS -X POST http://127.0.0.1:8080/api/runs \
  -H 'Content-Type: application/json' -d '{"mode":"live","horizon":48}'
curl -fsS http://127.0.0.1:8080/api/runs/RUN_ID
curl -fS http://127.0.0.1:8080/api/runs/RUN_ID/export -o forecast.csv
```

Replace `RUN_ID` with the returned `id`. **202 means accepted.** Poll until `completed`, `failed` or `cancelled`. Read `step`, `events` and `error` to explain progress/failure. Only completed runs can be exported. CSV fields include the station-local origin/target, turbine ID, normalised power, applied model and `data_source`.

`POST /api/runs/RUN_ID/cancel` returns 202 while cancellation is being processed. Poll for the terminal state. `force_retrain: true` bypasses a compatible cache. Dataset mode additionally supports `origin` and `replay_days` (1–31); live mode supports one forecast origin.

## Time and units

- Input timestamps describe interval starts in the configured IANA timezone. All turbines share it.
- Forecast timestamps without offsets use that station timezone. Event timestamps carry the server's formatted instant.
- Only complete hours produce target values; incomplete hours have null values in history.
- Power and MAE/RMSE in JSON use the 0–1 scale. UI percentages and error percentage points multiply by 100.
- Rated capacity normalises imported kW/MW. Forecast exports remain normalised; the API does not calculate MWh.

## Backups and exports

`GET /api/backup` downloads a consistent ZIP of private data and run artifacts. `POST /api/backup/preview` validates a multipart `file` without replacing the database. `POST /api/backup/restore` requires the same file and `confirm=restore`; it replaces current data and saves the previous state as `runtime/recovery.zip`. Limits: 512 MiB compressed, 2 GiB extracted. Restoration checks archive paths, database integrity and data-source compatibility. These files must remain private.

`POST /api/exports` accepts `{name, content}` for `samal-preferences.json` or `samal-comparison.csv`, validates the content and returns a download URL. It expires after 10 minutes or server restart. Maximum request size: 128 KiB.

## Failures and recovery

Most API failures return `{"error":"description"}`. Text currently may be Russian; clients must use status codes and not parse message strings.

| Status | Meaning | Next action |
|---|---|---|
| 400 | Malformed request, invalid file/settings | Fix input; inspect the preview |
| 403 | Operation forbidden in synthetic demo | Use an ordinary installation |
| 404 | Missing run, unfinished export, absent/expired artifact | Check run status or regenerate download |
| 409 | Active mutation, invalid start conditions, conflict or locked configuration | Inspect error and current job/data |
| 422 | Invalid turbine fields or structured preferences/comparison export | Correct payload |
| 500 | Storage or unexpected internal failure | Inspect local logs; preserve existing data |

An external-weather failure can occur after the start endpoint returned 202. It becomes a failed run; no incomplete forecast replaces the latest completed result. Go independently checks output times, station IDs, row counts and finite 0–1 values before publication. Details: [agent policy](agent.md).
