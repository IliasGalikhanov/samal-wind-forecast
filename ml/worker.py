"""Reproducible, observation-only direct multi-horizon forecasting.

All timestamps are naive source-local times; a row labels the start of its
configured measurement interval. Only complete hours are targets.
No weather at or after an origin is used as a model feature.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from catboost import CatBoostRegressor

NAMES = {"catboost": "CatBoost · RMSE", "catboost_mae": "CatBoost · MAE",
         "persistence": "Последнее измерение", "seasonal": "Сезонный профиль"}
FEATURES = ["turbine_id", "lead", "hour_sin", "hour_cos", "year_sin", "year_cos",
            "p0", "p1", "p6", "p12", "p24", "p48", "power_mean_6", "power_mean_24",
            "power_std_24", "wind0", "wind_mean_6", "temperature0", "recent_coverage"]
FEATURES += [f"{col}_{stat}_{window}" for col in ["power", "wind", "temperature"]
             for window in [3, 12, 24, 72] for stat in ["avg", "sd", "min", "max"]]
FEATURES += [f"{col}_lag_{lag}" for col in ["power", "wind", "temperature"] for lag in [2, 3, 6, 12, 24, 48, 72]]
FEATURES += ["power_ramp_3", "wind_ramp_3", "power_ramp_12", "wind_ramp_12"]
MODEL_PARAMS = dict(iterations=320, depth=6, learning_rate=.05, l2_leaf_reg=8,
                    random_seed=42, thread_count=4, verbose=False, allow_writing_files=False)


def event(message: str) -> None:
    print(json.dumps({"message": message}, ensure_ascii=False), flush=True)


def hourly(raw: pd.DataFrame) -> dict[int, pd.DataFrame]:
    result = {}
    raw = raw.copy()
    raw["time"] = pd.to_datetime(raw["time"])
    for tid, group in raw.groupby("turbine_id"):
        group = group.set_index("time").sort_index()
        if group.index.duplicated().any():
            raise ValueError("Дублирующиеся измерения в снимке данных")
        frame = group[["power", "wind", "temperature"]].resample("h").mean()
        frame["samples"] = group["power"].resample("h").count()
        intervals = group['sample_minutes'].unique() if 'sample_minutes' in group else [10]
        if len(intervals) != 1 or intervals[0] not in (5, 10, 15, 20, 30, 60):
            raise ValueError("Некорректный интервал измерений")
        interval = int(intervals[0])
        if ((group.index.minute % interval != 0) | (group.index.second != 0)).any():
            raise ValueError("Измерения не совпадают с временной сеткой")
        frame.loc[frame.samples != 60 // interval, ["power", "wind", "temperature"]] = np.nan
        result[int(tid)] = frame
    return result


def features(frame: pd.DataFrame, tid: int, origin: pd.Timestamp, horizon: int) -> pd.DataFrame:
    # Exact grid lookup deliberately preserves missing hours instead of sliding lags.
    history = frame.reindex(pd.date_range(origin - pd.Timedelta(hours=72), periods=72, freq="h"))
    targets = pd.date_range(origin, periods=horizon, freq="h")
    def val(col: str, lag: int):
        return float(history[col].iloc[-1-lag])
    base = {"turbine_id": tid, "p0": val("power", 0), "p1": val("power", 1),
            "p6": val("power", 6), "p12": val("power", 12), "p24": val("power", 24),
            "p48": val("power", 48), "power_mean_6": history.power.iloc[-6:].mean(),
            "power_mean_24": history.power.iloc[-24:].mean(), "power_std_24": history.power.iloc[-24:].std(),
            "wind0": val("wind", 0), "wind_mean_6": history.wind.iloc[-6:].mean(),
            "temperature0": val("temperature", 0), "recent_coverage": history.power.iloc[-24:].notna().mean()}
    for col in ["power", "wind", "temperature"]:
        for window in [3, 12, 24, 72]:
            recent = history[col].iloc[-window:]
            base.update({f"{col}_avg_{window}": recent.mean(), f"{col}_sd_{window}": recent.std(),
                         f"{col}_min_{window}": recent.min(), f"{col}_max_{window}": recent.max()})
        for lag in [2, 3, 6, 12, 24, 48, 72]:
            base[f"{col}_lag_{lag}"] = val(col, lag-1)
    for window in [3, 12]:
        for col in ["power", "wind"]:
            base[f"{col}_ramp_{window}"] = val(col, 0)-val(col, window)
    out = pd.DataFrame(base, index=targets)
    out["lead"] = np.arange(1, horizon + 1)
    out["hour_sin"] = np.sin(2*np.pi*targets.hour/24)
    out["hour_cos"] = np.cos(2*np.pi*targets.hour/24)
    out["year_sin"] = np.sin(2*np.pi*targets.dayofyear/365.25)
    out["year_cos"] = np.cos(2*np.pi*targets.dayofyear/365.25)
    return out[FEATURES].astype(float)


def samples(frames: dict[int, pd.DataFrame], cutoff: pd.Timestamp):
    xs, ys = [], []
    for tid, frame in frames.items():
        start = max(frame.index.min() + pd.Timedelta(hours=72), cutoff - pd.Timedelta(days=730)).ceil("12h")
        for origin in pd.date_range(start, cutoff - pd.Timedelta(hours=48), freq="12h"):
            x = features(frame, tid, origin, 48)
            y = frame.power.reindex(x.index)
            mask = y.notna() & (x.recent_coverage >= .5)
            if mask.any():
                xs.append(x[mask]); ys.append(y[mask])
    if not xs:
        raise ValueError("Недостаточно полных часов для обучения. Загрузите не менее 90 дней измерений")
    return pd.concat(xs, ignore_index=True), pd.concat(ys, ignore_index=True)


def fit(frames, cutoff, objective="RMSE", training=None):
    x, y = samples(frames, cutoff) if training is None else training
    if len(y) < 500:
        raise ValueError("Недостаточно полных измерений для обучения и временной проверки")
    model = CatBoostRegressor(**MODEL_PARAMS, loss_function=objective)
    model.fit(x, y)
    return model, len(y)


def fit_candidates(frames, cutoff):
    training = samples(frames, cutoff)
    return {key: fit(frames, cutoff, objective, training)[0]
            for key, objective in [("catboost", "RMSE"), ("catboost_mae", "MAE")]}, len(training[1])


def seasonal_profile(frame, cutoff):
    past = frame.loc[frame.index < cutoff, "power"].dropna()
    if past.empty:
        raise ValueError("Нет полных часов для сезонного профиля")
    values = past.groupby([past.index.month, past.index.hour]).mean()
    by_hour = past.groupby(past.index.hour).mean()
    return values, by_hour, float(past.mean())


def seasonal_predict(profile, times):
    values, by_hour, mean = profile
    return np.array([values.get((t.month, t.hour), by_hour.get(t.hour, mean)) for t in times], dtype=float)


def backtest(frames, models, start, end, profile_cutoff):
    records = []
    for tid, frame in frames.items():
        profile = seasonal_profile(frame, profile_cutoff)
        for origin in pd.date_range(start, end-pd.Timedelta(hours=24), freq="24h"):
            x = features(frame, tid, origin, 48)
            actual = frame.power.reindex(x.index)
            season = seasonal_predict(profile, x.index)
            predictions = {key: np.clip(model.predict(x), 0, 1) for key, model in models.items()}
            stale = bool(x.recent_coverage.iloc[0] < .5 or pd.isna(x.p0.iloc[0]))
            if stale:
                predictions = {key: season.copy() for key in models}
            persistence = np.repeat(x.p0.iloc[0], len(x)) if not pd.isna(x.p0.iloc[0]) else season.copy()
            for i, t in enumerate(x.index):
                if t >= end or pd.isna(actual.iloc[i]):
                    continue
                records.append({"turbine_id": tid, "origin": str(origin), "time": str(t), "lead": i+1,
                                "actual": float(actual.iloc[i]), **{key: float(p[i]) for key, p in predictions.items()},
                                "persistence": float(persistence[i]), "seasonal": float(season[i])})
    return pd.DataFrame(records)


def metrics(frame, key):
    if frame.empty:
        return {"mae": None, "rmse": None, "n": 0}
    error = frame[key].to_numpy()-frame.actual.to_numpy()
    return {"mae": float(np.mean(np.abs(error))), "rmse": float(np.sqrt(np.mean(error**2))), "n": len(error)}


def validation_windows(test_start, folds=4, days=14):
    return [(test_start-pd.Timedelta(days=days*(folds-i)),
             test_start-pd.Timedelta(days=days*(folds-i-1))) for i in range(folds)]


def choose_model(selection, horizon):
    # Only out-of-fold predictions enter selection. Test values cannot enter here.
    eligible = selection[selection.lead <= horizon]
    scores = {key: metrics(eligible, key) for key in NAMES}
    if eligible.empty:
        raise ValueError("В периоде проверки недостаточно полных часов")
    winner = min(NAMES, key=lambda key: (scores[key]["mae"], scores[key]["rmse"]))
    return winner, scores


def main(input_path: Path, output: Path, horizon: int, origin_text: str):
    event("Проверка полноты часов и подготовка признаков")
    raw = pd.read_csv(input_path)
    frames = hourly(raw)
    if not frames:
        raise ValueError("Нет измерений для прогноза")
    if any(not f.power.notna().any() for f in frames.values()):
        raise ValueError("В каждой загруженной турбине должен быть хотя бы один полный час измерений")
    # Validation uses the common coverage window of all imported turbines.
    common_end = (min(f.power.last_valid_index() for f in frames.values()) + pd.Timedelta(hours=1)).floor("D")
    common_start = max(f.power.first_valid_index() for f in frames.values() if f.power.notna().any())
    if common_end-common_start < pd.Timedelta(days=90):
        raise ValueError("Для обучения и проверки нужно не менее 90 дней с полными часами")
    test_start = common_end.floor("D")-pd.Timedelta(days=14)
    windows = validation_windows(test_start)
    selection_start = windows[0][0]
    folds, validation_frames = [], []
    for index, (start, end) in enumerate(windows, 1):
        event(f"Временная валидация {index}/4: обучение двух вариантов CatBoost")
        candidates, _ = fit_candidates(frames, start)
        fold = backtest(frames, candidates, start, end, start)
        validation_frames.append(fold)
        _, fold_metrics = choose_model(fold, horizon)
        folds.append({"start": str(start), "end_exclusive": str(end), "training_cutoff": str(start), "models": fold_metrics})
    selection = pd.concat(validation_frames, ignore_index=True)
    winner, selection_metrics = choose_model(selection, horizon)
    event(f"Выбрана модель: {NAMES[winner]}. Проверка на следующих 14 днях")
    # Freeze the choice, then fit up to the start of the final audit, never beyond it.
    candidates, training_rows = fit_candidates(frames, test_start)
    candidates[winner if winner in candidates else "catboost"].save_model(str(output.parent/"validation-model.cbm"))
    audit = backtest(frames, candidates, test_start, common_end, test_start)
    audit = audit[audit.lead <= horizon]
    if audit.empty:
        raise ValueError("В тестовом периоде недостаточно полных часов")
    audit_metrics = {key: metrics(audit, key) for key in NAMES}
    breakdown = []
    for tid in frames:
        for low, high in [(1,24), (25,48)]:
            subset = audit[(audit.turbine_id == tid) & audit.lead.between(low,high)]
            breakdown.append({"turbine_id": tid,"horizon":f"{low}–{high}",**metrics(subset,winner)})
    # Model choice is frozen before inspecting this audit period.
    test_points = audit[audit.lead <= 24].copy()
    test_points["prediction"] = test_points[winner]
    test_points = test_points[["time","turbine_id","actual","prediction"]].to_dict("records")
    origin = pd.Timestamp(origin_text)
    last = max(f.index.max() for f in frames.values())+pd.Timedelta(hours=1)
    if origin < last:
        raise ValueError("Начало прогноза не должно предшествовать последним измерениям")
    event("Подготовка итогового прогноза на доступной истории")
    final_model = None
    if winner.startswith("catboost"):
        final_model, _ = fit(frames, last, "MAE" if winner == "catboost_mae" else "RMSE")
        final_model.save_model(str(output.parent/"model.cbm"))
    forecasts, warnings, quality = [], [], []
    for tid, frame in frames.items():
        profile = seasonal_profile(frame, last)
        x = features(frame, tid, origin, horizon)
        season = seasonal_predict(profile,x.index)
        age = max(0., (origin-(frame.power.last_valid_index()+pd.Timedelta(hours=1))).total_seconds()/3600)
        stale = age > 0 or x.recent_coverage.iloc[0] < .5
        model_name = "seasonal" if stale else winner
        if stale:
            warnings.append(f"Турбина {tid}: свежих полных часов недостаточно, использован сезонный профиль. Давность: {age:g} ч.")
        if model_name.startswith("catboost"):
            predictions = np.clip(final_model.predict(x),0,1)
        elif model_name == "persistence":
            predictions = np.repeat(x.p0.iloc[0],horizon)
        else:
            predictions = season
        if not np.isfinite(predictions).all():
            raise ValueError("Модель вернула нечисловой прогноз")
        for t,p in zip(x.index,predictions):
            forecasts.append({"time":str(t),"turbine_id":tid,"prediction":float(p),"model":model_name})
        quality.append({"turbine_id":tid,"full_hours":int(frame.power.notna().sum()),"incomplete_hours":int(frame.power.isna().sum()),
                        "hours":len(frame),"last_complete_hour":str(frame.power.last_valid_index()),"age_hours":age})
    warnings.extend(["Внешние прогнозы погоды не используются. Прогноз построен по истории измерений.",
                     "Часовой пояс не задан в источнике. Время сохранено как в CSV; отметка принята за начало интервала."])
    result = {"schema_version":2,"pipeline_version":"rolling-4fold-rich-lags-v2","origin":str(origin),"horizon":horizon,"unit":"normalized_power",
              "selected_model":winner,"model_name":NAMES[winner],"forecasts":forecasts,"warnings":warnings,"quality":quality,
              "training":{"rows":training_rows,"cutoff":str(test_start),"final_cutoff":str(last),
                          "seed":42,"features":FEATURES,"parameters":MODEL_PARAMS,
                          "input_sha256":hashlib.sha256(input_path.read_bytes()).hexdigest()},
              "validation":{"start":str(selection_start),"end_exclusive":str(test_start),"models":selection_metrics,"folds":folds},
              "backtest":{"start":str(test_start),"end_exclusive":str(common_end),"models":audit_metrics,
                          "selected":audit_metrics[winner],"breakdown":breakdown,"points":test_points,
                          "method":"Выбор по четырём последовательным 14-дневным отрезкам с переобучением до начала каждого отрезка. Последние 14 дней не участвуют в выборе. На тесте обучение зафиксировано; доступны только прошлые измерения. Метрики ограничены запрошенным горизонтом."}}
    output.write_text(json.dumps(result,ensure_ascii=False,allow_nan=False),encoding="utf-8")
    event("Временная проверка завершена, прогноз сформирован")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input",required=True,type=Path)
    parser.add_argument("--output",required=True,type=Path)
    parser.add_argument("--horizon",required=True,type=int,choices=[24,48])
    parser.add_argument("--origin",required=True)
    args = parser.parse_args()
    try:
        main(args.input,args.output,args.horizon,args.origin)
    except Exception as exc:
        print(f"{type(exc).__name__}: {exc}",file=sys.stderr)
        sys.exit(1)
