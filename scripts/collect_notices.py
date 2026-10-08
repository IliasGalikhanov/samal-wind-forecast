"""Collect installed dependency license texts; run after Go/npm/pip setup.

This is an attribution inventory, not a license compatibility audit. CatBoost's
upstream license is stored separately because its wheel omits the license file.
"""
import importlib.metadata as metadata
import json
import os
import re
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT/"licenses"/"dependencies.txt"


def texts(paths):
    return [(p, p.read_text(encoding="utf-8", errors="replace")) for p in paths
            if p.is_file() and re.fullmatch(
                r"(?:license|licence|notice|copying|copyright)(?:[-_.][\w.-]+)?", p.name, re.I)
            and p.suffix.lower() not in {".py", ".pyc", ".js", ".ts", ".so", ".dll"}]


def main():
    sections, missing = [], []
    def add(name, version, licenses, declared=""):
        sections.append(f"\n{'='*72}\n{name} {version}\nDeclared license: {declared or 'see text below'}\n")
        if not licenses:
            missing.append(name)
            sections.append("No standalone license text in the installed package; see declared license and upstream.\n")
        for path, body in licenses:
            sections.append(f"\n--- {path.name} ---\n{body}\n")
    lock = json.loads((ROOT/"frontend/package-lock.json").read_text(encoding="utf-8"))
    for name, item in sorted(lock["packages"].items()):
        if not name:
            continue
        folder = ROOT/"frontend"/name
        if folder.is_dir():
            license_files = texts(folder.rglob("*"))
            if name.startswith("node_modules/@rolldown/binding-"):
                license_files = texts((ROOT/"frontend/node_modules/rolldown").glob("LICENSE*"))
            add("npm: "+name.removeprefix("node_modules/"), item["version"], license_files, str(item.get("license", "")))
    for requirement in (ROOT/"ml/requirements.lock.txt").read_text().splitlines():
        name = requirement.split("==")[0]
        dist = metadata.distribution(name)
        licenses = texts([Path(dist.locate_file(p)) for p in dist.files or []])
        declared = dist.metadata.get("License-Expression") or dist.metadata.get("License") or ""
        if name == "catboost":
            # The filename is prefixed to identify upstream separately.
            licenses = [(ROOT/"licenses/catboost-LICENSE", (ROOT/"licenses/catboost-LICENSE").read_text(encoding="utf-8"))]
        add("PyPI: "+name, dist.version, licenses, declared)
    environment = dict(os.environ)
    if (ROOT/".cache/gomod").exists():
        environment["GOMODCACHE"] = str(ROOT/".cache/gomod")
    proc = subprocess.run(["go", "list", "-m", "-json", "all"], cwd=ROOT, env=environment, capture_output=True, check=True, text=True)
    decoder = json.JSONDecoder()
    remaining = proc.stdout.strip()
    while remaining:
        item, length = decoder.raw_decode(remaining)
        remaining = remaining[length:].lstrip()
        if item.get("Main") or not item.get("Dir"):
            continue
        folder = Path(item["Dir"])
        add("Go: "+item["Path"], item["Version"], texts(folder.iterdir()))
    DEST.parent.mkdir(exist_ok=True)
    text = "SAMAL third-party notices — copied from installed dependencies.\n"+"".join(sections)
    DEST.write_text("\n".join(line.rstrip() for line in text.splitlines()).rstrip()+"\n", encoding="utf-8", newline="\n")
    print(f"Wrote {DEST.name}: {DEST.stat().st_size} bytes")
    if missing:
        print("Packages without a standalone license file: "+", ".join(missing))


if __name__ == "__main__":
    main()
