"""Open-Meteo archived forecast offsets, never observations or reanalysis.

previous_dayN is at least N*24 hours before valid time according to the provider.
Select offsets with a further 12-hour publication margin. This is a conservative
availability bound, not an exact run issuance timestamp (the API omits that).
"""
from __future__ import annotations

import hashlib
import json
import math
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import numpy as np
import pandas as pd

BASE = "https://previous-runs-api.open-meteo.com/v1/forecast"
LIVE_BASE = "https://api.open-meteo.com/v1/forecast"
MODEL = "icon_global"
VARIABLES = ["wind_speed_100m", "wind_direction_100m", "temperature_2m"]
MARGIN_HOURS = 12
WEATHER_FEATURES = ["nwp_wind_100m", "nwp_temperature_2m", "nwp_direction_sin",
                    "nwp_direction_cos", "nwp_wind_cubed"]
DEFAULT_STATIONS = [{"id": 1, "latitude": 43.645150, "longitude": 78.535604},
                    {"id": 2, "latitude": 43.643198, "longitude": 78.538828}]


def utc_times(times, zone):
    # The repeated hour at Kazakhstan's 2024 clock change has no unique mapping
    # in the source CSV. Exclude it from model samples instead of guessing.
    return pd.DatetimeIndex(times).tz_localize(zone, ambiguous="NaT", nonexistent="NaT").tz_convert("UTC")


def offsets_for(times, origin, zone):
    valid = utc_times(times, zone)
    issue = utc_times([origin], zone)[0]
    hours = np.asarray((valid-issue).total_seconds()/3600, dtype=float)
    offsets = np.maximum(1, np.ceil((hours+MARGIN_HOURS)/24))
    return valid, issue, offsets


def request_json(url, cache, immutable, emit):
    key = hashlib.sha256(url.encode()).hexdigest()
    path = cache/f"{key}.json"
    if path.exists():
        saved = json.loads(path.read_text(encoding="utf-8"))
        if immutable or time.time()-path.stat().st_mtime < 3600:
            return saved, path
    for attempt in range(3):
        try:
            req = Request(url, headers={"User-Agent": "SAMAL/2.0 educational wind forecasting"})
            with urlopen(req, timeout=50) as response:
                payload = json.loads(response.read(24*1024*1024))
            if isinstance(payload, dict) and payload.get("error"):
                raise ValueError(str(payload.get("reason", "Weather API error")))
            saved = {"url": url, "retrieved_at": datetime.now(timezone.utc).isoformat(), "payload": payload}
            temp = path.with_suffix(".tmp")
            temp.write_text(json.dumps(saved, ensure_ascii=False, allow_nan=False), encoding="utf-8")
            temp.replace(path)
            return saved, path
        except (HTTPError, URLError, TimeoutError, OSError) as exc:
            if isinstance(exc, HTTPError) and exc.code not in [429, 500, 502, 503, 504]:
                raise RuntimeError(f"Open-Meteo HTTP {exc.code}: {exc.read(500).decode(errors='replace')}") from exc
            if attempt == 2:
                raise RuntimeError(f"Open-Meteo недоступен после 3 попыток: {exc}") from exc
            emit(f"WEATHER_RETRY {attempt+1}")
            time.sleep(5*(attempt+1))


class Weather:
    def __init__(self, tables, zone, manifest):
        self.tables, self.zone, self.manifest = tables, zone, manifest

    def features(self, tid, origin, horizon):
        times = pd.date_range(origin, periods=horizon, freq="h")
        valid, issue, offsets = offsets_for(times, origin, self.zone)
        out = pd.DataFrame(index=times, columns=WEATHER_FEATURES, dtype=float)
        for days in [1, 2, 3]:
            mask = offsets == days
            if not mask.any():
                continue
            positions = np.flatnonzero(mask)
            rows = self.tables[tid].reindex(valid[positions])
            wind = rows[f"wind_speed_100m_previous_day{days}"].to_numpy(dtype=float)
            direction = np.deg2rad(rows[f"wind_direction_100m_previous_day{days}"].to_numpy(dtype=float))
            temperature = rows[f"temperature_2m_previous_day{days}"].to_numpy(dtype=float)
            out.iloc[positions] = np.column_stack([wind, temperature, np.sin(direction), np.cos(direction), wind**3])
        return out

    def forecast_rows(self, tid, origin, horizon):
        x = self.features(tid, origin, horizon)
        valid, issue, offsets = offsets_for(x.index, origin, self.zone)
        rows = []
        for i, target in enumerate(x.index):
            bound = valid[i]-pd.Timedelta(hours=24*int(offsets[i]))
            if bound+pd.Timedelta(hours=MARGIN_HOURS) > issue:
                raise ValueError("Погодный прогноз новее допустимого момента")
            rows.append({"time": str(target), "valid_time_utc": valid[i].isoformat(), "turbine_id": tid,
                         "forecast_reference_upper_bound_utc": bound.isoformat(),
                         "previous_days": int(offsets[i]), "wind_100m": float(x.iloc[i].nwp_wind_100m),
                         "temperature_2m": float(x.iloc[i].nwp_temperature_2m)})
        return rows


def load_weather(start, end, stations, zone, cache: Path, emit):
    cache.mkdir(parents=True, exist_ok=True)
    # Query UTC days; local times are converted explicitly during feature joins.
    start = (pd.Timestamp(start)-pd.Timedelta(days=1)).normalize()
    end = (pd.Timestamp(end)+pd.Timedelta(days=1)).normalize()
    blocks, cursor = [], start
    while cursor <= end:
        stop = min(cursor+pd.offsets.MonthEnd(0), end)
        blocks.append((cursor, stop))
        cursor = stop+pd.Timedelta(days=1)
    pieces = {int(s["id"]): [] for s in stations}
    manifest = {"provider": "Open-Meteo", "model": MODEL, "api": BASE,
                "documentation": "https://open-meteo.com/en/docs/previous-runs-api",
                "license": "CC BY 4.0; free API for non-commercial use", "source_timezone": zone,
                "timezone_assumed": True, "publication_margin_hours": MARGIN_HOURS,
                "availability": "provider_fixed_lead_with_margin; exact issuance time not supplied",
                "variables": VARIABLES, "wind_height_m": 100, "stations": stations, "requests": []}
    for index, (left, right) in enumerate(blocks, 1):
        emit(f"WEATHER_FETCH {index}/{len(blocks)} {left.date()}")
        query = {"latitude": ",".join(str(s["latitude"]) for s in stations),
                 "longitude": ",".join(str(s["longitude"]) for s in stations),
                 "hourly": ",".join(f"{v}_previous_day{day}" for day in [1, 2, 3] for v in VARIABLES),
                 "models": MODEL, "start_date": str(left.date()), "end_date": str(right.date()),
                 "timezone": "UTC", "wind_speed_unit": "ms"}
        url = BASE+"?"+urlencode(query)
        immutable = right < pd.Timestamp.now(tz="UTC").tz_localize(None).normalize()-pd.Timedelta(days=8)
        saved, path = request_json(url, cache, immutable, emit)
        payloads = saved["payload"] if isinstance(saved["payload"], list) else [saved["payload"]]
        if len(payloads) != len(stations):
            raise ValueError("Open-Meteo вернул неверное число координат")
        manifest["requests"].append({"url": url, "retrieved_at": saved["retrieved_at"],
                                     "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                                     "grid_points": [{"latitude": p["latitude"], "longitude": p["longitude"]} for p in payloads]})
        for station, payload in zip(stations, payloads):
            for day in [1, 2, 3]:
                if payload.get("hourly_units", {}).get(f"wind_speed_100m_previous_day{day}") != "m/s":
                    raise ValueError("Неверные единицы скорости ветра Open-Meteo")
            frame = pd.DataFrame(payload["hourly"])
            frame.index = pd.to_datetime(frame.pop("time"), utc=True)
            pieces[int(station["id"])].append(frame)
    tables = {tid: pd.concat(parts).sort_index() for tid, parts in pieces.items()}
    for tid in tables:
        tables[tid] = tables[tid].loc[~tables[tid].index.duplicated(keep="last")]
    return Weather(tables, zone, manifest)


class LiveWeather(Weather):
    """Latest forecast received now. Never used for historical evaluation."""

    def features(self, tid, origin, horizon):
        times = pd.date_range(origin, periods=horizon, freq="h")
        rows = self.tables[tid].reindex(utc_times(times, self.zone))
        wind = rows.wind_speed_100m.to_numpy(dtype=float)
        direction = np.deg2rad(rows.wind_direction_100m.to_numpy(dtype=float))
        temperature = rows.temperature_2m.to_numpy(dtype=float)
        return pd.DataFrame(np.column_stack([wind, temperature, np.sin(direction),
                                            np.cos(direction), wind**3]), index=times, columns=WEATHER_FEATURES)

    def forecast_rows(self, tid, origin, horizon):
        x = self.features(tid, origin, horizon)
        valid = utc_times(x.index, self.zone)
        return [{"time": str(target), "valid_time_utc": valid[i].isoformat(), "turbine_id": tid,
                 "retrieved_at": self.manifest["requests"][0]["retrieved_at"],
                 "previous_days": None, "wind_100m": float(x.iloc[i].nwp_wind_100m),
                 "temperature_2m": float(x.iloc[i].nwp_temperature_2m)} for i, target in enumerate(x.index)]


def load_live_weather(origin, horizon, stations, zone, cache, emit, snapshot_path):
    cache.mkdir(parents=True, exist_ok=True)
    emit("WEATHER_LIVE_FETCH")
    valid = utc_times(pd.date_range(origin, periods=horizon, freq="h"), zone)
    query = {"latitude": ",".join(str(s["latitude"]) for s in stations),
             "longitude": ",".join(str(s["longitude"]) for s in stations),
             "hourly": ",".join(VARIABLES), "models": MODEL,
             "start_date": str(valid[0].date()), "end_date": str(valid[-1].date()),
             "timezone": "UTC", "wind_speed_unit": "ms"}
    saved, _ = request_json(LIVE_BASE+"?"+urlencode(query), cache, False, emit)
    snapshot_path.write_text(json.dumps(saved, ensure_ascii=False, allow_nan=False), encoding="utf-8")
    payloads = saved["payload"] if isinstance(saved["payload"], list) else [saved["payload"]]
    if len(payloads) != len(stations):
        raise ValueError("Open-Meteo вернул неверное число координат")
    tables = {}
    for station, payload in zip(stations, payloads):
        units = payload.get("hourly_units", {})
        if units.get("wind_speed_100m") != "m/s" or units.get("temperature_2m") != "°C":
            raise ValueError("Неверные единицы погодных данных")
        frame = pd.DataFrame(payload["hourly"])
        frame.index = pd.to_datetime(frame.pop("time"), utc=True)
        if frame.index.has_duplicates:
            raise ValueError("Погодный ответ содержит повторные часы")
        if (frame.wind_speed_100m.dropna() < 0).any():
            raise ValueError("Погодный ответ содержит отрицательную скорость ветра")
        tables[int(station["id"])] = frame
    manifest = {"provider": "Open-Meteo", "model": MODEL, "api": LIVE_BASE, "mode": "live",
                "documentation": "https://open-meteo.com/en/docs", "license": "CC BY 4.0",
                "source_timezone": zone, "publication_margin_hours": 0, "wind_height_m": 100,
                "availability": "received_now; exact model issuance time not supplied", "variables": VARIABLES,
                "stations": stations, "requests": [{"url": saved["url"], "retrieved_at": saved["retrieved_at"],
                "sha256": hashlib.sha256(snapshot_path.read_bytes()).hexdigest(),
                "grid_points": [{"latitude": p["latitude"], "longitude": p["longitude"]} for p in payloads]}]}
    return LiveWeather(tables, zone, manifest)


def combine_weather(*items):
    tables = {tid: pd.concat([w.tables[tid] for w in items]).sort_index() for tid in items[0].tables}
    tables = {tid: frame.loc[~frame.index.duplicated(keep="last")] for tid, frame in tables.items()}
    manifest = dict(items[0].manifest)
    manifest["requests"] = [r for w in items for r in w.manifest["requests"]]
    return Weather(tables, items[0].zone, manifest)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", required=True)
    parser.add_argument("--end", required=True)
    parser.add_argument("--cache", type=Path, default=Path("runtime/weather-cache"))
    args = parser.parse_args()
    weather = load_weather(args.start, args.end, DEFAULT_STATIONS, "Asia/Almaty", args.cache,
                           lambda value: print(value, flush=True))
    print(json.dumps({tid: {"hours": len(frame), "complete_hours": int(frame.notna().all(axis=1).sum())}
                      for tid, frame in weather.tables.items()}), flush=True)
