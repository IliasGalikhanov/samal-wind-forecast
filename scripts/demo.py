"""Full offline demonstration using invented data; no original CSV or weather API."""
import argparse
import json
import os
from pathlib import Path
import shutil
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/"ml"))
from synthetic import END, write_imports
from weather import DEFAULT_STATIONS
import weather_worker


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--output", type=Path, default=ROOT/"runtime"/"demo-cli")
    p.add_argument("--verify", action="store_true", help="Run twice and prove the second forecast does not train")
    p.add_argument("--serve", action="store_true", help="Container entry point: seed a separate demo database and serve the UI")
    args = p.parse_args()
    print("SYNTHETIC DEMO: invented measurements and weather; metrics do not describe a real wind farm.", flush=True)
    if args.serve:
        executable = shutil.which("samal")
        if not executable:
            p.error("--serve is intended for the Docker demo service")
        write_imports(ROOT/"runtime"/"demo-input")
        os.execve(executable, [executable, "-root", str(ROOT), "-addr", "0.0.0.0:8080", "-python", sys.executable,
                              "-seed", str(ROOT/"runtime"/"demo-input")], {**os.environ, "SAMAL_DEMO": "1"})
    folder = args.output.resolve()
    folder.mkdir(parents=True, exist_ok=True)
    raw = write_imports(folder/"imports")
    source = folder/"input.csv"
    raw.to_csv(source, index=False)
    config = {"synthetic": True, "mode": "dataset", "timezone": "Asia/Almaty", "stations": DEFAULT_STATIONS,
              "cache": str(folder/"weather-cache"), "models": str(folder/"models")}
    config_path = folder/"weather-config.json"
    config_path.write_text(json.dumps(config), encoding="utf-8")
    summaries = []
    for number in range(2 if args.verify else 1):
        target = folder/f"run-{number+1}"
        target.mkdir(exist_ok=True)
        started = time.monotonic()
        original_train = weather_worker.train
        if number:
            def forbid_training(*args, **kwargs):
                raise AssertionError("Second forecast tried to train instead of reusing the saved model")
            weather_worker.train = forbid_training
        try:
            weather_worker.run(source, target/"result.json", 48, str(END+weather_worker.pd.Timedelta(days=number)), config_path)
        finally:
            weather_worker.train = original_train
        result = json.loads((target/"result.json").read_text(encoding="utf-8"))
        assert result["data_source"] == "synthetic" and len(result["forecasts"]) == 96
        assert not number or result["training"]["reused"]
        summaries.append({"run": number+1, "seconds": round(time.monotonic()-started, 2),
                          "reused": result["training"]["reused"], "bundle_id": result["training"]["bundle_id"], "rows": 96})
    (folder/"verification.json").write_text(json.dumps(summaries, indent=2), encoding="utf-8")
    print(json.dumps(summaries, indent=2), flush=True)
    print(f"Synthetic results: {folder}", flush=True)


if __name__ == "__main__":
    main()
