# SAMAL · Wind power forecasting

[![Checks](https://github.com/IliasGalikhanov/samal-wind-forecast/actions/workflows/ci.yml/badge.svg)](https://github.com/IliasGalikhanov/samal-wind-forecast/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[Русский](README.md) · English

**Turn turbine measurements and coordinates into hourly power forecasts for the next 24–48 hours.** SAMAL validates CSV files, retrieves weather, trains and compares models, and records its decisions alongside each forecast.

**Go · React · TypeScript · Python · CatBoost · SQLite · Docker**

![SAMAL walkthrough using invented data](docs/images/demo.gif)

*Station setup and import use an ordinary installation. Forecasting uses a separate synthetic demo. [Recording details](docs/demo.md).*

## Try it locally

Docker with Compose is required. Building downloads dependencies; the completed demo runs without an external weather API.

```sh
git clone https://github.com/IliasGalikhanov/samal-wind-forecast.git
cd samal-wind-forecast
docker compose --profile demo up --build -d --wait demo
```

Open [localhost:8081](http://localhost:8081). The demo supplies 153 days of invented measurements and weather, trains actual CatBoost models and produces forecasts. Initial training takes a few minutes; subsequent runs reuse compatible model bundles.

For your own measurements, run `docker compose up --build -d --wait app` and open [localhost:8080](http://localhost:8080). Configure turbines, coordinates and a shared IANA timezone, then map and import CSV columns. Supported power units: fractions, percent, kW and MW. Physical power requires a known rated capacity. See the [detailed guide](docs/user-guide.md).

## Engineering features

- Atomic imports with conflict detection, duplicate handling and explicit missing hours.
- Four temporal validation folds, baseline comparison and a separate historical audit.
- Cached models identified by measurements, configuration, source code and dependencies.
- Weather retries, cancellable workers and validation before publishing a result.
- A fallback for stale measurements, recorded per forecast.
- Exports, comparisons, backup/restore and a persistent decision log.
- Russian, Kazakh and English UI; light, dark and system themes.

## Architecture and tradeoffs

React communicates with a Go API. SQLite stores observations, settings and run history. Go launches Python for feature preparation, CatBoost training and inference, then independently validates the output. The agent follows an explicit decision policy; no LLM is required at runtime.

One installation runs one active data-changing job at a time. This keeps imports and forecasts consistent and simplifies cancellation and backups. It is a local, single-user application.

[Architecture](docs/architecture.md) · [Decision records](docs/decisions.md) · [API examples](docs/api.md) · [OpenAPI 3.1](docs/openapi.json)

## Reproducible model evidence

The [synthetic audit](docs/reports/synthetic.md) compares models, plots error by forecast lead and shows difficult examples.

```sh
python scripts/demo.py --verify --output runtime/portfolio-demo
python scripts/portfolio_report.py
```

Install `ml/requirements.lock.txt` first. The first command trains models, then forbids training during a second forecast to verify reuse. The report validates every input row against the public generator and reconstructs the historical audit using pre-audit models.

**Synthetic results demonstrate pipeline behaviour, not accuracy at a real wind farm.** Output is normalised power, not MWh. Current outages and grid restrictions are not observed. A separate private-data experiment and its limitations are documented in [model.md](docs/model.md); its exact metrics cannot be reproduced from this public repository.

## Checks

GitHub Actions checks Go, Python, frontend formatting/build, browser workflows, synthetic training, Docker startup and persistence after restart. Browser tests use isolated temporary databases and do not query operational weather APIs.

```sh
npm --prefix frontend run format:check
npm --prefix frontend run test:e2e
```

E2E prerequisites: Go, Node.js 24, Python 3.12 with ML dependencies, and Chromium (`cd frontend && npx playwright install chromium`). See [reproducibility](docs/reproducibility.md) and [contributing](CONTRIBUTING.md).

## Data and licensing

An independent learning project inspired by a HackAlem AI task. Original datasets are not distributed. User uploads, models, databases, backups and run artifacts stay local. Public fixtures and the walkthrough use invented data.

Code: [MIT](LICENSE). Dependencies: [third-party notices](THIRD_PARTY_NOTICES.md). Weather: Open-Meteo / DWD ICON Global, with CC BY 4.0 attribution and the provider's [API terms](https://open-meteo.com/en/terms).
