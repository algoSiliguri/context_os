import type { PhaseDefinition, ValidatorDefinition, WorkflowPackManifest } from './workflow-pack-loader';

export interface PhaseGateResult {
  allowed: boolean;
  phaseId: string;
  missingPredecessors: string[];
}

/**
 * Immutable registry built from a WorkflowPackManifest.
 * Provides predecessor checks without side effects.
 * Callers own event emission.
 */
export class PhaseRegistry {
  private readonly phases: Map<string, PhaseDefinition>;
  private readonly validators: Map<string, ValidatorDefinition>;
  readonly packId: string;
  readonly packVersion: string;

  constructor(manifest: WorkflowPackManifest) {
    this.packId = manifest.workflow_pack_id;
    this.packVersion = manifest.version;
    this.phases = new Map(manifest.phases.map((p) => [p.id, p]));
    this.validators = new Map(manifest.validators.map((v) => [v.id, v]));
  }

  getPhase(phaseId: string): PhaseDefinition | undefined {
    return this.phases.get(phaseId);
  }

  listPhaseIds(): string[] {
    return [...this.phases.keys()];
  }

  /**
   * Check whether phaseId is allowed to run given the set of already-completed phases.
   * A phase with no allowed_predecessors can always run.
   * A phase with predecessors requires at least one to be in completedPhases.
   */
  checkPredecessors(phaseId: string, completedPhases: ReadonlySet<string>): PhaseGateResult {
    const phase = this.phases.get(phaseId);
    if (!phase) {
      return { allowed: false, phaseId, missingPredecessors: [`unknown phase: ${phaseId}`] };
    }

    const required = phase.allowed_predecessors;
    if (required.length === 0) {
      return { allowed: true, phaseId, missingPredecessors: [] };
    }

    const satisfied = required.some((p) => completedPhases.has(p));
    return {
      allowed: satisfied,
      phaseId,
      missingPredecessors: satisfied ? [] : required,
    };
  }

  requiresApproval(phaseId: string): boolean {
    return this.phases.get(phaseId)?.requires_approval ?? false;
  }

  mayEditSource(phaseId: string): boolean {
    return this.phases.get(phaseId)?.may_edit_source ?? false;
  }

  validatorsFor(phaseId: string): string[] {
    return this.phases.get(phaseId)?.validators ?? [];
  }

  getValidatorDef(id: string): ValidatorDefinition | undefined {
    return this.validators.get(id);
  }

  allValidatorDefs(): ValidatorDefinition[] {
    return [...this.validators.values()];
  }
}
