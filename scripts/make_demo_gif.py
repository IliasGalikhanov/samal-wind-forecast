"""Encode the six real browser-test screenshots as a short walkthrough.

Frames come only from the isolated synthetic E2E scenario. The sequence omits
waiting/training time and is not a real-time performance demonstration.
"""
import argparse
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
FRAMES = ['01-station', '02-preview', '03-imported', '04-forecast', '05-agent', '06-quality']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, default=ROOT / '.cache/portfolio-tour')
    parser.add_argument('--output', type=Path, default=ROOT / 'docs/images/demo.gif')
    args = parser.parse_args()
    frames = []
    for name in FRAMES:
        with Image.open(args.input / f'{name}.png') as source:
            frames.append(source.convert('RGB').convert('P', palette=Image.Palette.ADAPTIVE, colors=128))
    if len({image.size for image in frames}) != 1:
        raise ValueError('All frames must use the same viewport')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    frames[0].save(args.output, save_all=True, append_images=frames[1:],
                   duration=[4500, 5000, 3500, 6000, 5000, 6000], loop=0, optimize=True)
    print(f'Walkthrough: {args.output.name}; {len(frames)} frames, 30 seconds')


if __name__ == '__main__':
    main()
