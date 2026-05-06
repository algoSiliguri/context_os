// tests/unit/ccp/commands/init/prompts.test.ts
import { describe, expect, it } from 'vitest';
import { type PromptInputs, collectPrompts } from '../../../../../src/ccp/commands/init/prompts';
import type { UiAdapter } from '../../../../../src/pi/ui';

function stubUi(scripted: { inputs: string[]; selects: string[] }): UiAdapter {
  let i = 0;
  let s = 0;
  return {
    confirm: async () => true,
    input: async () => scripted.inputs[i++] ?? '',
    select: async () => scripted.selects[s++] ?? '',
  };
}

describe('collectPrompts', () => {
  it('returns provided values without prompting when all are passed', async () => {
    const ui = stubUi({ inputs: [], selects: [] });
    const inputs: PromptInputs = {
      projectId: 'my-project',
      domainType: 'trading-research',
      verificationProfile: 'production',
      memoryNamespace: 'my-project',
      criticalActions: ['trade_execute'],
    };
    expect(await collectPrompts({ ui, defaults: inputs, allowPrompt: false })).toEqual(inputs);
  });

  it('prompts for missing project_id when allowPrompt is true', async () => {
    // collectPrompts asks for: projectId, domainType, verificationProfile (via select), memoryNamespace, criticalActions
    const ui = stubUi({
      inputs: ['my-project', 'general', 'my-project', ''],
      selects: ['production'],
    });
    const result = await collectPrompts({ ui, defaults: {}, allowPrompt: true });
    expect(result.projectId).toBe('my-project');
    expect(result.domainType).toBe('general');
    expect(result.verificationProfile).toBe('production');
    expect(result.memoryNamespace).toBe('my-project');
    expect(result.criticalActions).toEqual([]);
  });

  it('throws when allowPrompt is false and project_id is missing', async () => {
    const ui = stubUi({ inputs: [], selects: [] });
    await expect(collectPrompts({ ui, defaults: {}, allowPrompt: false })).rejects.toThrow(
      /project_id is required/,
    );
  });

  it('throws when defaults.projectId is invalid', async () => {
    const ui = stubUi({ inputs: [], selects: [] });
    await expect(
      collectPrompts({ ui, defaults: { projectId: 'Foo' }, allowPrompt: false }),
    ).rejects.toThrow(/lowercase/);
  });
});
