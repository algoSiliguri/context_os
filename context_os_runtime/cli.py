from __future__ import annotations

from pathlib import Path


def main() -> None:
    print(f"context-os runtime available at {Path.cwd()}")
