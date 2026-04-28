from context_os_runtime import __version__
from pathlib import Path


def test_runtime_package_exposes_version() -> None:
    assert __version__ == "0.1.0"


def test_implementation_status_template_contains_phase1_sections() -> None:
    status_path = Path("/Users/koustavdas/Documents/GitHub/context_os/.worktrees/phase1-control-plane-credibility/IMPLEMENTATION_STATUS.md")
    text = status_path.read_text(encoding="utf-8")

    assert "# IMPLEMENTATION_STATUS" in text
    assert "Current milestone" in text
    assert "Phase 1 checklist" in text
    assert "Runtime truth files" in text
    assert "Open P0 blockers" in text
    assert "Next recommended slice" in text
