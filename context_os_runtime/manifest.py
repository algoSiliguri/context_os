from __future__ import annotations

from pathlib import Path

import yaml

from .models import ProjectManifest


def load_project_manifest(path: Path) -> ProjectManifest:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("manifest must be a mapping")
    return ProjectManifest.model_validate(data)
