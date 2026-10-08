"""Weather-aware training, temporal evaluation, inference and daily replay."""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from catboost import CatBoostRegressor

import worker as history
import model_cache
from synthetic import load_synthetic_weather
from weather import WEATHER_FEATURES, load_weather, load_live_weather, utc_times

NAMES = {"catboost_weather": "CatBoost · погода и история", "catboost_weather_only": "CatBoost · погода",
         "catboost_mae": "CatBoost · история", "persistence": "Последнее измерение", "seasonal": "Сезонный профиль"}
CALENDAR = ["turbine_id", "lead", "hour_sin", "hour_cos", "year_sin", "year_cos"]
COLUMNS = {"catboost_weather": history.FEATURES+WEATHER_FEATURES,
           "catboost_weather_only": CALENDAR+WEATHER_FEATURES, "catboost_mae": history.FEATURES}


def feature_frame(frame, tid, origin, horizon, weather):
    return history.features(frame, tid, origin, horizon).join(weather.features(tid, origin, horizon))


def training_set(frames, weather, start, cutoff):
    chunks, targets, dates = [], [], []
    for tid, frame in frames.items():
        first = max(start, frame.index.min()+pd.Timedelta(hours=72)).ceil("12h")
        for origin in pd.date_range(first, cutoff-pd.Timedelta(hours=48), freq="12h"):
            x = feature_frame(frame, tid, origin, 48, weather)
            y = frame.power.reindex(x.index)
            usable = y.notna() & x[WEATHER_FEATURES].notna().all(axis=1) & (x.recent_coverage >= .5)
            if usable.any():
                chunks.append(x[usable]); targets.append(y[usable])
                dates.append(pd.DataFrame({"origin": origin, "target": x.index[usable]}))
    if not chunks:
        raise ValueError("Недостаточно пересечений измерений и архивных прогнозов погоды")
    return pd.concat(chunks, ignore_index=True), pd.concat(targets, ignore_index=True), pd.concat(dates, ignore_index=True)


def train(training, cutoff, keys=None):
    x, y, dates = training
    mask = (dates.origin <= cutoff-pd.Timedelta(hours=48)) & (dates.target < cutoff)
    if int(mask.sum()) < 500:
        raise ValueError("Недостаточно обучающих примеров до начала проверочного периода")
    models = {}
    for key in keys or COLUMNS:
        models[key] = CatBoostRegressor(**history.MODEL_PARAMS, loss_function="MAE")
        models[key].fit(x.loc[mask, COLUMNS[key]], y[mask])
    return models, int(mask.sum())


def predict(frame, tid, origin, horizon, models, weather, cutoff):
    x = feature_frame(frame, tid, origin, horizon, weather)
    seasonal = history.seasonal_predict(history.seasonal_profile(frame, cutoff), x.index)
    power0 = x.p0.iloc[0]
    fresh = bool(x.recent_coverage.iloc[0] >= .5 and pd.notna(power0))
    wet = x[WEATHER_FEATURES].notna().all(axis=1).to_numpy()
    predictions = {"seasonal": seasonal, "persistence": np.repeat(power0, horizon) if fresh else seasonal.copy()}
    for key, model in models.items():
        raw_values = model.predict(x[COLUMNS[key]])
        if not np.isfinite(raw_values).all():
            raise ValueError("Модель вернула нечисловой прогноз")
        values = np.clip(raw_values, 0, 1)
        if key == "catboost_mae":
            values = values if fresh else seasonal.copy()
        elif key == "catboost_weather" and not fresh:
            values = np.clip(models["catboost_weather_only"].predict(x[COLUMNS["catboost_weather_only"]]), 0, 1)
        if key != "catboost_mae":
            values = np.where(wet, values, seasonal)
        predictions[key] = values
    return x, predictions, fresh, wet


def backtest(frames, models, start, end, weather, horizon):
    records = []
    for tid, frame in frames.items():
        for origin in pd.date_range(start, end-pd.Timedelta(hours=24), freq="24h"):
            x, predictions, _, wet = predict(frame, tid, origin, horizon, models, weather, start)
            actual = frame.power.reindex(x.index)
            for i, target in enumerate(x.index):
                if target >= end or pd.isna(actual.iloc[i]) or not wet[i]:
                    continue
                records.append({"time": str(target), "origin": str(origin), "lead": i+1, "turbine_id": tid,
                                "actual": float(actual.iloc[i]), **{k: float(v[i]) for k, v in predictions.items()}})
    if not records:
        raise ValueError("Нет совпадающих часов погоды и измерений для временной проверки")
    return pd.DataFrame(records)


def choose(frame, candidates=None):
    scores = {key: history.metrics(frame, key) for key in NAMES}
    winner = min(candidates or NAMES, key=lambda key: (scores[key]["mae"], scores[key]["rmse"]))
    return winner, scores


def validate_forecast(records, stations, origin, horizon, days=1):
    expected = {(str(origin+pd.Timedelta(days=day)), tid, str(origin+pd.Timedelta(days=day, hours=hour)))
                for day in range(days) for tid in stations for hour in range(horizon)}
    actual = {(r["origin"], r["turbine_id"], r["time"]) for r in records}
    values = np.asarray([r["prediction"] for r in records], dtype=float)
    if len(records) != len(expected) or actual != expected:
        raise ValueError("Неполный прогноз или повторные часы; результат не опубликован")
    if not np.isfinite(values).all() or ((values < 0) | (values > 1)).any():
        raise ValueError("Некорректные значения мощности; результат не опубликован")


def fit_bundle(frames, input_path, output, config, horizon, stations, start, last, common_end, test_start, windows, force_retrain):
    key = model_cache.fingerprint(input_path, config, horizon, COLUMNS, history.MODEL_PARAMS)
    root = Path(config.get("models", str(Path(config["cache"]).parent/"models")))
    report = None if force_retrain else model_cache.restore(root, key, output.parent)
    if report:
        try:
            models = {name: CatBoostRegressor().load_model(str(output.parent/f"{name}.cbm")) for name in report["model_keys"]}
            report["training"]["reused"] = True
            history.event("WEATHER_MODEL_REUSED")
            return models, report
        except Exception:
            history.event("WEATHER_CACHE_INVALID")
    history.event("WEATHER_MODEL_TRAINING")
    training_weather = (load_synthetic_weather(start, last, stations, config["timezone"]) if config.get("synthetic") else
                        load_weather(start, last, stations, config["timezone"], Path(config["cache"]), history.event))
    stored = pd.concat([frame.assign(turbine_id=tid).rename_axis("valid_time_utc").reset_index() for tid, frame in training_weather.tables.items()])
    stored.to_csv(output.parent/"weather-training.csv", index=False)
    history.event("WEATHER_FEATURES")
    training = training_set(frames, training_weather, start, last)
    folds, validations = [], []
    for index, (left, right) in enumerate(windows, 1):
        history.event(f"WEATHER_VALIDATION {index}/4")
        models, _ = train(training, left)
        fold = backtest(frames, models, left, right, training_weather, horizon)
        _, scores = choose(fold)
        folds.append({"start": str(left), "end_exclusive": str(right), "training_cutoff": str(left), "models": scores})
        validations.append(fold)
    validation = pd.concat(validations, ignore_index=True)
    winner, scores = choose(validation)
    fallback, _ = choose(validation, ["catboost_weather_only", "seasonal"])
    history.event(f"WEATHER_SELECTED {winner} {fallback}")
    audit_models, training_rows = train(training, test_start)
    audit = backtest(frames, audit_models, test_start, common_end, training_weather, horizon)
    _, audit_scores = choose(audit)
    for name, model in audit_models.items():
        model.save_model(str(output.parent/f"validation-{name}.cbm"))
    history.event("WEATHER_FINAL_TRAIN")
    needed = list(dict.fromkeys([k for k in [winner, fallback, "catboost_weather_only"] if k in COLUMNS]))
    final_models, final_rows = train(training, last, needed)
    for name, model in final_models.items():
        model.save_model(str(output.parent/f"{name}.cbm"))
    breakdown = [{"turbine_id": tid, "horizon": f"{lo}–{hi}", **history.metrics(audit[(audit.turbine_id == tid)&audit.lead.between(lo, hi)], winner)}
                 for tid in frames for lo, hi in [(1, 24), (25, 48)] if lo <= horizon]
    points = audit[audit.lead <= 24].copy()
    points["prediction"] = points[winner]
    report = {"model_keys": needed, "selected_model": winner, "model_name": NAMES[winner], "fallback_model": fallback,
              "training": {"rows": training_rows, "final_rows": final_rows, "cutoff": str(test_start), "final_cutoff": str(last),
                           "seed": 42, "features": COLUMNS, "parameters": history.MODEL_PARAMS,
                           "weather": training_weather.manifest, "input_sha256": model_cache.digest(input_path),
                           "bundle_id": key, "trained_at": pd.Timestamp.now(tz="UTC").isoformat(), "reused": False},
              "validation": {"start": str(windows[0][0]), "end_exclusive": str(test_start), "models": scores, "folds": folds},
              "backtest": {"start": str(test_start), "end_exclusive": str(common_end), "models": audit_scores,
                           "selected": audit_scores[winner], "breakdown": breakdown,
                           "points": points[["time", "turbine_id", "actual", "prediction"]].to_dict("records"),
                           "method": "Four 14-day temporal folds and a separate final 14-day audit. Synthetic inputs only." if config.get("synthetic") else
                           "Four 14-day temporal folds; weather forecast offset selected as of origin with 12h publication margin; final 14-day historical audit. Missing weather/actual pairs excluded for every candidate."},
              "analysis": {"validation_improvement_vs_persistence_pp": 100*(scores["persistence"]["mae"]-scores[winner]["mae"]),
                           "future_accuracy_confirmed": False}}
    model_cache.save(root, key, output.parent, report)
    return final_models, report


def run(input_path, output, horizon, origin_text, config_path, replay_days=1, force_retrain=False):
    config = json.loads(config_path.read_text(encoding="utf-8"))
    live = config.get("mode", "dataset") == "live"
    if live and replay_days != 1:
        raise ValueError("Текущий прогноз не поддерживает исторический повтор")
    if live:
        instant = utc_times([pd.Timestamp(origin_text)], config["timezone"])[0]
        now = pd.Timestamp.now(tz="UTC")
        if not now.floor("h") <= instant <= now+pd.Timedelta(hours=49):
            raise ValueError("Начало текущего прогноза находится вне ближайших 48 часов")
    history.event("WEATHER_PLAN")
    raw = pd.read_csv(input_path)
    frames = history.hourly(raw)
    if not frames or any(not frame.power.notna().any() for frame in frames.values()):
        raise ValueError("В каждой турбине нужен хотя бы один полный час")
    last = max(frame.index.max() for frame in frames.values())+pd.Timedelta(hours=1)
    origin = pd.Timestamp(origin_text)
    if origin < last:
        raise ValueError("Начало прогноза не должно предшествовать последним измерениям")
    common_end = (min(f.power.last_valid_index() for f in frames.values())+pd.Timedelta(hours=1)).floor("D")
    common_start = max(f.power.first_valid_index() for f in frames.values())
    start = max(pd.Timestamp("2024-01-08"), last-pd.Timedelta(days=730), common_start+pd.Timedelta(hours=72))
    test_start = common_end-pd.Timedelta(days=14)
    windows = history.validation_windows(test_start)
    if windows[0][0]-start < pd.Timedelta(days=20):
        raise ValueError("Для погодной модели нужно не менее 90 дней истории после января 2024")
    stations = [s for s in config["stations"] if int(s["id"]) in frames]
    final_models, report = fit_bundle(frames, input_path, output, config, horizon, stations,
                                      start, last, common_end, test_start, windows, force_retrain)
    winner, fallback = report["selected_model"], report["fallback_model"]
    final_end = origin+pd.Timedelta(days=replay_days-1, hours=horizon)
    if config.get("synthetic"):
        weather = load_synthetic_weather(origin, final_end, stations, config["timezone"])
    elif live:
        weather = load_live_weather(origin, horizon, stations, config["timezone"], Path(config["cache"]), history.event,
                                    output.parent/"weather-live.json")
    else:
        weather = load_weather(origin, final_end, stations, config["timezone"], Path(config["cache"]), history.event)
        weather.manifest["mode"] = "dataset"
    weather.manifest["status"] = "ready"
    weather.manifest["training_start"] = str(start)
    weather.manifest["snapshot_sha256"] = model_cache.digest(output.parent/"weather-training.csv")
    forecasts, replay, weather_rows, quality, warnings, decisions = [], [], [], [], [], []
    effective_models = set()
    for day in range(replay_days):
        current = origin+pd.Timedelta(days=day)
        history.event(f"WEATHER_FORECAST {day+1}/{replay_days}")
        for tid, frame in frames.items():
            x, predictions, fresh, wet = predict(frame, tid, current, horizon, final_models, weather, last)
            if not wet.all():
                raise ValueError(f"Нет полного погодного прогноза для турбины {tid} на {current}; результат не опубликован")
            selected = winner if fresh else fallback
            history.event(f"WEATHER_ROUTE {tid} {selected} {'fresh' if fresh else 'stale'}")
            decisions.append({"origin": str(current), "turbine_id": tid, "model": selected,
                              "reason": "fresh_measurements" if fresh else "stale_measurements",
                              "policy": "validation_mae_then_rmse"})
            values = predictions[selected]
            effective_models.add(selected)
            for i, target in enumerate(x.index):
                record = {"time": str(target), "turbine_id": tid, "prediction": float(values[i]), "model": selected}
                if day == 0:
                    forecasts.append(record)
                replay.append({"origin": str(current), "lead": i+1, **record})
            weather_rows.extend([{"origin": str(current), **r} for r in weather.forecast_rows(tid, current, horizon)])
            if day == 0:
                age = max(0., (current-frame.power.last_valid_index()-pd.Timedelta(hours=1)).total_seconds()/3600)
                quality.append({"turbine_id": tid, "full_hours": int(frame.power.notna().sum()),
                                "incomplete_hours": int(frame.power.isna().sum()), "hours": len(frame),
                                "last_complete_hour": str(frame.power.last_valid_index()), "age_hours": age,
                                "forecast_model": selected})
                if not fresh:
                    warnings.append(f"Турбина {tid}: свежих измерений нет; выбран {NAMES[selected]} по временной валидации.")
    validate_forecast(replay, frames, origin, horizon, replay_days)
    weather.manifest["forecast"] = weather_rows[:horizon*len(frames)]
    weather.manifest["forecast_sha256"] = hashlib.sha256(json.dumps(weather_rows, sort_keys=True).encode()).hexdigest()
    (output.parent/"weather.json").write_text(json.dumps(weather.manifest, ensure_ascii=False, allow_nan=False), encoding="utf-8")
    pd.DataFrame(replay).assign(data_source="synthetic" if config.get("synthetic") else "user_import").to_csv(output.parent/"replay.csv", index=False)
    (output.parent/"weather-forecast.json").write_text(json.dumps(weather_rows, ensure_ascii=False, allow_nan=False), encoding="utf-8")
    warnings.extend([f"Часовой пояс измерений: {config['timezone']}.",
                     "Ветер на высоте 100 м — признак погодной модели; высота ротора турбины неизвестна."])
    if not live and not config.get("synthetic"):
        warnings.append("Архивная погода выбрана с запасом 12 часов; точное время публикации отсутствует в API.")
    if config.get("synthetic"):
        warnings.append("Синтетическая демонстрация: измерения и погода вымышлены; метрики не характеризуют реальную ВЭС.")
    history.event("WEATHER_ANALYSIS")
    result = {"schema_version": 5, "pipeline_version": "weather-bundles-v5",
              "data_source": "synthetic" if config.get("synthetic") else "user_import", "mode": "live" if live else "dataset",
              "origin": str(origin), "origin_utc": utc_times([origin], config["timezone"])[0].isoformat(), "horizon": horizon,
              "decisions": decisions,
              "unit": "normalized_power", "selected_model": winner, "model_name": NAMES[winner], "fallback_model": fallback,
              "forecasts": forecasts, "quality": quality, "warnings": warnings,
              "weather": weather.manifest,
              **{k: report[k] for k in ["training", "validation", "backtest", "analysis"]},
              "replay": {"days": replay_days, "origins": replay_days, "rows": len(replay), "start": str(origin),
                         "end_origin": str(origin+pd.Timedelta(days=replay_days-1)), "models": sorted(effective_models),
                         "measurements_frozen_at": str(last), "actual_available": False}}
    output.write_text(json.dumps(result, ensure_ascii=False, allow_nan=False), encoding="utf-8")
    history.event("Временная проверка завершена, прогноз сформирован")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--input", required=True, type=Path)
    p.add_argument("--output", required=True, type=Path)
    p.add_argument("--horizon", required=True, type=int, choices=[24, 48])
    p.add_argument("--origin", required=True)
    p.add_argument("--config", required=True, type=Path)
    p.add_argument("--replay-days", type=int, default=1)
    p.add_argument("--force-retrain", action="store_true")
    args = p.parse_args()
    try:
        if not 1 <= args.replay_days <= 31:
            raise ValueError("Повторные прогнозы ограничены 31 днём")
        run(args.input, args.output, args.horizon, args.origin, args.config, args.replay_days, args.force_retrain)
    except Exception as exc:
        print(f"{type(exc).__name__}: {exc}", file=sys.stderr)
        sys.exit(1)
