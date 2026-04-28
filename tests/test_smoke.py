from pathlib import Path

from context_os_runtime import __version__


def test_runtime_package_exposes_version() -> None:
    assert __version__ == "0.1.0"


def test_implementation_status_exists_for_session_handoff() -> None:
    status_path = Path("IMPLEMENTATION_STATUS.md")
    assert status_path.exists()


def test_tracking_files_point_to_post_doctor_slice() -> None:
    roadmap = Path("AGENT_OS_ROADMAP.md").read_text(encoding="utf-8")
    status = Path("IMPLEMENTATION_STATUS.md").read_text(encoding="utf-8")

    assert "V2.3" in roadmap
    assert "canonical vs projection" in status.lower()
