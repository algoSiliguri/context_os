import { describe, expect, it } from 'vitest';
import { defaultQuestionGenerator } from '../../../../../src/ccp/commands/shared/question-generator';

describe('defaultQuestionGenerator', () => {
  it('produces a fixed sequence covering the 5 categories', async () => {
    const gen = defaultQuestionGenerator();
    const seen: string[] = [];
    let next = await gen.next({ goal: 'add rate limit', priorAnswers: [] });
    while (next !== null) {
      seen.push(next.category);
      next = await gen.next({
        goal: 'add rate limit',
        priorAnswers: [...seen.map((c) => ({ category: c, answer: 'ok' }))],
      });
    }
    expect(seen).toContain('assumption');
    expect(seen).toContain('risk');
    expect(seen).toContain('constraint');
    expect(seen).toContain('success_criterion');
    expect(seen).toContain('evidence');
    expect(seen.length).toBeGreaterThanOrEqual(5);
    expect(seen.length).toBeLessThanOrEqual(7);
  });

  it('terminates when priorAnswers includes "done" sentinel', async () => {
    const gen = defaultQuestionGenerator();
    const r = await gen.next({
      goal: 'g',
      priorAnswers: [{ category: 'assumption', answer: 'done' }],
    });
    expect(r).toBeNull();
  });
});
