"""Run a forecast through the same API as the UI; requires imported measurements."""
import argparse
import json
import time
import sys
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--url', default='http://127.0.0.1:8080')
    p.add_argument('--mode', choices=['live', 'dataset'], default='live')
    p.add_argument('--horizon', choices=[24, 48], type=int, default=48)
    p.add_argument('--origin', help='Historical local origin, e.g. 2026-02-01T00:00')
    p.add_argument('--days', type=int, default=1)
    p.add_argument('--force-retrain', action='store_true', help='Rebuild the training bundle even when the input is unchanged')
    p.add_argument('--output', type=Path, default=Path('exports'))
    args = p.parse_args()
    if args.mode == 'live' and (args.origin or args.days != 1):
        p.error('Live forecasts use the next full hour and one origin')
    body = {'mode': args.mode, 'horizon': args.horizon, 'replay_days': args.days, 'force_retrain': args.force_retrain}
    if args.origin:
        body['origin'] = args.origin
    req = Request(args.url+'/api/runs', data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
    with urlopen(req, timeout=30) as response:
        run = json.load(response)
    deadline, previous = time.monotonic()+1900, ''
    while run['status'] == 'running':
        if time.monotonic() > deadline:
            raise TimeoutError('Forecast wait exceeded 1900 seconds; inspect the agent log')
        if run['step'] != previous:
            previous = run['step']
            print(previous, flush=True)
        time.sleep(3)
        with urlopen(args.url+'/api/runs/'+run['id'], timeout=30) as response:
            run = json.load(response)
    if run['status'] != 'completed':
        raise RuntimeError(run.get('error') or run['status'])
    args.output.mkdir(parents=True, exist_ok=True)
    destination = args.output/run['id']
    destination.mkdir(exist_ok=True)
    (destination/'result.json').write_text(json.dumps(run, ensure_ascii=False, indent=2), encoding='utf-8')
    suffix = '/artifacts/replay.csv' if args.days > 1 else '/export'
    with urlopen(args.url+'/api/runs/'+run['id']+suffix, timeout=30) as response:
        (destination/'forecast.csv').write_bytes(response.read())
    print(f'Completed: {destination.resolve()}', flush=True)


if __name__ == '__main__':
    try:
        main()
    except HTTPError as exc:
        print(f'HTTP {exc.code}: {exc.read().decode("utf-8", errors="replace")}', file=sys.stderr)
        sys.exit(1)
