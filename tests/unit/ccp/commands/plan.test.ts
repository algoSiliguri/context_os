import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { makeEnvelope } from '../../../../src/ccp/artifacts/envelope';
import { writeArtifact } from '../../../../src/ccp/artifacts/io';
import { runPlan } from '../../../../src/ccp/commands/plan';
import { PackPlanDrafter } from '../../../../src/core/pack-plan-drafter';
import { defaultPlanDrafter } from '../../../../src/ccp/commands/shared/plan-drafter';
import { writeTaskState } from '../../../../src/ccp/commands/shared/task-loader';
import { taskArtifactPath, taskStatePath } from '../../../../src/ccp/task-paths';
import { readEvents } from '../../../../src/core/event-log';
import { sessionEventsPath } from '../../../../src/core/runtime-paths';

const PACK_YAML_DETECTED = [
  'workflow_pack_id: agent-os-core',
  'version: 1.2.0',
  'schema_version: 1.0.0',
  'runtime_target: pi',
  'phases:',
  '  - id: grill',
  '    allowed_predecessors: []',
  'plan:',
  '  verification_profile: detected',
].join('\n');

function installPack(dir: string, yaml = PACK_YAML_DETECTED): void {
  const packDir = join(dir, '.agent-os', 'packs', 'agent-os-core');
  mkdirSync(packDir, { recursive: true });
  writeFileSync(join(packDir, 'workflow-pack.yaml'), yaml);
}

function fixtureWithGrill(decision = true): { dir: string; taskId: string } {
  const dir = mkdtempSync(join(tmpdir(), 'aos-pln-'));
  mkdirSync(join(dir, '.agent-os', 'runtime'), { recursive: true });
  const taskId = 'T-001';
  mkdirSync(join(dir, '.agent-os', 'tasks', taskId), { recursive: true });
  writeFileSync(
    join(dir, '.agent-os', 'runtime', 'session.json'),
    JSON.stringify({ session_id: 's1', current_task_id: taskId }),
    'utf-8',
  );
  writeTaskState(dir, taskId, 'SHARED_UNDERSTANDING');
  const env = makeEnvelope({ taskId, artifactType: 'GrillRecord' });
  writeArtifact(dir, taskId, 'grill', {
    ...env,
    artifact_type: 'GrillRecord',
    goal: 'Add rate limit',
    user_type: 'developer',
    problem_statement: 'p',
    assumptions: [],
    questions: [],
    risks: [],
    constraints: [],
    success_criteria: [],
    decision: { proceed: decision, reason: 'r' },
    open_blockers: [],
  });
  return { dir, taskId };
}

const approveUi = {
  confirm: async () => true,
  input: async () => '',
  select: async (_m: string, choices: string[]) => choices[0]!,
};

function fixtureWithDiagnosis(bugSummary = 'fix the null pointer crash'): { dir: string; taskId: string } {
  const dir = mkdtempSync(join(tmpdir(), 'aos-pln-dx-'));
  mkdirSync(join(dir, '.agent-os', 'runtime'), { recursive: true });
  const taskId = 'T-001';
  mkdirSync(join(dir, '.agent-os', 'tasks', taskId), { recursive: true });
  writeFileSync(
    join(dir, '.agent-os', 'runtime', 'session.json'),
    JSON.stringify({ session_id: 's1', current_task_id: taskId }),
    'utf-8',
  );
  writeTaskState(dir, taskId, 'SHARED_UNDERSTANDING');
  const env = makeEnvelope({ taskId, artifactType: 'DiagnosisRecord' });
  writeArtifact(dir, taskId, 'diagnosis', {
    ...env,
    artifact_type: 'DiagnosisRecord',
    bug_summary: bugSummary,
    reported_behavior: 'crashes on null input',
    expected_behavior: 'handles null gracefully',
    minimal_case: 'pass null to foo()',
    suspected_root_cause: 'missing null check',
    confidence: 'high',
    decision: 'proceed',
    open_blockers: [],
    phases: [],
    hypotheses: [],
  });
  return { dir, taskId };
}

describe('runPlan', () => {
  it('drafts, prompts, and writes PlanArtifact when approved', async () => {
    const { dir, taskId } = fixtureWithGrill();
    const result = await runPlan({ repoRoot: dir, sessionId: 's1', taskId, ui: approveUi });
    expect(result.outcome).toBe('approved');
    expect(existsSync(taskArtifactPath(dir, taskId, 'plan'))).toBe(true);
    const yaml = YAML.parse(readFileSync(taskArtifactPath(dir, taskId, 'plan'), 'utf-8'));
    expect(yaml.steps.length).toBeGreaterThanOrEqual(1);
    const stateRecord = JSON.parse(readFileSync(taskStatePath(dir, taskId), 'utf-8'));
    expect(stateRecord.state).toBe('AWAITING_PLAN_APPROVAL');
    const events = readEvents(sessionEventsPath(dir, 's1'));
    expect(events.find((e) => e.event_type === 'PLAN_CREATED')).toBeTruthy();
    expect(events.find((e) => e.event_type === 'PLAN_APPROVED')).toBeTruthy();
  });

  it('emits PLAN_REJECTED and reverts to SHARED_UNDERSTANDING when user rejects', async () => {
    const { dir, taskId } = fixtureWithGrill();
    const rejectUi = {
      confirm: async () => false,
      input: async () => 'too risky',
      select: async (_m: string, choices: string[]) => choices[0]!,
    };
    const result = await runPlan({ repoRoot: dir, sessionId: 's1', taskId, ui: rejectUi });
    expect(result.outcome).toBe('rejected');
    const events = readEvents(sessionEventsPath(dir, 's1'));
    expect(events.find((e) => e.event_type === 'PLAN_REJECTED')).toBeTruthy();
    const stateRecord = JSON.parse(readFileSync(taskStatePath(dir, taskId), 'utf-8'));
    expect(stateRecord.state).toBe('SHARED_UNDERSTANDING');
  });

  it('throws when task is not in SHARED_UNDERSTANDING', async () => {
    const { dir, taskId } = fixtureWithGrill();
    writeTaskState(dir, taskId, 'EXECUTING');
    await expect(
      runPlan({ repoRoot: dir, sessionId: 's1', taskId, ui: approveUi }),
    ).rejects.toThrow(/SHARED_UNDERSTANDING/);
  });

  it('PackPlanDrafter detected profile: verification uses detected command when Cargo.toml present', async () => {
    const { dir, taskId } = fixtureWithGrill();
    writeFileSync(join(dir, 'Cargo.toml'), '[package]\nname = "mylib"');
    const result = await runPlan({
      repoRoot: dir,
      sessionId: 's1',
      taskId,
      ui: approveUi,
      drafter: new PackPlanDrafter({ verification_profile: 'detected' }),
    });
    expect(result.outcome).toBe('approved');
    const yaml = YAML.parse(readFileSync(taskArtifactPath(dir, taskId, 'plan'), 'utf-8'));
    const firstStep = yaml.steps[0];
    expect(firstStep.verification.some((v: { command: string }) => v.command === 'cargo test')).toBe(true);
  });

  it('PackPlanDrafter detected profile: verification [] when no indicators', async () => {
    const { dir, taskId } = fixtureWithGrill();
    const result = await runPlan({
      repoRoot: dir,
      sessionId: 's1',
      taskId,
      ui: approveUi,
      drafter: new PackPlanDrafter({ verification_profile: 'detected' }),
    });
    expect(result.outcome).toBe('approved');
    const yaml = YAML.parse(readFileSync(taskArtifactPath(dir, taskId, 'plan'), 'utf-8'));
    expect(yaml.steps[0].verification).toEqual([]);
  });

  it('PackPlanDrafter none profile: verification [] always', async () => {
    const { dir, taskId } = fixtureWithGrill();
    writeFileSync(join(dir, 'Cargo.toml'), '[package]');
    const result = await runPlan({
      repoRoot: dir,
      sessionId: 's1',
      taskId,
      ui: approveUi,
      drafter: new PackPlanDrafter({ verification_profile: 'none' }),
    });
    expect(result.outcome).toBe('approved');
    const yaml = YAML.parse(readFileSync(taskArtifactPath(dir, taskId, 'plan'), 'utf-8'));
    expect(yaml.steps[0].verification).toEqual([]);
  });

  it('defaultPlanDrafter still works when no pack (regression)', async () => {
    const { dir, taskId } = fixtureWithGrill();
    const result = await runPlan({ repoRoot: dir, sessionId: 's1', taskId, ui: approveUi });
    expect(result.outcome).toBe('approved');
  });

  it('default path: pack with detected profile + vitest → vitest run in verification', async () => {
    const { dir, taskId } = fixtureWithGrill();
    installPack(dir);
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'vitest run' } }));
    await runPlan({ repoRoot: dir, sessionId: 's1', taskId, ui: approveUi });
    const yaml = YAML.parse(readFileSync(taskArtifactPath(dir, taskId, 'plan'), 'utf-8'));
    expect(yaml.steps[0].verification.some((v: { command: string }) => v.command === 'vitest run')).toBe(true);
  });

  it('default path: pack with detected profile + pyproject.toml → pytest in verification', async () => {
    const { dir, taskId } = fixtureWithGrill();
    installPack(dir);
    writeFileSync(join(dir, 'pyproject.toml'), '[tool.pytest]\n');
    await runPlan({ repoRoot: dir, sessionId: 's1', taskId, ui: approveUi });
    const yaml = YAML.parse(readFileSync(taskArtifactPath(dir, taskId, 'plan'), 'utf-8'));
    expect(yaml.steps[0].verification.some((v: { command: string }) => v.command === 'pytest')).toBe(true);
  });

  it('default path: pack with detected profile + gradlew → ./gradlew test in verification', async () => {
    const { dir, taskId } = fixtureWithGrill();
    installPack(dir);
    writeFileSync(join(dir, 'gradlew'), '#!/bin/sh');
    await runPlan({ repoRoot: dir, sessionId: 's1', taskId, ui: approveUi });
    const yaml = YAML.parse(readFileSync(taskArtifactPath(dir, taskId, 'plan'), 'utf-8'));
    expect(yaml.steps[0].verification.some((v: { command: string }) => v.command === './gradlew test')).toBe(true);
  });

  it('default path: pack with detected profile + no indicators → verification []', async () => {
    const { dir, taskId } = fixtureWithGrill();
    installPack(dir);
    await runPlan({ repoRoot: dir, sessionId: 's1', taskId, ui: approveUi });
    const yaml = YAML.parse(readFileSync(taskArtifactPath(dir, taskId, 'plan'), 'utf-8'));
    expect(yaml.steps[0].verification).toEqual([]);
  });

  it('explicit drafter wins over active pack', async () => {
    const { dir, taskId } = fixtureWithGrill();
    installPack(dir);
    writeFileSync(join(dir, 'Cargo.toml'), '[package]\nname = "mylib"');
    const explicitDrafter = new PackPlanDrafter({ verification_profile: 'none' });
    await runPlan({ repoRoot: dir, sessionId: 's1', taskId, ui: approveUi, drafter: explicitDrafter });
    const yaml = YAML.parse(readFileSync(taskArtifactPath(dir, taskId, 'plan'), 'utf-8'));
    expect(yaml.steps[0].verification).toEqual([]);
  });

  it('diagnose → plan flow: uses bug_summary from diagnosis.yaml when no grill.yaml', async () => {
    const { dir, taskId } = fixtureWithDiagnosis('fix the null pointer crash');
    const capturedGoals: string[] = [];
    const base = defaultPlanDrafter();
    const drafter = {
      draft: async (args: Parameters<typeof base.draft>[0]) => {
        capturedGoals.push(args.goal);
        return base.draft(args);
      },
    };
    await runPlan({ repoRoot: dir, sessionId: 's1', taskId, ui: approveUi, drafter });
    expect(capturedGoals[0]).toBe('fix the null pointer crash');
  });

  it('diagnose → plan flow: throws when both grill.yaml and diagnosis.yaml are absent', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aos-pln-nodx-'));
    mkdirSync(join(dir, '.agent-os', 'runtime'), { recursive: true });
    const taskId = 'T-001';
    mkdirSync(join(dir, '.agent-os', 'tasks', taskId), { recursive: true });
    writeFileSync(
      join(dir, '.agent-os', 'runtime', 'session.json'),
      JSON.stringify({ session_id: 's1', current_task_id: taskId }),
      'utf-8',
    );
    writeTaskState(dir, taskId, 'SHARED_UNDERSTANDING');
    await expect(
      runPlan({ repoRoot: dir, sessionId: 's1', taskId, ui: approveUi }),
    ).rejects.toThrow();
  });
});
