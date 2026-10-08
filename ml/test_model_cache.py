import json

import pytest
import model_cache
import weather_worker
from weather import DEFAULT_STATIONS


def test_cache_identity_changes_with_inputs_but_not_forecast_refresh(tmp_path):
    source = tmp_path/"input.csv"
    source.write_text("turbine_id,time,wind,power,temperature\n1,2025-01-01,8,.3,10\n")
    config = {"timezone": "Asia/Almaty", "stations": DEFAULT_STATIONS, "synthetic": True, "mode": "dataset"}
    def key(c=config, horizon=48):
        return model_cache.fingerprint(source, c, horizon, weather_worker.COLUMNS, weather_worker.history.MODEL_PARAMS)
    before = key()
    assert key({**config, "mode": "live", "origin": "2026-10-04", "cache": "elsewhere"}) == before
    assert key({**config, "synthetic": False}) != before
    assert key({**config, "timezone": "UTC"}) != before
    assert key({**config, "stations": [{**DEFAULT_STATIONS[0], "latitude": 44}]}) != before
    assert key(horizon=24) != before
    source.write_text(source.read_text()+"1,2025-01-02,9,.4,11\n")
    assert key() != before


@pytest.mark.parametrize("damage", [None, "model", "report", "traversal", "missing"])
def test_only_intact_complete_training_bundles_are_reused(tmp_path, damage):
    source, destination, root = [tmp_path/name for name in ["first", "second", "models"]]
    source.mkdir(); destination.mkdir()
    (source/"weather-training.csv").write_text("synthetic weather")
    (source/"catboost_weather_only.cbm").write_bytes(b"test artifact")
    key = "a"*64
    report = {"training": {"bundle_id": key}, "model_keys": ["catboost_weather_only"], "validation": {"models": {}}}
    model_cache.save(root, key, source, report)
    pointer = json.loads((root/f"{key}.json").read_text())
    bundle = root/pointer["bundle"]
    if damage == "model": (bundle/"catboost_weather_only.cbm").write_bytes(b"corrupt")
    if damage == "report": (bundle/"training-report.json").write_text("{}")
    if damage == "missing": (bundle/"weather-training.csv").unlink()
    if damage == "traversal":
        pointer["bundle"] = "../elsewhere"
        (root/f"{key}.json").write_text(json.dumps(pointer))
    restored = model_cache.restore(root, key, destination)
    assert (restored == report) if damage is None else (restored is None)
    assert (destination/"catboost_weather_only.cbm").exists() == (damage is None)
