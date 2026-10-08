"""Deterministic invented measurements and weather; never derived from private CSVs.

This deliberately learnable toy system exercises the pipeline, not real accuracy.
"""
import numpy as np
import pandas as pd

from weather import LiveWeather, VARIABLES, utc_times

CSV_HEADERS = ["ID", "Статистическое время", "Средняя скорость ветра(m/s)",
               "Нормализованная активная мощность", "Средняя температура окружающей среды(°C)"]
START = pd.Timestamp("2025-08-01")
END = pd.Timestamp("2026-01-01")


def signals(times, tid):
    hours = np.asarray((pd.DatetimeIndex(times)-pd.Timestamp("2025-01-01", tz=pd.DatetimeIndex(times).tz)).total_seconds()/3600)
    wind = np.maximum(.2, 7+3.1*np.sin(hours/19+tid*.3)+2.2*np.sin(hours/71)+1.3*np.sin(hours/5.7))
    direction = (180+90*np.sin(hours/30+tid)) % 360
    temperature = 9+12*np.sin(hours/(24*58))+4*np.cos(hours/24*2*np.pi)
    return wind, direction, temperature


def measurements(end=END):
    times = pd.date_range(START, end, inclusive="left", freq="10min")
    parts = []
    for tid in [1, 2]:
        wind, _, temperature = signals(times, tid)
        rng = np.random.default_rng(420+tid)
        measured_wind = np.clip(wind+rng.normal(0, .3, len(times)), 0, None)
        power = np.clip(((measured_wind-3)/9)**3, 0, 1)
        power = np.clip(power+rng.normal(0, .025, len(times)), 0, 1)
        power[(np.arange(len(times))+tid*111) % 3700 < 25] = 0  # Invented outages.
        parts.append(pd.DataFrame({"turbine_id": tid, "time": times, "wind": measured_wind.round(5),
                                   "power": power.round(6), "temperature": temperature.round(4)}))
    return pd.concat(parts, ignore_index=True)


def write_imports(folder):
    folder.mkdir(parents=True, exist_ok=True)
    raw = measurements()
    for tid, part in raw.groupby("turbine_id"):
        csv = part[["time", "wind", "power", "temperature"]].copy()
        csv.insert(0, "id", np.arange(1, len(csv)+1))
        csv.columns = CSV_HEADERS
        csv.to_csv(folder/f"synthetic turbine {tid}.csv", index=False)
    return raw


def load_synthetic_weather(start, end, stations, zone):
    times = pd.date_range(pd.Timestamp(start).floor("h"), pd.Timestamp(end).ceil("h"), freq="h")
    tables = {}
    for station in stations:
        tid = int(station["id"])
        wind, direction, temperature = signals(times, tid)
        # Synthetic forecast error; no private measurements and no network calls.
        wind = np.maximum(0, wind+.45*np.sin(np.arange(len(times))/13+tid))
        tables[tid] = pd.DataFrame(dict(zip(VARIABLES, [wind, direction, temperature])), index=utc_times(times, zone))
    manifest = {"provider": "SAMAL synthetic generator", "model": "synthetic-v1", "mode": "synthetic",
                "synthetic": True, "license": "MIT", "source_timezone": zone, "publication_margin_hours": 0,
                "wind_height_m": 100, "stations": stations, "requests": [],
                "availability": "invented demonstration weather; not an operational forecast"}
    return SyntheticWeather(tables, zone, manifest)


class SyntheticWeather(LiveWeather):
    def forecast_rows(self, tid, origin, horizon):
        x = self.features(tid, origin, horizon)
        valid = utc_times(x.index, self.zone)
        return [{"time": str(target), "valid_time_utc": valid[i].isoformat(), "turbine_id": tid,
                 "synthetic": True, "previous_days": None, "wind_100m": float(x.iloc[i].nwp_wind_100m),
                 "temperature_2m": float(x.iloc[i].nwp_temperature_2m)} for i, target in enumerate(x.index)]
