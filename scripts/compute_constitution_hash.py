#!/usr/bin/env python3
import argparse
import hashlib
import pathlib
import re
import sys

CONSTITUTION_PATH = pathlib.Path("AGENT_OS_CONSTITUTION.md")


def canonical_text(text: str) -> str:
    if "content-hash:" not in text:
        raise ValueError("content-hash field not found")
    return re.sub(
        r'^(\s*content-hash:\s*").*("\s*)$',
        lambda m: f"{m.group(1)}{m.group(2)}",
        text,
        flags=re.MULTILINE,
    )


def extract_current_hash(text: str) -> str:
    match = re.search(r'^\s*content-hash:\s*"([a-f0-9]*)"\s*$', text, flags=re.MULTILINE)
    if not match:
        raise ValueError("unable to parse content-hash")
    return match.group(1)


def compute_hash(text: str) -> str:
    return hashlib.sha256(canonical_text(text).encode("utf-8")).hexdigest()


def write_hash(text: str, new_hash: str) -> str:
    return re.sub(
        r'^(\s*content-hash:\s*").*("\s*)$',
        lambda m: f"{m.group(1)}{new_hash}{m.group(2)}",
        text,
        count=1,
        flags=re.MULTILINE,
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()

    text = CONSTITUTION_PATH.read_text(encoding="utf-8")
    current = extract_current_hash(text)
    expected = compute_hash(text)

    if args.check:
        if current != expected:
            print(f"FAIL: content-hash mismatch current={current or '<empty>'} expected={expected}")
            return 1
        print("OK: content-hash is up to date")
        return 0

    if args.write:
        CONSTITUTION_PATH.write_text(write_hash(text, expected), encoding="utf-8")
        print(expected)
        return 0

    print(expected)
    return 0


if __name__ == "__main__":
    sys.exit(main())
