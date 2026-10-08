"""Integration check for a NEW disposable installation. Imports synthetic data."""
import argparse
import json
from pathlib import Path
from urllib.request import Request, urlopen


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--url', default='http://127.0.0.1:8080')
    p.add_argument('--verify-persistence', action='store_true')
    args = p.parse_args()
    def get(path):
        with urlopen(args.url+path, timeout=30) as response:
            return response.read()
    json.loads(get('/api/health'))
    assert b'<html' in get('/').lower()
    if not args.verify_persistence:
        overview = json.loads(get('/api/overview'))
        assert sum(t['rows'] for t in overview['turbines']) == 0, 'Use an empty, disposable volume'
        settings = {'enabled': True, 'timezone': 'Asia/Almaty', 'origin_mode': 'live', 'auto_refresh': False}
        with urlopen(Request(args.url+'/api/weather/settings', data=json.dumps(settings).encode(), headers={'Content-Type': 'application/json'})) as response:
            assert response.status == 200
        csv = (Path(__file__).resolve().parent.parent/'data/demo/turbine.csv').read_bytes()
        for tid in [1, 2, 3]:
            station = {'name': f'Synthetic station {tid}', 'latitude': -33.9 + tid / 10,
                       'longitude': 18.4, 'sample_minutes': 10, 'rated_kw': 2000}
            with urlopen(Request(args.url+'/api/turbines', data=json.dumps(station).encode(), headers={'Content-Type': 'application/json'})) as response:
                assert json.load(response)['id'] == tid
            boundary = 'samal-smoke-boundary'
            body = (f'--{boundary}\r\nContent-Disposition: form-data; name="turbine_id"\r\n\r\n{tid}\r\n'
                    f'--{boundary}\r\nContent-Disposition: form-data; name="auto_run"\r\n\r\nfalse\r\n'
                    f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="demo.csv"\r\n'
                    'Content-Type: text/csv\r\n\r\n').encode()+csv+f'\r\n--{boundary}--\r\n'.encode()
            with urlopen(Request(args.url+'/api/imports', data=body, headers={'Content-Type': f'multipart/form-data; boundary={boundary}'}), timeout=30) as response:
                assert json.load(response)['added'] == 12
    overview = json.loads(get('/api/overview'))
    assert [t['rows'] for t in overview['turbines']] == [12, 12, 12]
    assert overview['turbines'][2]['name'] == 'Synthetic station 3'
    assert overview['turbines'][2]['rated_kw'] == 2000
    assert overview['weather_settings']['auto_refresh'] is False
    assert len(json.loads(get('/api/history?turbine=1&days=7'))) >= 2
    print('PASS: health, frontend, import, history, persistent observations and settings')


if __name__ == '__main__':
    main()
