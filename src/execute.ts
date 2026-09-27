import { spawn } from 'node:child_process';
import * as readline from 'node:readline';
import { config } from './config.js';
import { runLocal } from './instruct.js';
import { choice, type Decision } from './schema.js';

export type Tier = 'local' | 'cheap' | 'flagship';

/**
 * Execution layer. The dispatcher decides; these harnesses do.
 * Shells out to the CLIs you already have installed — their auth,
 * tools, and permissions stay exactly as you configured them.
 *
 * Adjust the argv below if your CLIs' non-interactive syntax differs.
 */

async function runCli(
  cmd: string,
  args: string[],
  stdin: string,
): Promise<string> {
  // The brief travels via stdin: no shell-quoting issues, no argv length limits.
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${cmd} timed out after 30m`));
    }, 30 * 60_000);

    child.stdout.on('data', (d: Buffer) => {
      out += d.toString();
    });
    child.stderr.on('data', (d: Buffer) => {
      err += d.toString();
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out.trim());
      else reject(new Error(`${cmd} exited ${code}: ${err.slice(0, 1000)}`));
    });

    child.stdin.write(stdin);
    child.stdin.end();
  });
}

function ask(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(`${question} [y/N] `, (ans) => {
      rl.close();
      resolve(/^y(es)?$/i.test(ans.trim()));
    });
  });
}

export async function execute(
  tier: Tier,
  instructions: string,
  decision: Decision,
): Promise<string> {
  // Safety gate: destructive work needs explicit approval unless auto-approved.
  // Gates on the RAW probability, not the boolean: a 0.49 "probably not
  // destructive" is still a coin flip on something irreversible, so it confirms.
  const destructiveP =
    decision.answers.destructive.probability ??
    (decision.answers.destructive.value === true ? 1 : 0);
  if (
    destructiveP >= config.destructiveConfirmProbability &&
    !config.autoApproveDestructive
  ) {
    console.log(
      `\n⚠️  P(destructive) = ${destructiveP.toFixed(2)} — flagged as potentially destructive.\n`,
    );
    const ok = await ask('Proceed with execution?');
    if (!ok) throw new Error('Aborted by user (destructive gate).');
  }

  const thinking = choice(decision, 'thinking');
  const effortNote =
    thinking === 'high'
      ? '\n\n(Effort: think carefully step by step before acting.)'
      : thinking === 'low'
        ? '\n\n(Effort: brief reasoning, then act.)'
        : '';

  const brief = instructions + effortNote;

  switch (tier) {
    case 'local':
      // No tools, no cloud: answer directly with the local model.
      return runLocal(
        `Answer the following directly and concisely:\n\n${brief}`,
      );
    case 'cheap':
      // Codex CLI, non-interactive.
      return runCli('codex', ['exec', '--skip-git-repo-check'], brief);
    case 'flagship':
      // Claude Code, non-interactive print mode.
      return runCli('claude', ['-p', '--output-format', 'text'], brief);
  }
}
