/**
 * The fixed question set asked of the decision model (Laya via laya-serve,
 * or TypeSafe Jev — both speak the same Jev-compatible shape).
 *
 * Design rule: every question must earn its place by moving money or safety.
 * - model_tier / thinking  -> token spend
 * - needs_tools / destructive / is_gated -> safety + correct harness behavior
 * - task_type / complexity / scope -> routing + instruction quality
 *
 * Laya never generates text, so "what files to touch" stays coarse here:
 * subsystem-level only. Fine-grained targeting is the executor's job.
 */

export const DECISION_QUESTIONS = {
  task_type: {
    type: 'choice',
    instructions: 'What kind of work is being requested?',
    criteria: {
      implement: 'writing new code, features, or making changes',
      debug: 'fixing a bug, diagnosing a failure, investigating an error',
      review: 'reviewing existing code, a diff, or a pull request',
      research: 'exploring, looking something up, gathering information',
      question: 'answering a question; no action or changes needed',
      ops: 'running commands, deploys, migrations, or system operations',
      other: "doesn't fit the categories above",
    },
  },
  complexity: {
    type: 'choice',
    instructions: 'How complex is this task?',
    criteria: {
      trivial: 'a few minutes, single file, obvious approach',
      moderate: 'multiple files or steps, some judgment required',
      complex: 'ambiguous, cross-cutting, or high-stakes design work',
    },
  },
  model_tier: {
    type: 'choice',
    instructions: 'Which execution tier fits this task?',
    criteria: {
      local: 'the small local model can handle it alone, no cloud needed',
      cheap: 'needs a capable cloud model but not the flagship',
      flagship: 'needs the strongest available model',
    },
  },
  thinking: {
    type: 'choice',
    instructions: 'How much reasoning effort should the executor use?',
    criteria: {
      off: 'answer directly, no extended reasoning',
      low: 'brief reasoning before acting',
      high: 'extended reasoning; think carefully step by step',
    },
  },
  needs_tools: {
    type: 'noul',
    instructions:
      'Does this require running commands, reading files, or using tools — as opposed to just answering from knowledge?',
  },
  is_gated: {
    type: 'noul',
    instructions:
      'Must a check, verification, or prerequisite review complete BEFORE the main work may begin? (e.g. "check X first, if ok then implement")',
  },
  destructive: {
    type: 'noul',
    instructions:
      'Could this delete data, modify production, spend money, or cause irreversible effects?',
  },
  needs_tests: {
    type: 'noul',
    instructions:
      'If this request leads to code being written or changed, should tests be written or updated as part of the work?',
  },
  scope: {
    type: 'choice',
    instructions:
      'Which part of the codebase does this touch? Coarse subsystem only — guess unknown when unclear.',
    // 👇 EDIT ME: replace with your repo's actual areas.
    criteria: {
      frontend: 'UI, components, styling, client-side code',
      backend: 'APIs, services, business logic, data layer',
      infra: 'build, deploy, CI, configuration, environments',
      docs: 'documentation only',
      unknown: 'cannot tell from the request',
    },
  },
} as const;

export type QuestionName = keyof typeof DECISION_QUESTIONS;

/** A parsed, normalized answer: value + calibrated confidence in [0,1]. */
export interface TypedAnswer {
  value: string | number | boolean;
  confidence: number;
  /** Raw P(yes) for noul answers. The probability IS the signal — there is no
   *  separate confidence. Near 0.5 means genuine uncertainty, not "medium". */
  probability?: number;
  /** Full per-option distribution for choice answers (sums to 1). */
  probabilities?: Record<string, number>;
}

export interface DecisionUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface Decision {
  answers: Record<QuestionName, TypedAnswer>;
  usage: DecisionUsage;
  raw: unknown;
}

/** Convenience accessors with safe fallbacks. */
export function choice(d: Decision, name: QuestionName): string {
  return String(d.answers[name]?.value ?? 'unknown');
}
export function conf(d: Decision, name: QuestionName): number {
  return Number(d.answers[name]?.confidence ?? 0);
}
export function yes(d: Decision, name: QuestionName): boolean {
  return d.answers[name]?.value === true;
}
