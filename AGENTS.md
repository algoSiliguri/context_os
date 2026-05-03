[A1] Self-Declaration
This file is non-authoritative. It does not define execution rules, policies, or system identity. It only attempts to invoke the governing contract.

[A2] Invocation Instruction
Before any execution begins, read: `./AGENT_OS_CONSTITUTION.md`.
The file at that path is the governing contract for this session.

[A3] Failure Instruction
If that file cannot be read, does not exist, or cannot be bound as governing authority:
- Do not proceed as Agent OS active
- Produce the required NOT_ACTIVE binding output immediately
- Operate under no Agent OS authority

[A4] Deference
If the file is successfully bound, follow its binding conditions, invalidation conditions, and output contract exactly. This file has no further instructions.

[A5] Capability Declaration
```yaml
harness-id: [pi, codex]
capability-tier: 1
l3-transport: bash-cli
brain-db-path: $BRAIN_DB_PATH
```

## Agent skills

Non-authoritative pointers to engineering-skill configuration. Per `[A1]` and `[B6]` of the constitution, these are L2 metadata only — they describe where docs live, they do not grant authority.

### Issue tracker

GitHub Issues at `algoSiliguri/context_os`. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context. See `docs/agents/domain.md`.
