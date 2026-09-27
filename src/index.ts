#!/usr/bin/env node
import { run, type RunOptions } from './pipeline.js';
import type { Tier } from './execute.js';

function usage(): never {
  console.error(`Usage:
  dispatch "your directive in plain english" [options]

Options:
  --dry            Show state + decisions only; generate nothing, execute nothing
  --auto           Auto-approve gates and confirmations (non-interactive)
  --tier <t>       Override routing: local | cheap | flagship

Examples:
  dispatch "take a look at issue #134. are all prerequisites in place? if so, let's begin implementing"
  dispatch --dry "is the webhook retry logic already covered by tests?"
`);
  process.exit(1);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const opts: RunOptions = {};
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry') opts.dry = true;
    else if (a === '--auto') opts.auto = true;
    else if (a === '--tier') {
      const t = argv[++i];
      if (t !== 'local' && t !== 'cheap' && t !== 'flagship') usage();
      opts.tierOverride = t as Tier;
    } else if (a === '--help' || a === '-h') usage();
    else positional.push(a);
  }

  const prompt = positional.join(' ').trim();
  if (!prompt) usage();

  await run(prompt, opts);
}

main().catch((err) => {
  console.error('\n✖', err instanceof Error ? err.message : err);
  process.exit(1);
});
