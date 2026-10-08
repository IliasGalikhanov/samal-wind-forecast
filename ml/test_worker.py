import numpy as np
import pandas as pd
from pandas.testing import assert_frame_equal

from worker import hourly, features, samples, seasonal_profile, seasonal_predict, validation_windows, choose_model


def synthetic(hours=240):
    times = pd.date_range("2025-01-01", periods=hours, freq="h")
    return pd.DataFrame({"power": .4 + .1*np.sin(np.arange(hours)/10),
                         "wind": np.full(hours,6.), "temperature": np.full(hours,10.),
                         "samples": np.full(hours,6)},index=times)


def test_features_never_read_future():
    frame=synthetic()
    origin=frame.index[100]
    before=features(frame,1,origin,48)
    frame.loc[frame.index>=origin,["power","wind","temperature"]]=999
    assert_frame_equal(before,features(frame,1,origin,48))


def test_training_labels_exclude_cutoff_and_later():
    frame=synthetic()
    cutoff=frame.index[180]
    frame.loc[frame.index>=cutoff,"power"]=999
    _,y=samples({1:frame},cutoff)
    assert len(y)>0
    assert y.max()<1


def test_missing_intervals_are_not_zero_targets():
    timestamps=pd.date_range("2025-01-01",periods=12,freq="10min").delete(7)
    raw=pd.DataFrame({"turbine_id":1,"time":timestamps,"power":.6,"wind":5.,"temperature":10.})
    frame=hourly(raw)[1]
    assert frame.iloc[0].power==.6
    assert pd.isna(frame.iloc[1].power)
    assert frame.iloc[1].samples==5


def test_configured_intervals_and_arbitrary_turbine_ids():
    for interval in (5, 10, 15, 20, 30, 60):
        times = pd.date_range('2025-01-01', periods=180//interval, freq=f'{interval}min')
        raw = pd.DataFrame({'turbine_id': 17, 'time': times, 'power': .5,
                            'wind': 7., 'temperature': 10., 'sample_minutes': interval})
        frames = hourly(raw)
        assert set(frames) == {17}
        assert (frames[17].power == .5).all()
        # Removing a measurement invalidates its entire hour at every interval.
        missing = hourly(raw.drop(index=60//interval))[17]
        assert pd.isna(missing.iloc[1].power)


def test_seasonal_profile_uses_only_past():
    frame=synthetic()
    cutoff=frame.index[120]
    targets=pd.date_range(cutoff,periods=48,freq="h")
    a=seasonal_predict(seasonal_profile(frame,cutoff),targets)
    frame.loc[frame.index>=cutoff,"power"]=999
    b=seasonal_predict(seasonal_profile(frame,cutoff),targets)
    np.testing.assert_equal(a,b)
    assert np.isfinite(a).all()


def test_rolling_windows_never_overlap_final_test():
    start = pd.Timestamp("2026-01-18")
    windows = validation_windows(start)
    assert len(windows) == 4
    assert windows[0][0] == start-pd.Timedelta(days=56)
    assert windows[-1][1] == start
    for index, (left, right) in enumerate(windows):
        assert right-left == pd.Timedelta(days=14)
        assert right <= start
        if index:
            assert windows[index-1][1] == left


def test_selection_does_not_follow_one_lucky_persistence_period():
    # Persistence wins only the last period; it must not erase the earlier errors.
    records = pd.DataFrame({"lead": [24]*4, "actual": [.5]*4,
                            "catboost": [.6]*4, "catboost_mae": [.65]*4,
                            "persistence": [.9, .9, .9, .5], "seasonal": [.7]*4})
    winner, _ = choose_model(records, 24)
    assert winner == "catboost"
    last_winner, _ = choose_model(records.iloc[-1:], 24)
    assert last_winner == "persistence"


def test_selection_matches_requested_horizon():
    records = pd.DataFrame({"lead": [1, 24, 25, 48], "actual": [.5]*4,
                            "catboost": [.6]*4, "catboost_mae": [.65]*4,
                            "persistence": [.5, .5, 1., 1.], "seasonal": [.7]*4})
    assert choose_model(records, 24)[0] == "persistence"
    assert choose_model(records, 48)[0] == "catboost"
