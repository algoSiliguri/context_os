from __future__ import annotations

from pathlib import Path

import yaml

from .models import ProjectManifest


def load_project_manifest(path: Path) -> ProjectManifest:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    return ProjectManifest.model_validate(data)
