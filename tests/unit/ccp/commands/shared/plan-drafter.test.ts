import { describe, expect, it } from 'vitest';
import { defaultPlanDrafter } from '../../../../../src/ccp/commands/shared/plan-drafter';

describe('defaultPlanDrafter', () => {
  it('produces a single placeholder step for goal-only input', async () => {
    const drafter = defaultPlanDrafter();
    const plan = await drafter.draft({
      goal: 'add rate limit',
      assumptions: [],
      risks: [],
      constraints: [],
      successCriteria: [],
      workspaceRoot: '/repo',
    });
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]?.title.toLowerCase()).toContain('rate limit');
    expect(plan.scope.in).toContain('.');
    expect(plan.rollback.strategy).toBeTruthy();
  });

  it('lifts success criteria into a verification step', async () => {
    const drafter = defaultPlanDrafter();
    const plan = await drafter.draft({
      goal: 'g',
      assumptions: [],
      risks: [],
      constraints: [],
      successCriteria: [{ id: 'SC-1', text: 'tests in tests/foo.test.ts pass' }],
      workspaceRoot: '/repo',
    });
    expect(plan.steps[0]?.verification.length).toBeGreaterThan(0);
  });
});
