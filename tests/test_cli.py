from __future__ import annotations

import hashlib
import io
import json
import shutil
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from colorama import Fore, Style
from knowledge_brain.approval_store import ApprovalStore
from knowledge_brain.store import Store

from context_os_runtime.approval import derive_action_status
from context_os_runtime.cli import (
    approve_command,
    bind_command,
    deny_command,
    main,
    render_status_view,
    status_snapshot,
    watch_status,
)
from context_os_runtime.events import append_event, build_heartbeat_event, build_state_transition_event, read_events
from context_os_runtime.interceptor import request_critical_action
from context_os_runtime.lock import read_lock

# ---------------------------------------------------------------------------
# Constitution fixture helper (shared across tests that call bind_command)
# ---------------------------------------------------------------------------

_CONSTITUTION_TEMPLATE = """\
## [B0] Binding Header

```yaml
system-id: agent-os
version: v2
canonical-path: AGENT_OS_CONSTITUTION.md
content-hash: "{content_hash}"
schema-version: "1.0.0"
contract-index-hash: "{contract_index_hash}"
clause-count: 1
blocks: [B0]
binding-mode: header-first
signature-required: false
```
"""

_BINDING_SCHEMA = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "additionalProperties": False,
    "required": [
        "system-id", "version", "canonical-path", "content-hash",
        "schema-version", "contract-index-hash", "clause-count",
        "blocks", "binding-mode", "signature-required",
    ],
    "properties": {
        "system-id": {"const": "agent-os"},
        "version": {"type": "string", "pattern": "^v[0-9]+$"},
        "canonical-path": {"type": "string", "minLength": 1},
        "content-hash": {"type": "string", "pattern": "^[a-f0-9]{64}$|^$"},
        "schema-version": {"type": "string", "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$"},
        "contract-index-hash": {"type": "string", "pattern": "^[a-f0-9]{64}$|^$"},
        "clause-count": {"type": "integer", "minimum": 1},
        "blocks": {"type": "array", "minItems": 1, "items": {"type": "string", "pattern": "^B[0-9]+$"}},
        "binding-mode": {"type": "string", "enum": ["header-first"]},
        "signature-required": {"type": "boolean"},
    },
}


def _write_constitution(repo_root: Path) -> None:
    schemas = repo_root / ".agent-os" / "schemas"
    schemas.mkdir(parents=True, exist_ok=True)
    (schemas / "constitution-binding.schema.json").write_text(
        json.dumps(_BINDING_SCHEMA, indent=2), encoding="utf-8"
    )
    (schemas / "telemetry-event.schema.json").write_text(
        json.dumps({"$schema": "https://json-schema.org/draft/2020-12/schema", "type": "object"}),
        encoding="utf-8",
    )
    (schemas / "permission-manifest.schema.json").write_text(
        json.dumps({"$schema": "https://json-schema.org/draft/2020-12/schema", "type": "object"}),
        encoding="utf-8",
    )
    contracts = repo_root / ".agent-os" / "contracts"
    contracts.mkdir(parents=True, exist_ok=True)
    index_text = json.dumps(
        {"schema_version": "1.0.0", "system_id": "agent-os", "version": "v2", "artifacts": {}},
        sort_keys=True,
    )
    contract_index_hash = hashlib.sha256(index_text.encode("utf-8")).hexdigest()
    (contracts / "index.json").write_text(index_text, encoding="utf-8")
    (repo_root / ".agent-os" / "runtime").mkdir(parents=True, exist_ok=True)
    placeholder = _CONSTITUTION_TEMPLATE.format(content_hash="", contract_index_hash=contract_index_hash)
    content_hash = hashlib.sha256(placeholder.encode("utf-8")).hexdigest()
    constitution = _CONSTITUTION_TEMPLATE.format(
        content_hash=content_hash, contract_index_hash=contract_index_hash
    )
    (repo_root / "AGENT_OS_CONSTITUTION.md").write_text(constitution, encoding="utf-8")


def _write_manifest(repo_root: Path) -> None:
    (repo_root / ".agent-os.yaml").write_text(
        "\n".join(
            [
                "project_id: brain-playground",
                "domain_type: trading-research",
                "runtime_version: 0.1.x",
                "memory_namespace: brain-playground",
                "verification_profile: production",
                "global_memory_read: true",
                "global_memory_write: false",
                "critical_actions:",
                "  - trade_execute",
                "  - global_memory_write",
            ]
        ),
        encoding="utf-8",
    )
    _write_constitution(repo_root)


def _fake_verifier_ok(*, repo_root: Path):
    return True, "Agent OS bundle verification passed"


def _fake_verifier_fail(*, repo_root: Path):
    return False, "Bundle verification failed. Repair the Agent OS bundle before relying on this repository."


def test_bind_command_writes_lock_for_active_session(tmp_path: Path) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    _write_manifest(repo_root)

    record = bind_command(repo_root=repo_root)
    lock = read_lock(repo_root / ".agent-os.lock")
    events = (repo_root / ".agent-os" / "runtime" / "events.jsonl").read_text(encoding="utf-8")

    assert lock.session_id == record.session_id
    assert lock.project_id == "brain-playground"
    assert "BINDING" in events


def test_bind_command_writes_canonical_binding_and_idle_transition(tmp_path: Path) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    _write_manifest(repo_root)

    bind_command(repo_root=repo_root)

    events = read_events(repo_root / ".agent-os" / "runtime" / "events.jsonl")

    assert [event["event_type"] for event in events[:2]] == ["BINDING", "STATE_TRANSITION"]
    assert events[0]["payload"]["project_id"] == "brain-playground"
    assert events[1]["payload"]["to_state"] == "IDLE"


def test_bind_command_writes_canonical_runtime_artifacts(tmp_path: Path) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    _write_manifest(repo_root)

    bind_command(repo_root=repo_root)

    assert (repo_root / ".agent-os" / "runtime" / "events.jsonl").exists()
    assert (repo_root / ".agent-os" / "runtime" / "session.json").exists()


def test_bind_command_persists_session_snapshot(tmp_path: Path) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    _write_manifest(repo_root)

    record = bind_command(repo_root=repo_root)

    snapshot = json.loads((repo_root / ".agent-os" / "runtime" / "session.json").read_text(encoding="utf-8"))
    assert snapshot["session_id"] == record.session_id
    assert snapshot["state"] == "BOUND"


def test_bind_command_emits_initial_heartbeat(tmp_path: Path) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    _write_manifest(repo_root)

    bind_command(repo_root=repo_root)

    events = read_events(repo_root / ".agent-os" / "runtime" / "events.jsonl")
    heartbeat_events = [event for event in events if event["event_type"] == "HEARTBEAT"]

    assert heartbeat_events
    assert heartbeat_events[-1]["payload"]["state"] == "ACTIVE"


def test_bind_command_emits_canonical_heartbeat_envelope(tmp_path: Path) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    _write_manifest(repo_root)

    bind_command(repo_root=repo_root)

    events = read_events(repo_root / ".agent-os" / "runtime" / "events.jsonl")
    heartbeat_events = [event for event in events if event["event_type"] == "HEARTBEAT"]

    assert heartbeat_events[-1]["system_id"] == "agent-os"
    assert heartbeat_events[-1]["payload"]["state"] == "ACTIVE"


def test_active_lock_points_to_canonical_runtime_log(tmp_path: Path) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    _write_manifest(repo_root)

    bind_command(repo_root=repo_root)

    lock = read_lock(repo_root / ".agent-os.lock")
    assert Path(lock.log_path) == repo_root / ".agent-os" / "runtime" / "events.jsonl"


def test_approve_command_rejects_detached_session(tmp_path: Path) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    _write_manifest(repo_root)

    with pytest.raises(RuntimeError, match="Cannot approve in a detached session"):
        approve_command(repo_root=repo_root, action_hash="hash-1", approver_meta={"actor": "human"})


def test_deny_command_rejects_detached_session(tmp_path: Path) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    _write_manifest(repo_root)

    with pytest.raises(RuntimeError, match="Cannot approve in a detached session"):
        deny_command(repo_root=repo_root, action_hash="hash-1", reason="human_declined")


def test_projection_history_does_not_unlock_new_session(tmp_path: Path) -> None:
    log_path = tmp_path / "events.jsonl"
    append_event(
        log_path,
        {
            "session_id": "sess-new",
            "timestamp": datetime.now(UTC).isoformat(),
            "event_type": "ACTION_REQUESTED",
            "action_hash": "hash-1",
            "capability": "trade_execute",
            "params_digest_source": '{"ticker":"BTC","size":1.0}',
            "requested_at": datetime.now(UTC).isoformat(),
            "expires_at": (datetime.now(UTC) + timedelta(seconds=30)).isoformat(),
        },
    )

    status = derive_action_status(log_path, session_id="sess-new", action_hash="hash-1")

    assert status.executable is False
    assert status.final_status == "PENDING"


def test_status_snapshot_reports_active_pending_session(tmp_path: Path) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    _write_manifest(repo_root)
    binding = bind_command(repo_root=repo_root)

    action_hash = request_critical_action(
        repo_root=repo_root,
        session_id=binding.session_id,
        capability="trade_execute",
        resolved_args={"ticker": "BTC", "size": 1.0},
        ttl_seconds=30,
    )

    snapshot = status_snapshot(repo_root=repo_root)
    projection = ApprovalStore(repo_root / "data_store" / "knowledge.db").get_projection(
        binding.session_id,
        action_hash,
    )

    assert snapshot.active is True
    assert snapshot.mode == "ACTIVE"
    assert snapshot.runtime_health_state == "ACTIVE"
    assert snapshot.canonical_state == "AWAITING_APPROVAL"
    assert snapshot.current_action_hash == action_hash
    assert snapshot.projection_state == "PENDING"
    assert projection is not None
    assert projection.final_status == "PENDING"


def test_request_critical_action_emits_canonical_payload_fields(tmp_path: Path) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    _write_manifest(repo_root)
    binding = bind_command(repo_root=repo_root)

    action_hash = request_critical_action(
        repo_root=repo_root,
        session_id=binding.session_id,
        capability="trade_execute",
        resolved_args={"ticker": "BTC", "size": 1.0},
        ttl_seconds=30,
    )

    event = read_events(repo_root / ".agent-os" / "runtime" / "events.jsonl")[-1]

    assert event["event_type"] == "ACTION_REQUESTED"
    assert event["payload"]["action_hash"] == action_hash
    assert event["payload"]["capability"] == "trade_execute"
    assert "requested_at" in event["payload"]
    assert "expires_at" in event["payload"]


def test_status_snapshot_falls_back_to_detached_recent_session(tmp_path: Path) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    _write_manifest(repo_root)
    binding = bind_command(repo_root=repo_root)
    request_critical_action(
        repo_root=repo_root,
        session_id=binding.session_id,
        capability="trade_execute",
        resolved_args={"ticker": "BTC", "size": 1.0},
        ttl_seconds=30,
    )
    (repo_root / ".agent-os.lock").unlink()

    snapshot = status_snapshot(repo_root=repo_root)

    assert snapshot.active is False
    assert snapshot.mode == "DETACHED"
    assert snapshot.canonical_state == "AWAITING_APPROVAL"
    assert snapshot.session_id == binding.session_id


def test_status_snapshot_reads_detached_session_from_runtime_log(tmp_path: Path) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    _write_manifest(repo_root)
    binding = bind_command(repo_root=repo_root)
    request_critical_action(
        repo_root=repo_root,
        session_id=binding.session_id,
        capability="trade_execute",
        resolved_args={"ticker": "BTC", "size": 1.0},
        ttl_seconds=30,
    )
    (repo_root / ".agent-os.lock").unlink()

    snapshot = status_snapshot(repo_root=repo_root)

    assert snapshot.mode == "DETACHED"
    assert snapshot.session_id == binding.session_id


def test_status_snapshot_reconstructs_idle_from_state_transition(tmp_path: Path) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    _write_manifest(repo_root)
    binding = bind_command(repo_root=repo_root)
    append_event(
        repo_root / ".agent-os" / "runtime" / "events.jsonl",
        build_state_transition_event(session_id=binding.session_id, to_state="IDLE"),
    )

    snapshot = status_snapshot(repo_root=repo_root)

    assert snapshot.canonical_state == "IDLE"


def test_status_snapshot_reports_suspect_when_heartbeat_is_stale(tmp_path: Path) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    _write_manifest(repo_root)
    binding = bind_command(repo_root=repo_root)
    append_event(
        repo_root / ".agent-os" / "runtime" / "events.jsonl",
        {
            "session_id": binding.session_id,
            "timestamp": (datetime.now(UTC) - timedelta(seconds=31)).isoformat(),
            "event_type": "HEARTBEAT",
            "payload": {"state": "ACTIVE", "queue_depth": 0, "loaded_skills": [], "hot_cache_size": 0, "cold_cache_size": 0, "last_error": None},
        },
    )

    snapshot = status_snapshot(repo_root=repo_root)

    assert snapshot.active is True
    assert snapshot.runtime_health_state == "SUSPECT"


def test_status_snapshot_reports_suspect_when_canonical_heartbeat_is_stale(tmp_path: Path) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    _write_manifest(repo_root)
    binding = bind_command(repo_root=repo_root)
    append_event(
        repo_root / ".agent-os" / "runtime" / "events.jsonl",
        build_heartbeat_event(
            session_id=binding.session_id,
            state="ACTIVE",
            timestamp=(datetime.now(UTC) - timedelta(seconds=31)).isoformat(),
        ),
    )

    snapshot = status_snapshot(repo_root=repo_root)

    assert snapshot.runtime_health_state == "SUSPECT"


def test_status_snapshot_reports_degraded_when_heartbeat_is_too_old(tmp_path: Path) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    _write_manifest(repo_root)
    binding = bind_command(repo_root=repo_root)
    append_event(
        repo_root / ".agent-os" / "runtime" / "events.jsonl",
        {
            "session_id": binding.session_id,
            "timestamp": (datetime.now(UTC) - timedelta(seconds=61)).isoformat(),
            "event_type": "HEARTBEAT",
            "payload": {"state": "ACTIVE", "queue_depth": 0, "loaded_skills": [], "hot_cache_size": 0, "cold_cache_size": 0, "last_error": None},
        },
    )

    snapshot = status_snapshot(repo_root=repo_root)

    assert snapshot.active is True
    assert snapshot.runtime_health_state == "DEGRADED"


def test_render_status_view_highlights_active_and_detached_states(tmp_path: Path) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    _write_manifest(repo_root)
    binding = bind_command(repo_root=repo_root)
    action_hash = request_critical_action(
        repo_root=repo_root,
        session_id=binding.session_id,
        capability="trade_execute",
        resolved_args={"ticker": "BTC", "size": 1.0},
        ttl_seconds=30,
    )

    active_view = render_status_view(status_snapshot(repo_root=repo_root), use_color=True)
    assert "ACTIVE SESSION" in active_view
    assert "runtime_health_state: ACTIVE" in active_view
    assert Fore.YELLOW in active_view
    assert action_hash in active_view

    (repo_root / ".agent-os.lock").unlink()
    detached_view = render_status_view(status_snapshot(repo_root=repo_root), use_color=True)
    assert "DETACHED SESSION" in detached_view
    assert Style.DIM in detached_view


def test_approve_command_mirrors_projection_and_unlocks_session(tmp_path: Path) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    _write_manifest(repo_root)
    binding = bind_command(repo_root=repo_root)
    action_hash = request_critical_action(
        repo_root=repo_root,
        session_id=binding.session_id,
        capability="trade_execute",
        resolved_args={"ticker": "BTC", "size": 1.0},
        ttl_seconds=30,
    )

    approve_command(repo_root=repo_root, action_hash=action_hash, approver_meta={"actor": "human"})

    projection = ApprovalStore(repo_root / "data_store" / "knowledge.db").get_projection(
        binding.session_id,
        action_hash,
    )
    snapshot = status_snapshot(repo_root=repo_root)

    assert projection is not None
    assert projection.final_status == "APPROVED"
    assert snapshot.projection_state == "APPROVED"
    assert snapshot.canonical_approval_state == "APPROVED"
    assert snapshot.effective_execution_state == "READY"
    assert snapshot.authority_reason is None


def test_deny_command_marks_projection_denied(tmp_path: Path) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    _write_manifest(repo_root)
    binding = bind_command(repo_root=repo_root)
    action_hash = request_critical_action(
        repo_root=repo_root,
        session_id=binding.session_id,
        capability="trade_execute",
        resolved_args={"ticker": "BTC", "size": 1.0},
        ttl_seconds=30,
    )

    deny_command(repo_root=repo_root, action_hash=action_hash, reason="human_declined")

    projection = ApprovalStore(repo_root / "data_store" / "knowledge.db").get_projection(
        binding.session_id,
        action_hash,
    )
    snapshot = status_snapshot(repo_root=repo_root)

    assert projection is not None
    assert projection.final_status == "DENIED"
    assert snapshot.canonical_state == "IDLE"


def test_status_snapshot_blocks_detached_projection_only_approval(tmp_path: Path) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    _write_manifest(repo_root)
    binding = bind_command(repo_root=repo_root)
    action_hash = request_critical_action(
        repo_root=repo_root,
        session_id=binding.session_id,
        capability="trade_execute",
        resolved_args={"ticker": "BTC", "size": 1.0},
        ttl_seconds=30,
    )
    approve_command(repo_root=repo_root, action_hash=action_hash, approver_meta={"actor": "human"})
    (repo_root / ".agent-os.lock").unlink()

    snapshot = status_snapshot(repo_root=repo_root)

    assert snapshot.mode == "DETACHED"
    assert snapshot.canonical_approval_state == "APPROVED"
    assert snapshot.projection_state == "APPROVED"
    assert snapshot.effective_execution_state == "BLOCKED"
    assert snapshot.authority_reason == "Projection shows approval history, but detached status cannot authorize execution."


def test_render_status_view_explains_projection_canonical_mismatch(tmp_path: Path) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    _write_manifest(repo_root)
    binding = bind_command(repo_root=repo_root)
    action_hash = request_critical_action(
        repo_root=repo_root,
        session_id=binding.session_id,
        capability="trade_execute",
        resolved_args={"ticker": "BTC", "size": 1.0},
        ttl_seconds=30,
    )
    approve_command(repo_root=repo_root, action_hash=action_hash, approver_meta={"actor": "human"})
    (repo_root / ".agent-os.lock").unlink()

    view = render_status_view(status_snapshot(repo_root=repo_root), use_color=False)

    assert "canonical_approval_state: APPROVED" in view
    assert "projection_state: APPROVED" in view
    assert "effective_execution_state: BLOCKED" in view
    assert "authority_reason: Projection shows approval history, but detached status cannot authorize execution." in view


def test_watch_status_clears_terminal_and_renders_snapshot(tmp_path: Path) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    _write_manifest(repo_root)
    bind_command(repo_root=repo_root)

    stream = io.StringIO()
    stream.isatty = lambda: False  # type: ignore[attr-defined]
    watch_status(repo_root=repo_root, stream=stream, interval_seconds=0, iterations=1)

    output = stream.getvalue()
    assert "\033[2J\033[H" in output
    assert "ACTIVE SESSION" in output


def test_watch_status_refreshes_heartbeat_for_active_session(tmp_path: Path) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    _write_manifest(repo_root)
    bind_command(repo_root=repo_root)
    log_path = repo_root / ".agent-os" / "runtime" / "events.jsonl"
    before = len([event for event in read_events(log_path) if event["event_type"] == "HEARTBEAT"])

    stream = io.StringIO()
    stream.isatty = lambda: False  # type: ignore[attr-defined]
    watch_status(repo_root=repo_root, stream=stream, interval_seconds=0, iterations=1)

    after = len([event for event in read_events(log_path) if event["event_type"] == "HEARTBEAT"])
    assert after == before + 1


def test_watch_status_handles_keyboard_interrupt_cleanly(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    _write_manifest(repo_root)
    bind_command(repo_root=repo_root)

    stream = io.StringIO()
    stream.isatty = lambda: False  # type: ignore[attr-defined]

    def _boom(_seconds: float) -> None:
        raise KeyboardInterrupt

    monkeypatch.setattr("context_os_runtime.cli.time.sleep", _boom)

    watch_status(repo_root=repo_root, stream=stream, interval_seconds=2, iterations=None)


def test_doctor_reports_healthy_repo(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    _write_manifest(repo_root)
    bind_command(repo_root=repo_root)
    store = Store(repo_root / "data_store" / "knowledge.db")
    store.init_schema()
    monkeypatch.setattr("context_os_runtime.doctor.run_bundle_verifier", _fake_verifier_ok)
    monkeypatch.setattr(shutil, "which", lambda _name: "/usr/local/bin/brain")

    with pytest.raises(SystemExit) as exc:
        main(["doctor", "--repo", str(repo_root)])

    out = capsys.readouterr().out
    assert exc.value.code == 0
    assert "Agent OS doctor: HEALTHY" in out
    assert "OK    Project manifest loaded" in out


def test_doctor_warns_when_repo_is_detached(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    _write_manifest(repo_root)
    bind_command(repo_root=repo_root)
    (repo_root / ".agent-os.lock").unlink()
    monkeypatch.setattr("context_os_runtime.doctor.run_bundle_verifier", _fake_verifier_ok)
    monkeypatch.setattr(shutil, "which", lambda _name: "/usr/local/bin/brain")

    with pytest.raises(SystemExit) as exc:
        main(["doctor", "--repo", str(repo_root)])

    out = capsys.readouterr().out
    assert exc.value.code == 0
    assert "Agent OS doctor: ATTENTION NEEDED" in out
    assert "No active lock found" in out


def test_doctor_fails_when_manifest_is_missing(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    monkeypatch.setattr("context_os_runtime.doctor.run_bundle_verifier", _fake_verifier_ok)
    monkeypatch.setattr(shutil, "which", lambda _name: "/usr/local/bin/brain")

    with pytest.raises(SystemExit) as exc:
        main(["doctor", "--repo", str(repo_root)])

    assert exc.value.code == 1
    assert "valid .agent-os.yaml" in capsys.readouterr().out


def test_doctor_fails_when_active_lock_has_no_canonical_log(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    _write_manifest(repo_root)
    bind_command(repo_root=repo_root)
    (repo_root / ".agent-os" / "runtime" / "events.jsonl").unlink()
    monkeypatch.setattr("context_os_runtime.doctor.run_bundle_verifier", _fake_verifier_ok)
    monkeypatch.setattr(shutil, "which", lambda _name: "/usr/local/bin/brain")

    with pytest.raises(SystemExit) as exc:
        main(["doctor", "--repo", str(repo_root)])

    out = capsys.readouterr().out
    assert exc.value.code == 1
    assert "Canonical runtime log is missing" in out


def test_doctor_warns_when_brain_cli_is_missing(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    _write_manifest(repo_root)
    bind_command(repo_root=repo_root)
    monkeypatch.setattr("context_os_runtime.doctor.run_bundle_verifier", _fake_verifier_ok)
    monkeypatch.setattr(shutil, "which", lambda _name: None)

    with pytest.raises(SystemExit) as exc:
        main(["doctor", "--repo", str(repo_root)])

    out = capsys.readouterr().out
    assert exc.value.code == 0
    assert "brain CLI is not available" in out


def test_doctor_fails_when_bundle_verifier_fails(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    _write_manifest(repo_root)
    bind_command(repo_root=repo_root)
    monkeypatch.setattr("context_os_runtime.doctor.run_bundle_verifier", _fake_verifier_fail)
    monkeypatch.setattr(shutil, "which", lambda _name: "/usr/local/bin/brain")

    with pytest.raises(SystemExit) as exc:
        main(["doctor", "--repo", str(repo_root)])

    out = capsys.readouterr().out
    assert exc.value.code == 1
    assert "Bundle verification failed" in out


def test_doctor_output_includes_next_steps_section(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    _write_manifest(repo_root)
    bind_command(repo_root=repo_root)
    (repo_root / ".agent-os.lock").unlink()
    monkeypatch.setattr("context_os_runtime.doctor.run_bundle_verifier", _fake_verifier_ok)
    monkeypatch.setattr(shutil, "which", lambda _name: None)

    with pytest.raises(SystemExit):
        main(["doctor", "--repo", str(repo_root)])

    out = capsys.readouterr().out
    assert "What to do next:" in out
    assert "Run `context-os bind` in this repository" in out


# ---------------------------------------------------------------------------
# Task 10: bind exits non-zero on constitution hard-fail
# ---------------------------------------------------------------------------


def test_bind_command_exits_nonzero_on_constitution_hard_fail(tmp_path: Path) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    _write_manifest(repo_root)
    path = repo_root / "AGENT_OS_CONSTITUTION.md"
    path.write_text(path.read_text(encoding="utf-8") + "\n# tampered", encoding="utf-8")

    with pytest.raises(SystemExit) as exc_info:
        bind_command(repo_root=repo_root)

    assert exc_info.value.code == 1


def test_bind_command_emits_not_active_event_on_hard_fail(tmp_path: Path) -> None:
    repo_root = tmp_path / "brain_playground"
    repo_root.mkdir()
    _write_manifest(repo_root)
    path = repo_root / "AGENT_OS_CONSTITUTION.md"
    path.write_text(path.read_text(encoding="utf-8") + "\n# tampered", encoding="utf-8")

    with pytest.raises(SystemExit):
        bind_command(repo_root=repo_root)

    log_path = repo_root / ".agent-os" / "runtime" / "events.jsonl"
    events = read_events(log_path)
    binding_events = [e for e in events if e["event_type"] == "BINDING"]
    assert binding_events
    assert binding_events[-1]["payload"]["failed_condition"] == "C4"
