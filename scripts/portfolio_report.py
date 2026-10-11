"""Reproduce an illustrated audit exclusively from the public synthetic generator.

Usage: python scripts/demo.py --verify --output runtime/portfolio-demo
       python scripts/portfolio_report.py
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'ml'))
import matplotlib
matplotlib.use('Agg')
import matplotlib.dates as mdates
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from catboost import CatBoostRegressor
import synthetic
import weather_worker as pipeline
import worker
from weather import DEFAULT_STATIONS

LABELS = {'catboost_weather': 'Weather + history', 'catboost_weather_only': 'Weather only',
          'catboost_mae': 'History only', 'persistence': 'Persistence', 'seasonal': 'Seasonal'}


def verified_inputs(folder):
    source = folder / 'input.csv'
    result = json.loads((folder / 'run-1/result.json').read_text(encoding='utf-8'))
    config = json.loads((folder / 'weather-config.json').read_text(encoding='utf-8'))
    if result.get('data_source') != 'synthetic' or config.get('synthetic') is not True:
        raise ValueError('Only public synthetic inputs can produce a portfolio report')
    if hashlib.sha256(source.read_bytes()).hexdigest() != result['training']['input_sha256']:
        raise ValueError('Input hash does not match the training result')
    raw = pd.read_csv(source)
    expected = synthetic.measurements()
    expected['time'] = expected.time.astype(str)
    pd.testing.assert_frame_equal(raw, expected, check_dtype=False, atol=1e-10, rtol=1e-10)
    if config['stations'] != DEFAULT_STATIONS or config['timezone'] != 'Asia/Almaty':
        raise ValueError('Unexpected station configuration')
    return raw, result, config


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, default=ROOT / 'runtime/portfolio-demo')
    parser.add_argument('--output', type=Path, default=ROOT / 'docs/reports')
    args = parser.parse_args()
    raw, result, config = verified_inputs(args.input)
    frames = worker.hourly(raw)
    last = max(frame.index.max() for frame in frames.values()) + pd.Timedelta(hours=1)
    start = max(pd.Timestamp('2024-01-08'), last - pd.Timedelta(days=730),
                max(frame.power.first_valid_index() for frame in frames.values()) + pd.Timedelta(hours=72))
    weather = synthetic.load_synthetic_weather(start, last, config['stations'], config['timezone'])
    models = {name: CatBoostRegressor().load_model(str(args.input / f'run-1/validation-{name}.cbm'))
              for name in pipeline.COLUMNS}
    audit = pipeline.backtest(frames, models, pd.Timestamp(result['backtest']['start']),
                              pd.Timestamp(result['backtest']['end_exclusive']), weather, result['horizon'])
    winner = result['selected_model']
    for name, score in result['backtest']['models'].items():
        if not np.isclose(worker.metrics(audit, name)['mae'], score['mae'], atol=1e-10):
            raise ValueError('Reconstructed audit differs from the recorded metrics')
    args.output.mkdir(parents=True, exist_ok=True)
    plt.rcParams.update({'font.size': 10, 'axes.spines.top': False, 'axes.spines.right': False,
                         'axes.grid': True, 'grid.alpha': .18, 'figure.facecolor': '#f5f8fc',
                         'axes.facecolor': 'white', 'savefig.facecolor': '#f5f8fc'})
    fig, axes = plt.subplots(2, 2, figsize=(14, 9), constrained_layout=True)
    names = list(LABELS)
    y = np.arange(len(names))
    axes[0, 0].barh(y - .18, [result['validation']['models'][n]['mae'] * 100 for n in names], .35, label='Validation', color='#92c9dd')
    axes[0, 0].barh(y + .18, [result['backtest']['models'][n]['mae'] * 100 for n in names], .35, label='Final audit', color='#186d90')
    axes[0, 0].set(yticks=y, yticklabels=[LABELS[n] for n in names], xlabel='MAE (percentage points)', title='Same evaluation pairs for every model')
    axes[0, 0].invert_yaxis()
    axes[0, 0].legend()
    for name, color in [(winner, '#087f8c'), ('persistence', '#db8848'), ('seasonal', '#6b77a2')]:
        error = audit.assign(error=(audit[name] - audit.actual).abs() * 100).groupby('lead').error.mean()
        axes[0, 1].plot(error.index, error, label=LABELS[name], color=color)
    axes[0, 1].set(xlabel='Forecast lead (hours)', ylabel='MAE (percentage points)', title='Error across the 48-hour horizon')
    axes[0, 1].legend()
    unique = audit[audit.lead <= 24].copy()
    unique['error'] = (unique[winner] - unique.actual).abs()
    worst = unique.sort_values('error', ascending=False).iloc[0]
    for ax, tid, left, title in [
        (axes[1, 0], 1, pd.Timestamp(result['backtest']['start']), 'First 72 audit hours: turbine 1'),
        (axes[1, 1], int(worst.turbine_id), pd.Timestamp(worst.time) - pd.Timedelta(hours=24), 'Window around the largest day-ahead error'),
    ]:
        rows = unique[(unique.turbine_id == tid) & (pd.to_datetime(unique.time) >= left) &
                      (pd.to_datetime(unique.time) < left + pd.Timedelta(hours=72))].sort_values('time')
        times = pd.to_datetime(rows.time)
        ax.plot(times, rows.actual * 100, color='#243b53', label='Synthetic actual')
        ax.plot(times, rows[winner] * 100, color='#087f8c', label='Selected model')
        ax.set(title=title, ylabel='Normalised power (%)', ylim=(-3, 103))
        ax.xaxis.set_major_formatter(mdates.DateFormatter('%d %b\n%H:%M'))
        ax.legend()
    fig.suptitle('SAMAL · SYNTHETIC AUDIT\nInvented measurements and weather; not evidence of real-world accuracy', fontsize=15)
    fig.savefig(args.output / 'synthetic-audit.png', dpi=150)
    plt.close(fig)
    text = ['# Synthetic model audit / Синтетический аудит модели', '',
            '**All measurements and weather in this report are invented. / Все измерения и погода вымышлены.**', '',
            '![Synthetic audit](synthetic-audit.png)', '',
            '## Reproduce / Воспроизведение', '', '```sh',
            'python scripts/demo.py --verify --output runtime/portfolio-demo',
            'python scripts/portfolio_report.py', '```', '',
            'The report checks the input hash and compares every input row with the public generator before writing files. '
            'It reconstructs the final audit using models trained before the audit period; the final inference models are not used.', '',
            f"Selected on four temporal validation folds: **{LABELS[winner]}**. Final audit: {result['backtest']['start']} to {result['backtest']['end_exclusive']} (exclusive).", '',
            '| Model | Validation MAE, pp | Audit MAE, pp | Audit RMSE, pp | Pairs |',
            '|---|---:|---:|---:|---:|']
    for name, label in LABELS.items():
        score = result['backtest']['models'][name]
        text.append(f"| {label} | {result['validation']['models'][name]['mae']*100:.3f} | {score['mae']*100:.3f} | {score['rmse']*100:.3f} | {score['n']} |")
    text += ['', '## Largest day-ahead errors / Наибольшие ошибки первых 24 часов', '',
             '| Time (Asia/Almaty) | Turbine | Actual, % | Forecast, % | Absolute error, pp |', '|---|---:|---:|---:|---:|']
    for _, row in unique.nlargest(5, 'error').iterrows():
        text.append(f'| {row.time} | {int(row.turbine_id)} | {row.actual*100:.2f} | {row[winner]*100:.2f} | {row.error*100:.2f} |')
    text += ['', '## Interpretation / Интерпретация', '',
             'The synthetic power curve has a known relationship with wind. The generator also adds forecast error, measurement noise and invented outages. '
             'The two lower plots expose failures hidden by the average MAE; they do not prove the cause of any individual error.', '',
             'Сравнение использует одинаковые пары прогноз/факт для всех методов. Модель выбирается по четырём предыдущим временным отрезкам, '
             'а последний отрезок используется для аудита. График по горизонту усредняет ошибки отдельно для каждого шага; соседние прогнозы '
             'перекрываются, поэтому пары не являются независимыми наблюдениями.', '',
             'This is a deliberately learnable toy system. Low error here confirms pipeline behaviour, not accuracy at a real wind farm. '
             'No future operational accuracy, economic savings or uncertainty calibration is claimed. '
             'Real-data experiment metrics and their limitations are documented separately in [model.md](https://github.com/IliasGalikhanov/samal-wind-forecast/blob/main/docs/model.md).', '',
             'Exact metrics can vary slightly across platforms. The input generator and dependency versions are fixed; the audit is recomputed, not copied from a screenshot.', '']
    (args.output / 'synthetic.md').write_text('\n'.join(text), encoding='utf-8')
    print(f'Synthetic-only report: {args.output}')


if __name__ == '__main__':
    main()
