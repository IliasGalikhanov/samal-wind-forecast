"""Local, content-addressed training bundles. Never commit these artifacts."""
import hashlib
import importlib.metadata
import json
import re
import shutil
import uuid
from pathlib import Path


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fingerprint(input_path, config, horizon, columns, parameters):
    source = Path(__file__).parent
    identity = {
        "input_sha256": digest(input_path), "horizon": horizon,
        "timezone": config["timezone"], "stations": sorted(config["stations"], key=lambda s: int(s["id"])),
        "provider": "synthetic-v1" if config.get("synthetic") else "open-meteo-icon-global",
        "columns": columns, "parameters": parameters,
        "code": {name: digest(source/name) for name in
                 ["worker.py", "weather_worker.py", "weather.py", "model_cache.py", "synthetic.py", "requirements.lock.txt"]},
        "versions": {name: importlib.metadata.version(name) for name in ["catboost", "numpy", "pandas", "tzdata"]},
    }
    return hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()


def restore(root, key, destination):
    """Verify every artifact before copying; interrupted/corrupt bundles miss cache."""
    try:
        pointer = json.loads((root/f"{key}.json").read_text(encoding="utf-8"))
        if not re.fullmatch(key+r"-[a-f0-9]{32}", pointer["bundle"]):
            return None
        folder = root/pointer["bundle"]
        files = pointer["files"]
        if "training-report.json" not in files or "weather-training.csv" not in files:
            return None
        for name, sha in files.items():
            if Path(name).name != name or not re.fullmatch(r"[\w.-]+", name) or digest(folder/name) != sha:
                return None
        report = json.loads((folder/"training-report.json").read_text(encoding="utf-8"))
        if report["training"]["bundle_id"] != key:
            return None
        for name in files:
            shutil.copyfile(folder/name, destination/name)
        return report
    except (OSError, ValueError, KeyError, TypeError):
        return None


def save(root, key, source, report):
    # Publish one small pointer only after all immutable files have been written.
    root.mkdir(parents=True, exist_ok=True)
    folder = root/f"{key}-{uuid.uuid4().hex}"
    folder.mkdir()
    (source/"training-report.json").write_text(json.dumps(report, ensure_ascii=False, allow_nan=False), encoding="utf-8")
    names = ["training-report.json", "weather-training.csv"]
    names += [f"{name}.cbm" for name in report["model_keys"]]
    names += [f"validation-{name}.cbm" for name in report["validation"]["models"] if (source/f"validation-{name}.cbm").exists()]
    for name in names:
        shutil.copyfile(source/name, folder/name)
    pointer = {"bundle": folder.name, "files": {name: digest(folder/name) for name in names}}
    temporary = root/f"{key}-{uuid.uuid4().hex}.tmp"
    temporary.write_text(json.dumps(pointer), encoding="utf-8")
    temporary.replace(root/f"{key}.json")
