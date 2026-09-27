import { generateText } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { config } from './config.js';
import { choice, yes, type Decision } from './schema.js';
import type { BuiltState } from './state-builder.js';

/**
 * Instruction generation runs on the SMALL LOCAL model via oMLX.
 * It does constrained rewriting, not open-ended planning: the typed
 * decisions tell it what kind of instructions to write, and it turns
 * the user's directive + decisions into a clear brief for the executor.
 * Local, fast, free.
 */

const omlx = createOpenAICompatible({
  name: 'omlx',
  baseURL: config.omlxBaseUrl,
});

function decisionSummary(d: Decision): string {
  const a = d.answers;
  return Object.entries(a)
    .map(([k, ans]) => {
      const v =
        typeof ans.value === 'boolean' ? (ans.value ? 'yes' : 'no') : String(ans.value);
      const p =
        ans.probability !== undefined ? `, p=${ans.probability.toFixed(2)}` : '';
      return `- ${k}: ${v} (confidence ${ans.confidence.toFixed(2)}${p})`;
    })
    .join('\n');
}

const SYSTEM = `You write execution briefs for an AI coding agent. You receive:
1. The user's original directive (natural language).
2. Enriched reference context (e.g. issue bodies).
3. Typed decisions from a decision model, each with a confidence score.

Write a clear, self-contained brief the executor can follow without asking questions.
Structure:
- OBJECTIVE: one or two sentences.
- CONTEXT: the facts the executor needs (issue numbers, constraints, repo areas).
- PLAN: numbered steps in order.
- CONSTRAINTS: what NOT to do.
- DONE WHEN: how to know the task is complete.

Rules:
- Respect the typed decisions. If needs_tools=no, the brief must be answerable from knowledge alone.
- If is_gated=yes, PLAN must start with an explicit VERIFY phase that ends with a go/no-go report, and the build phase must say "proceed ONLY if verification passed".
- If needs_tests=yes and the task changes code, PLAN must include writing or updating tests.
- If thinking=high, tell the executor to reason carefully and consider alternatives before acting.
- Keep it tight. No preamble, no flattery, just the brief.`;

export async function generateInstructions(
  state: BuiltState,
  decision: Decision,
  phase: 'full' | 'verify-only' = 'full',
): Promise<string> {
  const phaseNote =
    phase === 'verify-only'
      ? '\nIMPORTANT: Write ONLY the verification/check phase. Do NOT include any implementation steps. End with a go/no-go report listing each prerequisite and whether it holds.'
      : '';

  const { text } = await generateText({
    model: omlx.chatModel(config.omlxModel),
    system: SYSTEM,
    prompt: `USER DIRECTIVE:\n${state.request}\n\nREFERENCE CONTEXT:\n${state.references || '(none)'}\n\nTYPED DECISIONS:\n${decisionSummary(decision)}\n\nDerived routing: task_type=${choice(decision, 'task_type')}, complexity=${choice(decision, 'complexity')}, scope=${choice(decision, 'scope')}, destructive=${yes(decision, 'destructive') ? 'YES' : 'no'}.${phaseNote}`,
    maxOutputTokens: 1200,
    temperature: 0.2,
  });

  return text.trim();
}

/** Direct local execution for trivial, tool-free tasks (no cloud involved). */
export async function runLocal(prompt: string): Promise<string> {
  const { text } = await generateText({
    model: omlx.chatModel(config.omlxModel),
    prompt,
    maxOutputTokens: 1500,
    temperature: 0.3,
  });
  return text.trim();
}
