from __future__ import annotations

import subprocess
from pathlib import Path


def runtime_repo_root() -> Path:
    return Path(__file__).resolve().parent.parent


def verify_runtime_bundle() -> None:
    repo_root = runtime_repo_root()
    result = subprocess.run(
        ["python3", "scripts/verify_agent_os_bundle.py"],
        cwd=repo_root,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        detail = result.stdout.strip() or result.stderr.strip() or "runtime bundle verification failed"
        raise RuntimeError(detail)
