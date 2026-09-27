import * as readline from 'node:readline';
import { config } from './config.js';
import { buildState } from './state-builder.js';
import { applyConfidenceEscalation, decide } from './decide.js';
import { generateInstructions } from './instruct.js';
import { execute, type Tier } from './execute.js';
import { logDecision } from './log.js';
import { choice, conf, yes, type Decision } from './schema.js';

export interface RunOptions {
  dry?: boolean;
  auto?: boolean;
  tierOverride?: Tier;
}

/**
 * The full pipeline:
 *   natural language -> enriched state -> typed decisions (Laya/Jev)
 *   -> local instruction brief -> gated, routed execution
 */
export async function run(prompt: string, opts: RunOptions = {}): Promise<void> {
  console.log('▸ Building state…');
  const state = await buildState(prompt);

  console.log('▸ Asking decision model…');
  const decision: Decision = await decide(state.asObject);

  let tier: Tier = opts.tierOverride ?? applyConfidenceEscalation(decision);

  printDecisions(decision, tier);
  await logDecision({ prompt, tier, decision, usage: decision.usage });

  if (opts.dry) {
    console.log('\n(dry run — no instructions generated, nothing executed)');
    return;
  }

  // Intent-routing pattern: if we can't confidently classify the intent,
  // ask the human instead of guessing and spending on the wrong handler.
  if (!opts.auto && conf(decision, 'task_type') < config.intentClarifyThreshold) {
    const probs = decision.answers.task_type.probabilities;
    const top = probs
      ? Object.entries(probs)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([k, v]) => `${k} (${v.toFixed(2)})`)
          .join(', ')
      : choice(decision, 'task_type');
    console.log(`\n⚠ Low confidence on intent. Candidates: ${top}`);
    const ok = await confirm(
      `Proceed as "${choice(decision, 'task_type')}"?`,
    );
    await logDecision({
      prompt,
      tier,
      decision,
      usage: decision.usage,
      note: `intent clarification: proceed=${ok}`,
    });
    if (!ok) {
      console.log('Aborted — try rephrasing the directive.');
      return;
    }
  }

  // Gated flow: "check prerequisites first, if ok then implement."
  // The gate is enforced by the harness, not left to the executor's vibes.
  if (yes(decision, 'is_gated')) {
    console.log('\n▸ Gated task: running verification phase first…');
    const verifyBrief = await generateInstructions(state, decision, 'verify-only');
    console.log('\n── verification brief ──\n' + verifyBrief + '\n────────────────────────');
    const verdict = await execute(tier, verifyBrief, decision);
    console.log('\n── verification result ──\n' + verdict + '\n───────────────────────────');

    const proceed =
      opts.auto || config.autoApproveGates || (await confirm('Verification done. Proceed with the main task?'));
    await logDecision({ prompt, tier, decision, usage: decision.usage, note: `gate verdict shown; proceed=${proceed}` });
    if (!proceed) {
      console.log('Stopped at gate. No further action taken.');
      return;
    }
  }

  console.log(`\n▸ Generating instructions (local model)…`);
  const brief = await generateInstructions(state, decision, 'full');

  console.log(`▸ Executing on tier "${tier}"…`);
  const result = await execute(tier, brief, decision);
  console.log('\n════════ result ════════\n' + result + '\n═══════════════════════');
}

function printDecisions(d: Decision, tier: Tier): void {
  console.log('\n── decisions ──');
  for (const [k, a] of Object.entries(d.answers)) {
    const v = typeof a.value === 'boolean' ? (a.value ? 'yes' : 'no') : a.value;
    const p = a.probability !== undefined ? `, p=${a.probability.toFixed(2)}` : '';
    console.log(`  ${k}: ${v} (${a.confidence.toFixed(2)}${p})`);
  }
  console.log(`  → tier: ${tier}  (task=${choice(d, 'task_type')}, complexity=${choice(d, 'complexity')}, thinking=${choice(d, 'thinking')}, tools=${yes(d, 'needs_tools') ? 'yes' : 'no'}, destructive p=${(d.answers.destructive.probability ?? 0).toFixed(2)})`);
  console.log(`  → decision tokens: ${d.usage.input_tokens} in / ${d.usage.output_tokens} out`);
  if (conf(d, 'model_tier') < config.confidenceThreshold) {
    console.log('  ⚠ low tier confidence — escalated one level');
  }
  console.log('─────────────────');
}

function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${question} [y/N] `, (ans) => {
      rl.close();
      resolve(/^y(es)?$/i.test(ans.trim()));
    });
  });
}
