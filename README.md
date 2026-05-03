# @agnivadc/agent-os

Machine-local governance runtime for Agent OS. TypeScript implementation
loaded as a Pi extension (and via the public API surface in `src/index.ts`
for any future harness adapter). Foundation for the AI Coding Control
Plane (CCP).

## Install

```bash
pi install npm:@agnivadc/agent-os
```

## Bind a project

Create `.agent-os/project.yaml`:

```yaml
project_id: my-project
domain_type: general
runtime_version: 0.1.0
memory_namespace: my-project
verification_profile: default
critical_actions: []
workspace:
  root: .
```

Then run `npm run bootstrap` to verify your setup, or just start `pi`.

## Architecture

See `docs/design/2026-04-26-agent-os-v3-design.md` and the CCP design at
`project/docs/superpowers/specs/2026-05-03-agent-os-ccp-v1-design.md`.

## Develop

```bash
npm install
npm test
npm run typecheck
npm run lint
```

## License

[…]
