# Doctor Operator UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a human-first `context-os doctor` command that diagnoses manifest, lock, canonical runtime artifacts, projection reachability, bundle verification, and local tool availability with plain-language remediation.

**Architecture:** Keep `doctor` separate from `status`. Add a focused diagnostic module that produces typed check results, a summary state, and an exit code. The CLI will only parse the subcommand, render the results, and exit non-zero on blocking failures. Shared runtime-path, manifest, lock, and memory-route helpers remain the source of repo truth.

**Tech Stack:** Python 3.12, `pytest`, `pydantic`, `subprocess`, local filesystem

---

### Task 1: Add failing doctor tests for healthy, warning, and failure flows

**Files:**
- Modify: `tests/test_cli.py`

- [ ] **Step 1: Write the failing tests**

```python
def test_doctor_reports_healthy_repo(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    ...
    with pytest.raises(SystemExit) as exc:
        main(["doctor", "--repo", str(repo_root)])
    assert exc.value.code == 0
    assert "Agent OS doctor: HEALTHY" in capsys.readouterr().out


def test_doctor_warns_when_repo_is_detached(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    ...
    assert "ATTENTION NEEDED" in out
    assert "No active lock found" in out


def test_doctor_fails_when_manifest_is_missing(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    ...
    assert exc.value.code == 1
    assert "valid .agent-os.yaml" in capsys.readouterr().out
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `PYTHONPATH=/Users/koustavdas/Documents/GitHub/context_os/.worktrees/safety-visibility-loop:/Users/koustavdas/Documents/GitHub/knowledge-brain cd /Users/koustavdas/Documents/GitHub/context_os/.worktrees/safety-visibility-loop && python -m pytest tests/test_cli.py::test_doctor_reports_healthy_repo tests/test_cli.py::test_doctor_warns_when_repo_is_detached tests/test_cli.py::test_doctor_fails_when_manifest_is_missing -q`
Expected: FAIL because `doctor` does not exist

- [ ] **Step 3: Write minimal implementation**

```python
@dataclass(slots=True)
class DoctorCheck:
    name: str
    severity: str
    detail: str
    remediation: str | None = None
```

```python
def doctor_command(*, repo_root: Path) -> int:
    return 0
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `PYTHONPATH=/Users/koustavdas/Documents/GitHub/context_os/.worktrees/safety-visibility-loop:/Users/koustavdas/Documents/GitHub/knowledge-brain cd /Users/koustavdas/Documents/GitHub/context_os/.worktrees/safety-visibility-loop && python -m pytest tests/test_cli.py::test_doctor_reports_healthy_repo tests/test_cli.py::test_doctor_warns_when_repo_is_detached tests/test_cli.py::test_doctor_fails_when_manifest_is_missing -q`
Expected: PASS

### Task 2: Add a diagnostic module and cover bundle, lock, runtime, and tool checks

**Files:**
- Create: `context_os_runtime/doctor.py`
- Modify: `tests/test_cli.py`

- [ ] **Step 1: Write the failing tests**

```python
def test_doctor_fails_when_active_lock_has_no_canonical_log(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    ...
    assert exc.value.code == 1


def test_doctor_warns_when_brain_cli_is_missing(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    ...
    assert exc.value.code == 0
    assert "brain CLI is not available" in capsys.readouterr().out


def test_doctor_fails_when_bundle_verifier_fails(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    ...
    assert exc.value.code == 1
    assert "Bundle verification failed" in capsys.readouterr().out
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `PYTHONPATH=/Users/koustavdas/Documents/GitHub/context_os/.worktrees/safety-visibility-loop:/Users/koustavdas/Documents/GitHub/knowledge-brain cd /Users/koustavdas/Documents/GitHub/context_os/.worktrees/safety-visibility-loop && python -m pytest tests/test_cli.py::test_doctor_fails_when_active_lock_has_no_canonical_log tests/test_cli.py::test_doctor_warns_when_brain_cli_is_missing tests/test_cli.py::test_doctor_fails_when_bundle_verifier_fails -q`
Expected: FAIL because these checks are not implemented

- [ ] **Step 3: Write minimal implementation**

```python
def run_doctor(*, repo_root: Path) -> DoctorReport:
    checks = [
        _manifest_check(repo_root),
        _lock_check(repo_root),
        _runtime_dir_check(repo_root),
        _event_log_check(repo_root),
        _session_snapshot_check(repo_root),
        _projection_check(repo_root),
        _brain_cli_check(),
        _bundle_check(repo_root),
    ]
    ...
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `PYTHONPATH=/Users/koustavdas/Documents/GitHub/context_os/.worktrees/safety-visibility-loop:/Users/koustavdas/Documents/GitHub/knowledge-brain cd /Users/koustavdas/Documents/GitHub/context_os/.worktrees/safety-visibility-loop && python -m pytest tests/test_cli.py::test_doctor_fails_when_active_lock_has_no_canonical_log tests/test_cli.py::test_doctor_warns_when_brain_cli_is_missing tests/test_cli.py::test_doctor_fails_when_bundle_verifier_fails -q`
Expected: PASS

### Task 3: Wire the CLI output and keep the tracking files current

**Files:**
- Modify: `context_os_runtime/cli.py`
- Modify: `IMPLEMENTATION_STATUS.md`
- Modify: `AGENT_OS_ROADMAP.md`

- [ ] **Step 1: Write the failing tests**

```python
def test_doctor_output_includes_next_steps_section(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    ...
    assert "What to do next:" in out
    assert "Run `context-os bind`" in out
```

```python
def test_tracking_files_point_to_post_doctor_slice() -> None:
    roadmap = Path("AGENT_OS_ROADMAP.md").read_text(encoding="utf-8")
    status = Path("IMPLEMENTATION_STATUS.md").read_text(encoding="utf-8")
    assert "V2.3" in roadmap
    assert "canonical vs projection" in status.lower()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `PYTHONPATH=/Users/koustavdas/Documents/GitHub/context_os/.worktrees/safety-visibility-loop:/Users/koustavdas/Documents/GitHub/knowledge-brain cd /Users/koustavdas/Documents/GitHub/context_os/.worktrees/safety-visibility-loop && python -m pytest tests/test_cli.py::test_doctor_output_includes_next_steps_section tests/test_smoke.py::test_tracking_files_point_to_post_doctor_slice -q`
Expected: FAIL because doctor output and tracking files are not updated

- [ ] **Step 3: Write minimal implementation**

```python
doctor = sub.add_parser("doctor")
doctor.add_argument("--repo")
```

```python
if args.cmd == "doctor":
    repo_root = _resolve_repo_root(args.repo)
    raise SystemExit(doctor_command(repo_root=repo_root))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `PYTHONPATH=/Users/koustavdas/Documents/GitHub/context_os/.worktrees/safety-visibility-loop:/Users/koustavdas/Documents/GitHub/knowledge-brain cd /Users/koustavdas/Documents/GitHub/context_os/.worktrees/safety-visibility-loop && python -m pytest tests/test_cli.py::test_doctor_output_includes_next_steps_section tests/test_smoke.py::test_tracking_files_point_to_post_doctor_slice -q`
Expected: PASS

### Task 4: Full verification for the doctor slice

**Files:**
- Create: `context_os_runtime/doctor.py`
- Modify: `context_os_runtime/cli.py`
- Modify: `tests/test_cli.py`
- Modify: `tests/test_smoke.py`
- Modify: `IMPLEMENTATION_STATUS.md`
- Modify: `AGENT_OS_ROADMAP.md`

- [ ] **Step 1: Run targeted verification**

Run: `PYTHONPATH=/Users/koustavdas/Documents/GitHub/context_os/.worktrees/safety-visibility-loop:/Users/koustavdas/Documents/GitHub/knowledge-brain cd /Users/koustavdas/Documents/GitHub/context_os/.worktrees/safety-visibility-loop && python -m pytest tests/test_cli.py tests/test_smoke.py -q`
Expected: PASS

- [ ] **Step 2: Run broader runtime verification**

Run: `PYTHONPATH=/Users/koustavdas/Documents/GitHub/context_os/.worktrees/safety-visibility-loop:/Users/koustavdas/Documents/GitHub/knowledge-brain cd /Users/koustavdas/Documents/GitHub/context_os/.worktrees/safety-visibility-loop && python -m pytest tests/test_binding.py tests/test_cli.py tests/test_lock.py tests/test_projection.py tests/test_smoke.py -q`
Expected: PASS
