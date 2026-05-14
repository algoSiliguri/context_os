import { describe, expect, it } from 'vitest';
import { PhaseRegistry } from '../../src/core/phase-registry';
import type { WorkflowPackManifest } from '../../src/core/workflow-pack-loader';

function makeManifest(overrides: Partial<WorkflowPackManifest> = {}): WorkflowPackManifest {
  return {
    workflow_pack_id: 'test-pack',
    version: '1.0.0',
    schema_version: '1.0.0',
    runtime_target: 'pi',
    min_agent_os_version: '1.3.0',
    artifact_root: '.agent-os/tasks',
    task_id_pattern: 'T-\\d{3}',
    artifact_format: 'yaml',
    validators: [],
    prompt_warnings: [],
    phases: [
      {
        id: 'setup-workflow',
        agent_os_command: '/init',
        allowed_predecessors: [],
        produces: ['WorkflowConfig'],
        may_edit_source: false,
        requires_approval: false,
        validators: [],
      },
      {
        id: 'grill',
        agent_os_command: '/grill',
        allowed_predecessors: ['setup-workflow'],
        produces: ['GrillRecord'],
        may_edit_source: false,
        requires_approval: false,
        validators: ['validate-artifact'],
      },
      {
        id: 'write-plan',
        agent_os_command: '/plan',
        allowed_predecessors: ['grill'],
        produces: ['PlanArtifact'],
        may_edit_source: false,
        requires_approval: true,
        validators: ['validate-artifact', 'validate-plan-scope'],
      },
      {
        id: 'execute-plan',
        agent_os_command: '/run',
        allowed_predecessors: ['write-plan'],
        produces: ['ExecutionRecord'],
        may_edit_source: true,
        requires_approval: false,
        validators: [],
      },
    ],
    ...overrides,
  };
}

describe('PhaseRegistry', () => {
  it('exposes packId and packVersion from manifest', () => {
    const reg = new PhaseRegistry(makeManifest());
    expect(reg.packId).toBe('test-pack');
    expect(reg.packVersion).toBe('1.0.0');
  });

  it('getPhase returns undefined for unknown phase', () => {
    const reg = new PhaseRegistry(makeManifest());
    expect(reg.getPhase('nonexistent')).toBeUndefined();
  });

  it('getPhase returns definition for known phase', () => {
    const reg = new PhaseRegistry(makeManifest());
    const phase = reg.getPhase('grill');
    expect(phase?.id).toBe('grill');
    expect(phase?.agent_os_command).toBe('/grill');
  });

  it('listPhaseIds returns all registered phase ids', () => {
    const reg = new PhaseRegistry(makeManifest());
    expect(reg.listPhaseIds()).toEqual(
      expect.arrayContaining(['setup-workflow', 'grill', 'write-plan', 'execute-plan']),
    );
  });

  it('checkPredecessors: phase with no predecessors is always allowed', () => {
    const reg = new PhaseRegistry(makeManifest());
    const result = reg.checkPredecessors('setup-workflow', new Set());
    expect(result.allowed).toBe(true);
    expect(result.missingPredecessors).toEqual([]);
  });

  it('checkPredecessors: allowed when required predecessor is completed', () => {
    const reg = new PhaseRegistry(makeManifest());
    const result = reg.checkPredecessors('grill', new Set(['setup-workflow']));
    expect(result.allowed).toBe(true);
    expect(result.missingPredecessors).toEqual([]);
  });

  it('checkPredecessors: blocked when required predecessor not completed', () => {
    const reg = new PhaseRegistry(makeManifest());
    const result = reg.checkPredecessors('grill', new Set());
    expect(result.allowed).toBe(false);
    expect(result.missingPredecessors).toContain('setup-workflow');
  });

  it('checkPredecessors: phase with multiple predecessors — any one satisfies', () => {
    const manifest = makeManifest();
    manifest.phases.push({
      id: 'quick-task',
      agent_os_command: '/quick-task',
      allowed_predecessors: ['setup-workflow', 'grill'],
      produces: ['QuickTaskRecord'],
      may_edit_source: true,
      requires_approval: true,
      validators: [],
      escape_hatch: true,
    });
    const reg = new PhaseRegistry(manifest);
    // Only grill completed — setup-workflow also listed as predecessor; grill satisfies it
    expect(reg.checkPredecessors('quick-task', new Set(['grill'])).allowed).toBe(true);
    // Neither completed
    expect(reg.checkPredecessors('quick-task', new Set()).allowed).toBe(false);
  });

  it('checkPredecessors: returns blocked result for unknown phase', () => {
    const reg = new PhaseRegistry(makeManifest());
    const result = reg.checkPredecessors('unknown-phase', new Set(['grill']));
    expect(result.allowed).toBe(false);
    expect(result.missingPredecessors[0]).toMatch(/unknown phase/);
  });

  it('requiresApproval returns correct value per phase', () => {
    const reg = new PhaseRegistry(makeManifest());
    expect(reg.requiresApproval('grill')).toBe(false);
    expect(reg.requiresApproval('write-plan')).toBe(true);
  });

  it('mayEditSource returns correct value per phase', () => {
    const reg = new PhaseRegistry(makeManifest());
    expect(reg.mayEditSource('grill')).toBe(false);
    expect(reg.mayEditSource('execute-plan')).toBe(true);
  });

  it('validatorsFor returns empty array for unknown phase', () => {
    const reg = new PhaseRegistry(makeManifest());
    expect(reg.validatorsFor('nonexistent')).toEqual([]);
  });

  it('validatorsFor returns validator list for known phase', () => {
    const reg = new PhaseRegistry(makeManifest());
    expect(reg.validatorsFor('write-plan')).toEqual(['validate-artifact', 'validate-plan-scope']);
  });
});
