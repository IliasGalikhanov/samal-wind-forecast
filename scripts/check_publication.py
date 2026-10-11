"""Check staged paths/content; --history also checks all local commits.

Detects common credential formats, not every possible secret. Review diffs too.
Only filenames and rule names are reported, never matched credential values.
"""
import argparse
from pathlib import PurePosixPath
import re
import subprocess
import sys

def private_path(name):
    p = PurePosixPath(name.lower())
    forbidden = {"runtime", ".cache", ".venv", "node_modules", "exports", "raw", "attachments", "__pycache__", ".pytest_cache", "test-results", "playwright-report"}
    return (bool(forbidden.intersection(p.parts)) or
            (p.name.startswith(".env") and p.name != ".env.example") or
            p.suffix.lower() in {".cbm", ".db", ".sqlite", ".sqlite3", ".zip", ".docx", ".exe", ".pem", ".key", ".p12", ".pfx", ".7z", ".tar", ".gz"} or
            ".db-" in p.name or
            (p.suffix.lower() == ".csv" and name != "data/demo/turbine.csv"))

SECRET_RULES = {
    "GitHub token": rb"(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})",
    "AWS access key": rb"(?:AKIA|ASIA)[A-Z0-9]{16}",
    "private key": rb"-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----",
    "OpenAI key": rb"sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{40,}",
}


def git(*args):
    return subprocess.run(["git", *args], capture_output=True, check=True).stdout


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--history", action="store_true")
    args = parser.parse_args()
    entries = []
    for entry in git("ls-files", "--stage", "-z").split(b"\0"):
        if entry:
            metadata, name = entry.split(b"\t", 1)
            mode, oid, stage = metadata.split()
            if stage != b"0":
                sys.exit("Resolve merge conflicts before publication.")
            entries.append((mode, oid, name.decode("utf-8")))
    if not entries:
        sys.exit("Git index is empty: stage the public source files first.")
    if args.history:
        for commit in git("rev-list", "--all").splitlines():
            for entry in git("ls-tree", "-r", "-z", commit.decode()).split(b"\0"):
                if entry:
                    metadata, name = entry.split(b"\t", 1)
                    mode, kind, oid = metadata.split()
                    entries.append((mode, oid, name.decode("utf-8")))
    failures, checked = set(), set()
    for mode, oid, name in entries:
        if private_path(name):
            failures.add(f"{name}: private/generated path")
        if mode not in {b"100644", b"100755"}:
            failures.add(f"{name}: symlinks and submodules require manual review")
            continue
        if oid in checked:
            continue
        checked.add(oid)
        content = git("cat-file", "blob", oid.decode())
        for label, pattern in SECRET_RULES.items():
            if re.search(pattern, content):
                failures.add(f"{name}: possible {label}")
    if failures:
        sys.exit("Publication check failed:\n" + "\n".join(sorted(failures)))
    print(f"Publication check passed: {len(checked)} unique blobs; index" +
          (" and all local commit history." if args.history else "."))


if __name__ == "__main__":
    main()
