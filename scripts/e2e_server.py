"""Start a disposable, isolated SAMAL instance for browser tests.

Never reuses the working database. Test directories remain under .cache/e2e.
"""
import argparse
import os
from pathlib import Path
import shutil
import signal
import sqlite3
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, required=True)
    parser.add_argument('--demo', action='store_true')
    args = parser.parse_args()
    cache = ROOT / '.cache' / 'e2e'
    cache.mkdir(parents=True, exist_ok=True)
    folder = Path(tempfile.mkdtemp(prefix='demo-' if args.demo else 'app-', dir=cache))
    shutil.copytree(ROOT / 'frontend' / 'dist', folder / 'frontend' / 'dist')
    shutil.copytree(ROOT / 'ml', folder / 'ml', ignore=shutil.ignore_patterns('__pycache__'))
    command = [str(cache / ('samal.exe' if os.name == 'nt' else 'samal')),
               '-root', str(folder), '-addr', f'127.0.0.1:{args.port}', '-python', sys.executable]
    env = dict(os.environ)
    env.pop('SAMAL_DEMO', None)
    # Disable scheduled runs before startup; tests start forecasts explicitly.
    (folder / 'runtime').mkdir()
    with sqlite3.connect(folder / 'runtime' / 'energy.db') as db:
        db.execute('CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL)')
        db.execute('INSERT INTO settings VALUES (?,?)', ('weather',
                   '{"enabled":true,"timezone":"Asia/Almaty","origin_mode":"live","auto_refresh":false}'))
    if args.demo:
        sys.path.insert(0, str(ROOT / 'ml'))
        from synthetic import write_imports
        write_imports(folder / 'runtime' / 'seed')
        command += ['-seed', str(folder / 'runtime' / 'seed')]
        env['SAMAL_DEMO'] = '1'
    process = subprocess.Popen(command, env=env)

    def stop(*_):
        process.terminate()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    try:
        raise SystemExit(process.wait())
    finally:
        if process.poll() is None:
            process.terminate()
            process.wait(timeout=15)


if __name__ == '__main__':
    main()
