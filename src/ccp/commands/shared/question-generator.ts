export type GrillCategory = 'assumption' | 'risk' | 'constraint' | 'success_criterion' | 'evidence';

export interface NextQuestionContext {
  goal: string;
  priorAnswers: Array<{ category: GrillCategory | string; answer: string }>;
}

export interface NextQuestion {
  category: GrillCategory;
  question: string;
  whyItMatters: string;
}

export interface QuestionGenerator {
  next(ctx: NextQuestionContext): Promise<NextQuestion | null>;
}

const SEQUENCE: NextQuestion[] = [
  {
    category: 'assumption',
    question: 'What does this idea ASSUME about the existing code that might be wrong?',
    whyItMatters: 'Wrong assumptions cause wasted work.',
  },
  {
    category: 'assumption',
    question: 'What user behavior are we ASSUMING — backed by what evidence?',
    whyItMatters: 'Distinguishes need from guess.',
  },
  {
    category: 'risk',
    question: 'What is the WORST that could happen if this ships and is wrong?',
    whyItMatters: 'Calibrates blast radius.',
  },
  {
    category: 'risk',
    question: 'What is the most likely failure MODE during implementation?',
    whyItMatters: 'Plan around it.',
  },
  {
    category: 'constraint',
    question: 'What MUST NOT change as part of this work?',
    whyItMatters: 'Sets the boundary.',
  },
  {
    category: 'success_criterion',
    question: 'How will we KNOW this is done — what specific signal?',
    whyItMatters: 'Avoids "kind of works".',
  },
  {
    category: 'evidence',
    question: 'What evidence (file, log, test) supports the chosen approach?',
    whyItMatters: 'Distinguishes guesswork from grounding.',
  },
];

/**
 * Template-driven default for v1 — emits a fixed sequence and terminates
 * when the user types the literal string "done" as their answer.
 *
 * Known limitation: the success_criterion question itself contains the word
 * "done", so a literal "done" answer there is ambiguous. An LLM-backed
 * `QuestionGenerator` should detect "user is finished" semantically.
 *
 * Replace via `QuestionGenerator` interface in Plan 2c (LLM-backed grill).
 */
export function defaultQuestionGenerator(): QuestionGenerator {
  return {
    async next(ctx) {
      const lastAnswer = ctx.priorAnswers[ctx.priorAnswers.length - 1];
      if (lastAnswer && lastAnswer.answer.trim().toLowerCase() === 'done') return null;
      const idx = ctx.priorAnswers.length;
      if (idx >= SEQUENCE.length) return null;
      return SEQUENCE[idx]!;
    },
  };
}
