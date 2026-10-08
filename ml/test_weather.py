import numpy as np
import pandas as pd
from catboost import CatBoostRegressor

import weather
import weather_worker
import pytest
import json
from urllib.error import URLError, HTTPError
from urllib.parse import urlparse, parse_qs


def fixture_weather():
    times = pd.date_range('2025-01-01', periods=240, freq='h', tz='UTC')
    columns = {f'{name}_previous_day{day}': np.full(len(times), day*10.)
               for day in [1, 2, 3] for name in weather.VARIABLES}
    frame = pd.DataFrame(columns, index=times)
    return weather.Weather({1:frame}, 'Asia/Almaty', {})


def test_archived_forecasts_are_available_before_every_origin():
    # Every hour of the local day, both supported horizons, including changes
    # between previous_day1/2/3. No day-0 or post-origin vintage can be selected.
    for hour in range(24):
        origin = pd.Timestamp('2025-01-02')+pd.Timedelta(hours=hour)
        for horizon in [24, 48]:
            times = pd.date_range(origin, periods=horizon, freq='h')
            valid, issued, days = weather.offsets_for(times, origin, 'Asia/Almaty')
            assert set(days).issubset({1, 2, 3})
            bounds = valid-pd.to_timedelta(days*24, unit='h')+pd.Timedelta(hours=weather.MARGIN_HOURS)
            assert (bounds <= issued).all()


def test_weather_joins_utc_to_local_and_ignores_newer_vintages():
    w = fixture_weather()
    origin = pd.Timestamp('2025-01-02')
    before = w.features(1, origin, 48)
    assert before.iloc[0].nwp_wind_100m == 10
    assert before.iloc[-1].nwp_wind_100m == 30
    # day1 is unavailable at the end of a 48h horizon; corrupting it must have no effect.
    target_utc = weather.utc_times([origin+pd.Timedelta(hours=47)], w.zone)[0]
    w.tables[1].loc[target_utc,'wind_speed_100m_previous_day1']=999
    after=w.features(1,origin,48)
    pd.testing.assert_frame_equal(before, after)
    assert target_utc.hour == 18


def test_ambiguous_source_hour_is_excluded():
    # Kazakhstan moved from UTC+6 to UTC+5. The repeated local hour has no
    # disambiguating offset in the source CSV.
    mapped=weather.utc_times(['2024-02-29 23:00:00'], 'Asia/Almaty')
    assert pd.isna(mapped[0])


def test_weather_only_model_cannot_see_future_turbine_values():
    forbidden=set(history_name for history_name in weather_worker.history.FEATURES if history_name not in weather_worker.CALENDAR)
    assert not forbidden.intersection(weather_worker.COLUMNS['catboost_weather_only'])
    frame=pd.DataFrame({'power':.5,'wind':8.,'temperature':10.,'samples':6},index=pd.date_range('2025-01-01',periods=240,freq='h'))
    origin=pd.Timestamp('2025-01-04')
    w=fixture_weather()
    before=weather_worker.feature_frame(frame,1,origin,48,w)
    frame.loc[origin:,['power','wind','temperature']]=999
    pd.testing.assert_frame_equal(before,weather_worker.feature_frame(frame,1,origin,48,w))


def test_training_cutoff_purges_all_later_labels(monkeypatch):
    captured=[]
    class Spy:
        def __init__(self,**kwargs): pass
        def fit(self,x,y): captured.append(y.copy())
    monkeypatch.setattr(weather_worker,'CatBoostRegressor',Spy)
    cutoff=pd.Timestamp('2025-06-01')
    count=600
    x=pd.DataFrame({col:np.zeros(count) for col in weather_worker.COLUMNS['catboost_weather_only']})
    dates=pd.DataFrame({'origin':[cutoff-pd.Timedelta(days=3)]*count,'target':[cutoff-pd.Timedelta(hours=1)]*count})
    dates.loc[599,'target']=cutoff
    y=pd.Series([.5]*599+[999.])
    weather_worker.train((x,y,dates),cutoff,['catboost_weather_only'])
    assert len(captured[0])==599
    assert captured[0].max()==.5


def test_live_weather_uses_hourly_forecast_and_saves_receipt(tmp_path, monkeypatch):
    times = pd.date_range('2026-10-03', periods=72, freq='h', tz='UTC')
    payload = {'latitude': 43.6, 'longitude': 78.5,
               'hourly_units': {'wind_speed_100m': 'm/s', 'temperature_2m': '°C'},
               'hourly': {'time': times.strftime('%Y-%m-%dT%H:%M').tolist(),
                          'wind_speed_100m': [8.]*72, 'wind_direction_100m': [90.]*72, 'temperature_2m': [12.]*72}}
    def request(url, cache, immutable, emit):
        assert url.startswith(weather.LIVE_BASE+'?')
        assert 'previous_day' not in url and not immutable
        return {'url':url, 'retrieved_at':'2026-10-03T00:00:00+00:00', 'payload':payload}, tmp_path/'cache.json'
    monkeypatch.setattr(weather, 'request_json', request)
    snapshot = tmp_path/'weather-live.json'
    origin = pd.Timestamp('2026-10-03 06:00')
    w = weather.load_live_weather(origin, 48, weather.DEFAULT_STATIONS[:1], 'Asia/Almaty', tmp_path, lambda _:None, snapshot)
    features = w.features(1,origin,48)
    assert len(features)==48 and features.notna().all().all()
    assert features.iloc[0].nwp_direction_sin == 1
    assert w.forecast_rows(1,origin,48)[0]['valid_time_utc']=='2026-10-03T01:00:00+00:00'
    assert json.loads(snapshot.read_text())['payload']==payload
    w.tables[1].iloc[5,0] = np.nan
    assert not w.features(1,origin,48).notna().all(axis=1).all()


def test_live_weather_routes_custom_coordinates_and_ids(tmp_path, monkeypatch):
    stations = [{'id': 3, 'latitude': -33.9, 'longitude': 18.4},
                {'id': 7, 'latitude': 51.16, 'longitude': 71.47},
                {'id': 11, 'latitude': 48.8, 'longitude': 2.3}]
    times = pd.date_range('2026-10-03', periods=48, freq='h', tz='UTC')
    def request(url, cache, immutable, emit):
        query = parse_qs(urlparse(url).query)
        assert query['latitude'] == ['-33.9,51.16,48.8']
        assert query['longitude'] == ['18.4,71.47,2.3']
        payload = [{'latitude': s['latitude'], 'longitude': s['longitude'],
                    'hourly_units': {'wind_speed_100m':'m/s', 'temperature_2m':'°C'},
                    'hourly': {'time':times.strftime('%Y-%m-%dT%H:%M').tolist(),
                               'wind_speed_100m':[float(s['id'])]*48,
                               'wind_direction_100m':[90.]*48, 'temperature_2m':[12.]*48}} for s in stations]
        return {'url':url, 'retrieved_at':'2026-10-03T00:00:00Z', 'payload':payload}, tmp_path/'cache.json'
    monkeypatch.setattr(weather, 'request_json', request)
    origin = pd.Timestamp('2026-10-03')
    w = weather.load_live_weather(origin,48,stations,'UTC',tmp_path,lambda _:None,tmp_path/'receipt.json')
    assert set(w.tables) == {3,7,11}
    for tid in (3,7,11):
        assert (w.features(tid,origin,48).nwp_wind_100m == tid).all()


def test_temporary_weather_failure_retries_then_stops(tmp_path, monkeypatch):
    calls, events = [], []
    def fail(*args, **kwargs):
        calls.append(1)
        raise URLError('temporary failure')
    monkeypatch.setattr(weather, 'urlopen', fail)
    monkeypatch.setattr(weather.time, 'sleep', lambda _:None)
    with pytest.raises(RuntimeError, match='3 попыток'):
        weather.request_json('https://example.invalid',tmp_path,False,events.append)
    assert len(calls)==3 and events==['WEATHER_RETRY 1','WEATHER_RETRY 2']


def test_permanent_weather_error_is_not_retried(tmp_path, monkeypatch):
    from io import BytesIO
    calls=[]
    def fail(*args, **kwargs):
        calls.append(1)
        raise HTTPError('https://example.invalid',400,'bad request',{},BytesIO(b'invalid variable'))
    monkeypatch.setattr(weather,'urlopen',fail)
    with pytest.raises(RuntimeError, match='HTTP 400'):
        weather.request_json('https://example.invalid',tmp_path,False,lambda _:None)
    assert len(calls)==1


@pytest.mark.parametrize('damage',['missing','duplicate','nan','out_of_range'])
def test_forecast_publication_rejects_invalid_output(damage):
    origin=pd.Timestamp('2026-10-03')
    rows=[{'origin':str(origin),'turbine_id':tid,'time':str(origin+pd.Timedelta(hours=h)), 'prediction':.5}
          for tid in [1,2] for h in range(48)]
    weather_worker.validate_forecast(rows,[1,2],origin,48)
    if damage=='missing': rows.pop()
    elif damage=='duplicate': rows[-1]=rows[0]
    elif damage=='nan': rows[0]['prediction']=float('nan')
    else: rows[0]['prediction']=1.01
    with pytest.raises(ValueError): weather_worker.validate_forecast(rows,[1,2],origin,48)


def test_stale_measurements_route_weather_model_without_using_old_power():
    class Constant:
        def __init__(self,value): self.value=value
        def predict(self,x): return np.full(len(x),self.value)
    origin=pd.Timestamp('2025-01-04')
    frame=pd.DataFrame({'power':.9,'wind':8.,'temperature':10.,'samples':6},
                       index=pd.date_range('2025-01-01',periods=24,freq='h'))
    models={'catboost_weather':Constant(.8),'catboost_weather_only':Constant(.3)}
    _, predictions, fresh, wet=weather_worker.predict(frame,1,origin,24,models,fixture_weather(),origin)
    assert not fresh and wet.all()
    assert (predictions['catboost_weather']==.3).all()
