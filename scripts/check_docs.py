"""Validate local documentation links and keep OpenAPI routes in sync with Go."""
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def main():
    spec = json.loads((ROOT / 'docs/openapi.json').read_text(encoding='utf-8'))
    assert spec['openapi'] == '3.1.0'
    documented = {(method.upper(), path) for path, methods in spec['paths'].items()
                  for method in methods if method in {'get', 'post', 'put', 'patch', 'delete'}}
    handlers = (ROOT / 'internal/app/http.go').read_text(encoding='utf-8')
    implemented = set(re.findall(r'mux.HandleFunc\("(GET|POST|PUT|PATCH|DELETE) (/api/[^" ]+)"', handlers))
    assert implemented == documented, f'OpenAPI route mismatch: {implemented ^ documented}'
    identifiers = [op['operationId'] for methods in spec['paths'].values() for op in methods.values()]
    assert len(identifiers) == len(set(identifiers)), 'Duplicate operationId'

    def check_refs(value):
        if isinstance(value, dict):
            if '$ref' in value:
                node = spec
                for part in value['$ref'].removeprefix('#/').split('/'):
                    node = node[part]
            for child in value.values():
                check_refs(child)
        elif isinstance(value, list):
            for child in value:
                check_refs(child)
    check_refs(spec)
    files = [ROOT / 'README.md', ROOT / 'README.en.md', ROOT / 'CONTRIBUTING.md', *sorted((ROOT / 'docs').rglob('*.md'))]
    for file in files:
        text = file.read_text(encoding='utf-8')
        for link in re.findall(r'\]\(([^)]+)\)', text):
            if '://' in link or link.startswith(('#', 'mailto:')):
                continue
            target = (file.parent / link.split('#')[0]).resolve()
            assert target.exists(), f'{file.relative_to(ROOT)}: missing {link}'
    print(f'Documentation checked: {len(files)} Markdown files, {len(documented)} API operations.')


if __name__ == '__main__':
    main()
