#!/usr/bin/env python3
import argparse
import hashlib
import json
import pathlib
import sys

ROOT = pathlib.Path(".")
OUT = ROOT / ".agent-os/contracts/index.json"
ARTIFACTS = [
    ".agent-os/schemas/constitution-binding.schema.json",
    ".agent-os/schemas/telemetry-event.schema.json",
    ".agent-os/schemas/permission-manifest.schema.json",
]


def sha256_file(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build_index() -> dict:
    artifacts = {}
    for rel in ARTIFACTS:
        p = ROOT / rel
        if not p.exists():
            raise FileNotFoundError(rel)
        artifacts[rel] = sha256_file(p)
    return {
        "system_id": "agent-os",
        "version": "v2",
        "schema_version": "1.0.0",
        "artifacts": dict(sorted(artifacts.items())),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    index = build_index()
    rendered = json.dumps(index, indent=2, sort_keys=True) + "\n"

    if args.check:
        if not OUT.exists():
            print("FAIL: missing .agent-os/contracts/index.json")
            return 1
        existing = OUT.read_text(encoding="utf-8")
        if existing != rendered:
            print("FAIL: contract index is stale")
            return 1
        print("OK: contract index is up to date")
        return 0

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(rendered, encoding="utf-8")
    print(str(OUT))
    return 0


if __name__ == "__main__":
    sys.exit(main())
