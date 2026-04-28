from pathlib import Path

import pytest

from context_os_runtime.manifest import load_project_manifest


def test_load_project_manifest_reads_minimum_binding_contract(tmp_path: Path) -> None:
    manifest_path = tmp_path / ".agent-os.yaml"
    manifest_path.write_text(
        "\n".join(
            [
                "project_id: brain-playground",
                "domain_type: trading-research",
                "runtime_version: 0.1.x",
                "memory_namespace: brain-playground",
                "verification_profile: default",
            ]
        ),
        encoding="utf-8",
    )

    manifest = load_project_manifest(manifest_path)

    assert manifest.project_id == "brain-playground"
    assert manifest.runtime_version == "0.1.x"


def test_load_project_manifest_rejects_non_mapping_yaml(tmp_path: Path) -> None:
    manifest_path = tmp_path / ".agent-os.yaml"
    manifest_path.write_text("- invalid\n- manifest\n", encoding="utf-8")

    with pytest.raises(ValueError, match="manifest must be a mapping"):
        load_project_manifest(manifest_path)


def test_load_project_manifest_rejects_blank_critical_actions(tmp_path: Path) -> None:
    manifest_path = tmp_path / ".agent-os.yaml"
    manifest_path.write_text(
        "\n".join(
            [
                "project_id: generic-repo",
                "domain_type: generic-software",
                "runtime_version: 0.1.x",
                "memory_namespace: generic-repo",
                "verification_profile: default",
                "critical_actions:",
                "  - deploy",
                "  - ''",
            ]
        ),
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="critical actions must not contain blanks"):
        load_project_manifest(manifest_path)
