# Demonstration / Демонстрация

![SAMAL browser walkthrough](images/demo.gif)

The 30-second animation uses six actual browser screenshots from successful end-to-end tests. It omits training and waiting time; it is not a real-time recording or performance benchmark. All displayed measurements are invented.

1. Add a turbine and coordinates in an empty ordinary installation.
2. Preview the public CSV fixture and inspect its column mapping.
3. Import 12 measurements; show the receipt.
4. Open the 48-hour forecast in a separate synthetic demo installation.
5. Inspect the actual worker events in the agent log.
6. Read the temporal model comparison and audit metrics.

The two instances intentionally serve different purposes: the ordinary app accepts imports, while the synthetic demo supplies enough generated history to train and disables imports. The 12-row CSV is not the training set. The demo forecast uses the current application clock, so its date and shape change across recordings.

## Recreate the animation

Install the development dependencies described in the [guide](user-guide.md), including Go, Python ML dependencies and Chromium. Run from the repository root.

PowerShell:

```powershell
$env:SAMAL_RECORD_DIR = Join-Path $PWD '.cache/portfolio-tour'
npm --prefix frontend run test:e2e
if ($LASTEXITCODE -ne 0) { throw 'Do not publish screenshots from failed tests' }
.venv/Scripts/python.exe scripts/make_demo_gif.py
Remove-Item Env:SAMAL_RECORD_DIR
```

Bash:

```sh
SAMAL_RECORD_DIR="$PWD/.cache/portfolio-tour" npm --prefix frontend run test:e2e && \
  .venv/bin/python scripts/make_demo_gif.py
```

Review all frames before publishing. The test servers create separate directories under `.cache/e2e/` and never reuse the working `runtime/`. Browser screenshots, reports and traces stay ignored; only the reviewed GIF is published. API responses are not mocked in this walkthrough.
