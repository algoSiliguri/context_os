from __future__ import annotations

import json
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

from .lock import read_lock, validate_lock
from .manifest import load_project_manifest
from .memory_router import build_memory_route
from .runtime_paths import event_log_path, runtime_dir, session_snapshot_path


@dataclass(slots=True)
class DoctorCheck:
    name: str
    severity: str
    detail: str
    remediation: str | None = None


@dataclass(slots=True)
class DoctorReport:
    summary: str
    exit_code: int
    checks: list[DoctorCheck]
    next_steps: list[str]


def run_bundle_verifier(*, repo_root: Path) -> tuple[bool, str]:
    result = subprocess.run(
        ["python3", "scripts/verify_agent_os_bundle.py"],
        cwd=repo_root,
        capture_output=True,
        text=True,
    )
    output = result.stdout.strip() or result.stderr.strip() or "Bundle verification failed."
    return result.returncode == 0, output


def _manifest_check(repo_root: Path):
    manifest_path = repo_root / ".agent-os.yaml"
    if not manifest_path.exists():
        return (
            DoctorCheck(
                name="Project manifest loaded",
                severity="FAIL",
                detail="Project manifest is missing.",
                remediation="Create a valid .agent-os.yaml before using Agent OS in this repository.",
            ),
            None,
        )
    try:
        manifest = load_project_manifest(manifest_path)
    except Exception:
        return (
            DoctorCheck(
                name="Project manifest loaded",
                severity="FAIL",
                detail="Project manifest could not be read.",
                remediation="Fix the .agent-os.yaml file so it is valid and readable.",
            ),
            None,
        )
    return DoctorCheck(name="Project manifest loaded", severity="OK", detail="Project manifest loaded."), manifest


def _lock_check(repo_root: Path) -> tuple[DoctorCheck, bool]:
    lock_path = repo_root / ".agent-os.lock"
    if not lock_path.exists():
        return (
            DoctorCheck(
                name="Active session lock",
                severity="WARN",
                detail="No active lock found.",
                remediation="Run `context-os bind` in this repository to start a new session.",
            ),
            False,
        )
    try:
        lock = read_lock(lock_path)
    except Exception:
        return (
            DoctorCheck(
                name="Active session lock",
                severity="WARN",
                detail="Active lock is unreadable.",
                remediation="Run `context-os bind` in this repository to replace the broken lock.",
            ),
            False,
        )
    is_valid, reason = validate_lock(lock, repo_root=repo_root)
    if not is_valid:
        return (
            DoctorCheck(
                name="Active session lock",
                severity="WARN",
                detail=f"Active lock is not usable ({reason}).",
                remediation="Run `context-os bind` in this repository to refresh the session lock.",
            ),
            False,
        )
    return DoctorCheck(name="Active session lock", severity="OK", detail="Active lock is valid."), True


def _runtime_dir_check(repo_root: Path, *, has_active_lock: bool, has_history: bool) -> DoctorCheck:
    path = runtime_dir(repo_root)
    if path.exists():
        return DoctorCheck(name="Runtime directory", severity="OK", detail="Canonical runtime directory is present.")
    if has_active_lock:
        return DoctorCheck(
            name="Runtime directory",
            severity="FAIL",
            detail="Canonical runtime directory is missing.",
            remediation="Re-bind the repository to recreate the runtime directory.",
        )
    if has_history:
        return DoctorCheck(
            name="Runtime directory",
            severity="WARN",
            detail="Canonical runtime directory is missing.",
            remediation="Run `context-os bind` if you want a new active runtime session.",
        )
    return DoctorCheck(
        name="Runtime directory",
        severity="WARN",
        detail="No canonical runtime directory has been created yet.",
        remediation="Run `context-os bind` in this repository to create runtime files.",
    )


def _event_log_check(repo_root: Path, *, has_active_lock: bool) -> tuple[DoctorCheck, bool]:
    path = event_log_path(repo_root)
    if not path.exists():
        if has_active_lock:
            return (
                DoctorCheck(
                    name="Canonical runtime log",
                    severity="FAIL",
                    detail="Canonical runtime log is missing.",
                    remediation="Re-bind the repository to recreate the canonical runtime log.",
                ),
                False,
            )
        return (
            DoctorCheck(
                name="Canonical runtime log",
                severity="WARN",
                detail="Canonical runtime log has not been created yet.",
                remediation="Run `context-os bind` in this repository to create runtime history.",
            ),
            False,
        )
    try:
        path.read_text(encoding="utf-8")
    except Exception:
        severity = "FAIL" if has_active_lock else "WARN"
        return (
            DoctorCheck(
                name="Canonical runtime log",
                severity=severity,
                detail="Canonical runtime log is unreadable.",
                remediation="Fix file permissions or re-bind the repository to restore the runtime log.",
            ),
            False,
        )
    return DoctorCheck(name="Canonical runtime log", severity="OK", detail="Canonical runtime log is readable."), True


def _session_snapshot_check(repo_root: Path, *, has_active_lock: bool) -> DoctorCheck:
    path = session_snapshot_path(repo_root)
    if not path.exists():
        severity = "WARN" if has_active_lock else "WARN"
        return DoctorCheck(
            name="Session snapshot",
            severity=severity,
            detail="Session snapshot is not available.",
            remediation="Run `context-os bind` in this repository to recreate the session snapshot.",
        )
    try:
        json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return DoctorCheck(
            name="Session snapshot",
            severity="WARN",
            detail="Session snapshot could not be read.",
            remediation="Re-bind the repository to regenerate the session snapshot.",
        )
    return DoctorCheck(name="Session snapshot", severity="OK", detail="Session snapshot is readable.")


def _projection_check(repo_root: Path, manifest) -> DoctorCheck:
    if manifest is None:
        return DoctorCheck(
            name="Projection database",
            severity="WARN",
            detail="Projection database path could not be resolved.",
            remediation="Fix the project manifest before checking projection visibility.",
        )
    route = build_memory_route(manifest, repo_root, repo_root.parent / ".knowledge-brain")
    parent = route.project_db_path.parent
    try:
        parent.mkdir(parents=True, exist_ok=True)
    except Exception:
        return DoctorCheck(
            name="Projection database",
            severity="WARN",
            detail="Projection database path is not writable.",
            remediation="Fix directory permissions for the project data_store path.",
        )
    if route.project_db_path.exists():
        return DoctorCheck(name="Projection database", severity="OK", detail="Projection database is reachable.")
    return DoctorCheck(
        name="Projection database",
        severity="WARN",
        detail="Projection database has not been created yet.",
        remediation="Trigger a runtime action or approval flow to populate projection visibility.",
    )


def _brain_cli_check() -> DoctorCheck:
    if shutil.which("brain") is not None:
        return DoctorCheck(name="Brain CLI", severity="OK", detail="brain CLI is available.")
    return DoctorCheck(
        name="Brain CLI",
        severity="WARN",
        detail="brain CLI is not available.",
        remediation="Install the brain CLI if you want local memory inspection commands.",
    )


def _bundle_check(repo_root: Path) -> DoctorCheck:
    ok, detail = run_bundle_verifier(repo_root=repo_root)
    if ok:
        return DoctorCheck(name="Bundle verification", severity="OK", detail="Bundle verification passed.")
    return DoctorCheck(
        name="Bundle verification",
        severity="FAIL",
        detail="Bundle verification failed.",
        remediation=detail,
    )


def run_doctor(*, repo_root: Path) -> DoctorReport:
    manifest_check, manifest = _manifest_check(repo_root)
    lock_path = repo_root / ".agent-os.lock"
    has_lock_file = lock_path.exists()
    lock_check, has_active_lock = _lock_check(repo_root)
    event_log_exists = event_log_path(repo_root).exists()
    checks = [
        manifest_check,
        lock_check,
        _runtime_dir_check(repo_root, has_active_lock=has_lock_file, has_history=event_log_exists),
    ]
    event_log_check, _ = _event_log_check(repo_root, has_active_lock=has_lock_file)
    checks.append(event_log_check)
    checks.append(_session_snapshot_check(repo_root, has_active_lock=has_lock_file))
    checks.append(_projection_check(repo_root, manifest))
    checks.append(_brain_cli_check())
    checks.append(_bundle_check(repo_root))

    if any(check.severity == "FAIL" for check in checks):
        summary = "BLOCKED"
        exit_code = 1
    elif any(check.severity == "WARN" for check in checks):
        summary = "ATTENTION NEEDED"
        exit_code = 0
    else:
        summary = "HEALTHY"
        exit_code = 0

    next_steps: list[str] = []
    for check in checks:
        if check.severity != "OK" and check.remediation is not None and check.remediation not in next_steps:
            next_steps.append(check.remediation)
    if not next_steps:
        next_steps.append("No action needed.")
    return DoctorReport(summary=summary, exit_code=exit_code, checks=checks, next_steps=next_steps)


def render_doctor_report(report: DoctorReport) -> str:
    lines = [f"Agent OS doctor: {report.summary}", ""]
    for check in report.checks:
        lines.append(f"{check.severity:<5} {check.name}")
        lines.append(f"      {check.detail}")
    lines.append("")
    lines.append("What to do next:")
    for step in report.next_steps:
        lines.append(f"- {step}")
    return "\n".join(lines)
