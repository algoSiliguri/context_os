from pathlib import Path

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
