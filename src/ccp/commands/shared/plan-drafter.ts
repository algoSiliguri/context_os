export interface DraftInput {
  goal: string;
  assumptions: Array<{ id: string; text: string }>;
  risks: Array<{ id: string; risk: string }>;
  constraints: Array<{ id: string; text: string }>;
  successCriteria: Array<{ id: string; text: string }>;
  workspaceRoot: string;
}

export interface DraftedStep {
  id: string;
  title: string;
  purpose: string;
  expected_files: Array<{ path: string; operation: 'read' | 'create' | 'modify' | 'delete' }>;
  commands: Array<{ command: string; approval_tier: 1 | 2 | 3 | 4 }>;
  verification: Array<{ command: string; expected_signal: string }>;
  risk_tier: 'low' | 'medium' | 'high' | 'critical';
  depends_on: string[];
}

export interface DraftedPlan {
  scope: { in: string[]; out: string[] };
  steps: DraftedStep[];
  approval_required: Array<{ id: string; reason: string }>;
  rollback: { strategy: string };
}

export interface PlanDrafter {
  draft(input: DraftInput): Promise<DraftedPlan>;
}

export function defaultPlanDrafter(): PlanDrafter {
  return {
    async draft(input) {
      const verification =
        input.successCriteria.length === 0
          ? [{ command: 'npm test', expected_signal: 'exit code 0' }]
          : input.successCriteria.map((sc) => ({
              command: 'npm test',
              expected_signal: sc.text,
            }));
      const step: DraftedStep = {
        id: 'S-001',
        title: `Implement: ${input.goal}`,
        purpose: input.goal,
        expected_files: [],
        commands: [],
        verification,
        risk_tier: input.risks.length > 2 ? 'high' : input.risks.length > 0 ? 'medium' : 'low',
        depends_on: [],
      };
      return {
        scope: { in: ['.'], out: [] },
        steps: [step],
        approval_required: [],
        rollback: { strategy: 'git reset --hard pre-state captured before /run' },
      };
    },
  };
}
