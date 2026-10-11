# Architecture decisions / Архитектурные решения

These records describe the local, single-user application. Each decision includes a cost and a condition for reconsideration.

## ADR-001 · Go API with a Python worker

**Context.** Imports, scheduling, cancellation and HTTP serving need one consistent lifecycle. The model uses pandas and CatBoost.

**Decision.** Go owns application state and starts one Python subprocess per forecast. JSON carries requests/results; stdout carries structured events. Go validates output independently before storing a completed run.

**Tradeoffs.** Reuses Python ML libraries and makes cancellation concrete. Packaging includes two runtimes and process startup has a cost. Worker failure must never publish partial output.

**Alternatives.** Python-only would simplify packaging. A separate inference service would add network contracts and operational overhead without a current need for independent scaling.

**Reconsider when.** Concurrent jobs or remote ML execution become necessary. Add a durable queue and explicit job ownership before separating services.

## ADR-002 · SQLite and one active mutation

**Context.** Imports, configuration, training and backups must remain consistent.

**Decision.** SQLite uses WAL and transactions. A process-level mutex serialises import, training and backup/restore. Forecasts receive fixed snapshots of measurements and settings.

**Tradeoffs.** No database server is required. Long training temporarily blocks imports. A process-level mutex cannot coordinate several API replicas.

**Alternatives.** PostgreSQL and a distributed queue support multi-user operation but add services and coordination.

**Reconsider when.** Imports must continue during training or several replicas share data. Use versioned snapshots and database-backed job coordination.

## ADR-003 · Temporal selection and explicit fallback

**Context.** Random splits can expose future information. Live forecasts may be requested long after the latest measurement.

**Decision.** Retrain before each of four chronological validation windows. Select by MAE, then RMSE. Use a later audit without selecting its best model retroactively. Choose a weather-only or seasonal fallback for stale measurements and record the applied method.

**Tradeoffs.** More training than one split. Historical weather availability is approximated conservatively; the API does not prove exact publication times. Repeated development use of the audit period limits independence.

**Reconsider when.** Fresh actual measurements and a versioned weather archive become available. Freeze a new evaluation period before comparing revisions.

## ADR-004 · Content-based model cache

**Context.** New weather should not trigger training, but changed measurements or features must invalidate old models.

**Decision.** SHA-256 identifies a bundle by data, coordinates, timezone, features, parameters, ML source and dependencies. Artifact hashes detect corruption; an atomic pointer publishes a complete bundle.

**Tradeoffs.** Predict-only runs become fast. Conservative invalidation may retrain after a source-only change. Hashes do not authenticate third-party models; bundles are trusted local application artifacts.

**Reconsider when.** A shared registry becomes necessary. Add provenance, access control and explicit model promotion.

## ADR-005 · Separate synthetic demo

**Context.** A public clone must run without redistributing original data or confusing demonstration output with actual observations.

**Decision.** Use deterministic invented measurements/weather, a separate database/volume, synthetic labels in JSON/CSV, and server-enforced import/restore restrictions.

**Tradeoffs.** The complete pipeline is reproducible offline. The deliberately learnable generator cannot establish operational accuracy. The walkthrough shows ordinary import and synthetic forecasting in separate instances.
