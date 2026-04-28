#!/usr/bin/env python3
import hashlib
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(".")

REQUIRED_FILES = [
    "AGENT_OS_CONSTITUTION.md",
    "CLAUDE.md",
    "AGENTS.md",
    "context_os_runtime/authority.py",
    "context_os_runtime/runtime_paths.py",
    "context_os_runtime/session_store.py",
    ".github/copilot-instructions.md",
    ".agent-os/schemas/constitution-binding.schema.json",
    ".agent-os/schemas/telemetry-event.schema.json",
    ".agent-os/schemas/permission-manifest.schema.json",
    ".agent-os/schemas/project-binding.schema.json",
    ".agent-os/schemas/session-binding-record.schema.json",
    ".agent-os/contracts/index.json",
    ".agent-os/contracts/signature.json",
    "execution/SKILL_REGISTRY.md",
    "memory/MEMORY.md",
]


def fail(msg: str) -> int:
    print(f"FAIL: {msg}")
    return 1


def parse_binding_header(text: str) -> dict:
    m = re.search(r"```yaml\n(.*?)\n```", text, flags=re.S)
    if not m:
        raise ValueError("missing YAML header block")
    data = {}
    for line in m.group(1).splitlines():
        if ":" not in line:
            continue
        k, v = line.split(":", 1)
        data[k.strip()] = v.strip().strip('"')
    return data


def main() -> int:
    for rel in REQUIRED_FILES:
        if not (ROOT / rel).exists():
            return fail(f"required file missing: {rel}")

    constitution = (ROOT / "AGENT_OS_CONSTITUTION.md").read_text(encoding="utf-8")
    for block in ["[B0]", "[B1]", "[B2]", "[B3]", "[B4]", "[B5]", "[B6]", "[B7]", "[B8]", "[B9]", "[B10]", "[B11]"]:
        if block not in constitution:
            return fail(f"constitution missing {block}")

    header = parse_binding_header(constitution)
    for key in [
        "system-id",
        "version",
        "canonical-path",
        "content-hash",
        "schema-version",
        "contract-index-hash",
        "clause-count",
        "blocks",
        "binding-mode",
        "signature-required",
    ]:
        if key not in header:
            return fail(f"binding header missing {key}")

    for rel in [
        ".agent-os/schemas/constitution-binding.schema.json",
        ".agent-os/schemas/telemetry-event.schema.json",
        ".agent-os/schemas/permission-manifest.schema.json",
        ".agent-os/contracts/index.json",
        ".agent-os/contracts/signature.json",
    ]:
        try:
            json.loads((ROOT / rel).read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            return fail(f"invalid JSON in {rel}: {e}")

    # Check adapter structure for A1-A4 tags and no extra authority claims.
    banned = re.compile(r"sole authority|governing rules", re.I)
    for rel in ["CLAUDE.md", "AGENTS.md", ".github/copilot-instructions.md"]:
        text = (ROOT / rel).read_text(encoding="utf-8")
        for tag in ["[A1]", "[A2]", "[A3]", "[A4]", "[A5]"]:
            if tag not in text:
                return fail(f"{rel} missing {tag}")
        if banned.search(text):
            return fail(f"{rel} contains authority language")

    # Run helper checks.
    if subprocess.run(["python3", "scripts/compute_constitution_hash.py", "--check"]).returncode != 0:
        return fail("constitution hash check failed")
    if subprocess.run(["python3", "scripts/generate_contract_index.py", "--check"]).returncode != 0:
        return fail("contract index check failed")

    # Ensure contract-index-hash equals current index file hash.
    index_bytes = (ROOT / ".agent-os/contracts/index.json").read_bytes()
    index_hash = hashlib.sha256(index_bytes).hexdigest()
    if header.get("contract-index-hash", "") != index_hash:
        return fail("B0 contract-index-hash mismatch")

    print("OK: Agent OS bundle verification passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
